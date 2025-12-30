import type { FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import fs from 'fs';
import type { MessageContent } from '@app/shared';
import {
  processAgentRequest,
  MessageStream,
  getAccessToken,
} from '../../../agent/index.js';
import { databricks, paths } from '../../../config/index.js';
import * as workspaceService from '../../../services/workspaceService.js';
import { saveMessage, getMessagesBySessionId } from '../../../db/events.js';
import {
  createSession,
  createSessionFromDraft,
  getSessionById,
  getSessionsByUserId,
  updateSession,
  archiveSession,
} from '../../../db/sessions.js';
import { getSettingsDirect } from '../../../db/settings.js';
import { upsertUser } from '../../../db/users.js';
import { enqueueDelete } from '../../../services/workspaceQueueService.js';
import { getUserPersonalAccessToken } from '../../../services/userService.js';
import { extractRequestContext } from '../../../utils/headers.js';
import { ClaudeSettings } from '../../../models/ClaudeSettings.js';
import { SessionDraft, Session } from '../../../models/Session.js';
import {
  sessionMessageStreams,
  notifySessionCreated,
  getOrCreateQueue,
  addEventToQueue,
  markQueueCompleted,
  createUserMessage,
} from '../../../services/sessionState.js';
import { generateTitleAsync } from '../../../services/titleService.js';

// Types
interface CreateSessionBody {
  events: Array<{
    uuid: string;
    session_id: string;
    type: string;
    message: { role: string; content: MessageContent[] | string };
  }>;
  session_context: {
    model: string;
    databricksWorkspacePath?: string;
    databricksWorkspaceAutoPush?: boolean;
  };
}

// Create session handler
export async function createSessionHandler(
  request: FastifyRequest<{ Body: CreateSessionBody }>,
  reply: FastifyReply
) {
  const { events, session_context } = request.body;

  // Get user info from request headers
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const { user } = context;
  const userId = user.sub;

  // Extract first user message
  const userEvent = events.find((e) => e.type === 'user');
  if (!userEvent) {
    return reply.status(400).send({ error: 'No user message found' });
  }

  const userMessage = userEvent.message.content;
  const model = session_context.model;
  const databricksWorkspacePath = session_context.databricksWorkspacePath;
  // Force databricksWorkspaceAutoPush to false if databricksWorkspacePath is not specified
  const databricksWorkspaceAutoPush =
    databricksWorkspacePath && databricksWorkspacePath.trim()
      ? (session_context.databricksWorkspaceAutoPush ?? false)
      : false;

  // Get user settings for claudeConfigAutoPush (still needed for agent hook)
  const userSettings = await getSettingsDirect(userId);
  const claudeConfigAutoPush = userSettings?.claudeConfigAutoPush ?? true;

  // Compute paths (same logic as in agent/index.ts)
  const localClaudeConfigPath = path.join(
    paths.usersBase,
    user.name,
    '.claude'
  );

  // Ensure claude config directory exists
  fs.mkdirSync(localClaudeConfigPath, { recursive: true });

  // Promise to wait for init message with timeout and error handling
  let sessionId = '';
  let resolveInit: (() => void) | undefined;
  let rejectInit: ((error: Error) => void) | undefined;
  const initReceived = new Promise<void>((resolve, reject) => {
    resolveInit = resolve;
    rejectInit = reject;
  });

  // Retry configuration
  const maxRetries = 3;
  let retryCount = 0;

  // Convert string message to MessageContent[] for processAgentRequest
  const messageContent: MessageContent[] =
    typeof userMessage === 'string'
      ? [{ type: 'text', text: userMessage }]
      : userMessage;

  // Create SessionDraft for new session
  const draft = new SessionDraft({
    userId,
    model,
    databricksWorkspacePath,
    databricksWorkspaceAutoPush,
  });

  // Create working directory
  const localWorkPath = draft.createWorkingDirectory();
  console.log(
    `[New Session] Created workDir with TypeID: ${draft.toString()}, path: ${localWorkPath}`
  );

  // TypeID string for DB storage and API responses
  const appSessionId = draft.toString();

  // Create settings.json with workspace sync hooks for all sessions
  const claudeSettings = new ClaudeSettings({
    workspacePath: databricksWorkspacePath,
    workspaceAutoPush: databricksWorkspaceAutoPush,
    claudeConfigAutoPush,
  });
  claudeSettings.save(localWorkPath);

  const startAgentProcessing = async () => {
    // Create MessageStream for this session
    // Note: workspace sync is now handled by settings.json hooks
    const stream = new MessageStream(messageContent);

    // Get user's PAT if configured (for Databricks CLI operations)
    const userPersonalAccessToken = await getUserPersonalAccessToken(userId);

    // Start processing in background
    const agentIterator = processAgentRequest(
      draft, // Pass SessionDraft - undefined claudeCodeSessionId means new session
      messageContent,
      user,
      {
        claudeConfigAutoPush,
      },
      stream,
      userPersonalAccessToken
    );

    // Process events in background
    (async () => {
      try {
        let userMessageSaved = false;
        for await (const sdkMessage of agentIterator) {
          // Extract SDK session ID from init message
          if (
            sdkMessage.type === 'system' &&
            'subtype' in sdkMessage &&
            sdkMessage.subtype === 'init'
          ) {
            sessionId = sdkMessage.session_id; // SDK session ID for resume
            getOrCreateQueue(appSessionId); // Use TypeID for queue

            // Store MessageStream for this session (for interactive messaging)
            sessionMessageStreams.set(appSessionId, stream); // Use TypeID

            // Ensure user exists before creating session
            await upsertUser(userId, user.email);

            // Convert draft to Session and save to database
            const session = await createSessionFromDraft(
              draft,
              sessionId, // SDK session ID from init message
              userId
            );

            // Notify session list WebSocket listeners
            notifySessionCreated(userId, {
              id: appSessionId,
              title: null, // Title will be generated async
              databricksWorkspacePath: databricksWorkspacePath ?? null,
              databricksWorkspaceAutoPush,
              updatedAt: new Date().toISOString(),
            });

            // Trigger async title generation (supports both text and images)
            void generateTitleAsync({
              sessionId: appSessionId,
              messageContent,
              userId,
              userAccessToken: userPersonalAccessToken,
            });

            resolveInit?.();

            // Save user message after getting SDK session ID
            if (!userMessageSaved) {
              const userMsg = createUserMessage(appSessionId, messageContent);
              await saveMessage(userMsg);
              addEventToQueue(appSessionId, userMsg);
              userMessageSaved = true;
            }
          }

          // Save all messages to database (use appSessionId for all operations)
          if (sessionId) {
            // Override SDK session_id with appSessionId for database consistency
            const messageToSave = {
              ...sdkMessage,
              session_id: appSessionId,
            };
            await saveMessage(messageToSave as any);
            addEventToQueue(appSessionId, messageToSave as any);
          }
        }
      } catch (error: any) {
        console.error('Error processing agent request:', error);

        // If init message was not received yet, retry or reject
        if (!sessionId) {
          retryCount++;
          if (retryCount < maxRetries) {
            console.log(
              `Retrying agent request (attempt ${retryCount + 1}/${maxRetries})...`
            );
            // Small delay before retry
            await new Promise((r) => setTimeout(r, 1000));
            void startAgentProcessing();
          } else {
            rejectInit?.(
              new Error(
                `Agent failed after ${maxRetries} attempts: ${error.message}`
              )
            );
          }
        }
      } finally {
        // Use appSessionId for cleanup (TypeID for app-side operations)
        if (sessionId) {
          markQueueCompleted(appSessionId);
          // Cleanup MessageStream
          sessionMessageStreams.delete(appSessionId);
        }
      }
    })();
  };

  // Start initial processing
  void startAgentProcessing();

  // Wait for init message with timeout
  const timeoutMs = 30000; // 30 seconds timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Timeout waiting for agent init message'));
    }, timeoutMs);
  });

  try {
    await Promise.race([initReceived, timeoutPromise]);
  } catch (error: any) {
    console.error('Failed to initialize agent session:', error.message);
    return reply.status(500).send({ error: error.message });
  }

  // Return TypeID (app session ID) to client
  return {
    session_id: appSessionId,
  };
}

// List sessions handler
export async function listSessionsHandler(
  request: FastifyRequest<{
    Querystring: { filter?: 'active' | 'archived' | 'all' };
  }>,
  reply: FastifyReply
) {
  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const userId = context.user.sub;
  const filter = request.query.filter || 'active';
  const selectSessions = await getSessionsByUserId(userId, filter);

  // Transform to API response format with Session model
  const sessions = selectSessions.map((selectSession) => {
    // Wrap in Session model to access TypeID
    const session = Session.fromSelectSession(selectSession);

    return {
      id: session.toString(),
      title: session.title,
      model: session.model,
      workspacePath: session.databricksWorkspacePath,
      workspaceAutoPush: session.databricksWorkspaceAutoPush,
      appAutoDeploy: false, // TODO: Implement app auto-deploy feature
      updatedAt: session.updatedAt.toISOString(),
      isArchived: session.isArchived,
    };
  });

  return { sessions };
}

// Update session handler
export async function updateSessionHandler(
  request: FastifyRequest<{
    Params: { sessionId: string };
    Body: {
      title?: string;
      workspace_auto_push?: boolean;
      workspace_path?: string | null;
    };
  }>,
  reply: FastifyReply
) {
  const { sessionId } = request.params;
  const {
    title,
    workspace_auto_push: databricksWorkspaceAutoPush,
    workspace_path: databricksWorkspacePath,
  } = request.body;

  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const userId = context.user.sub;

  // At least one field must be provided
  if (
    title === undefined &&
    databricksWorkspaceAutoPush === undefined &&
    databricksWorkspacePath === undefined
  ) {
    return reply.status(400).send({
      error: 'title, workspace_auto_push, or workspace_path is required',
    });
  }

  const updates: {
    title?: string;
    databricksWorkspaceAutoPush?: boolean;
    databricksWorkspacePath?: string | null;
  } = {};
  if (title !== undefined) updates.title = title;
  if (databricksWorkspacePath !== undefined) {
    updates.databricksWorkspacePath = databricksWorkspacePath || null;
    // Force databricksWorkspaceAutoPush to false when databricksWorkspacePath is cleared
    if (!databricksWorkspacePath || !databricksWorkspacePath.trim()) {
      updates.databricksWorkspaceAutoPush = false;
    }
  }
  if (databricksWorkspaceAutoPush !== undefined) {
    // Only apply databricksWorkspaceAutoPush if databricksWorkspacePath is set
    // (either from current update or existing session)
    const selectSession = await getSessionById(sessionId, userId);
    const finalDatabricksWorkspacePath =
      updates.databricksWorkspacePath ?? selectSession?.databricksWorkspacePath;
    if (finalDatabricksWorkspacePath && finalDatabricksWorkspacePath.trim()) {
      updates.databricksWorkspaceAutoPush = databricksWorkspaceAutoPush;
    } else {
      updates.databricksWorkspaceAutoPush = false;
    }
  }

  await updateSession(sessionId, updates, userId);
  return { success: true };
}

// Archive session handler
export async function archiveSessionHandler(
  request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply
) {
  const { sessionId } = request.params;

  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const userId = context.user.sub;

  // Get session before archiving
  const selectSession = await getSessionById(sessionId, userId);
  if (!selectSession) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  // Convert to Session model to get agentLocalPath
  const session = Session.fromSelectSession(selectSession);

  // Archive the session in database
  await archiveSession(sessionId, userId);

  // Delete working directory in background
  console.log(`[Archive] Enqueueing deletion of: ${session.cwd()}`);
  enqueueDelete({
    userId,
    localPath: session.cwd(),
  });

  return { success: true };
}

// Get session events handler
export async function getSessionEventsHandler(
  request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply
) {
  const { sessionId } = request.params;

  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const userId = context.user.sub;

  // Check if session exists and belongs to user
  const selectSession = await getSessionById(sessionId, userId);
  if (!selectSession) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  const events = await getMessagesBySessionId(sessionId);
  const messages = events.map((e) => e.message);

  return {
    data: messages,
    first_id: events.length > 0 ? events[0].uuid : null,
    last_id: events.length > 0 ? events[events.length - 1].uuid : null,
    has_more: false,
  };
}

// Databricks App response type
interface DatabricksAppResponse {
  name: string;
  active_deployment?: {
    deployment_id: string;
    status: {
      state: string;
      message?: string;
    };
  };
  pending_deployment?: {
    deployment_id: string;
    status: {
      state: string;
      message?: string;
    };
  };
  app_status?: {
    state: string;
    message?: string;
  };
  compute_status?: {
    state: string;
    message?: string;
  };
  error_code?: string;
  message?: string;
}

// Get app live status handler
export async function getAppLiveStatusHandler(
  request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply
) {
  const { sessionId } = request.params;

  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const userId = context.user.sub;

  // Check if session exists and belongs to user
  const sessionRecord = await getSessionById(sessionId, userId);
  if (!sessionRecord) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  // Create Session model instance to access helper methods
  const session = (
    await import('../../../models/Session.js')
  ).Session.fromSelectSession(sessionRecord);
  const appName = session.getAppName();

  // Get access token (User PAT first, then fallback to Service Principal)
  let accessToken: string;
  try {
    const userPat = await getUserPersonalAccessToken(userId);
    accessToken = userPat ?? (await getAccessToken());
  } catch (error: any) {
    console.error('Failed to get access token:', error);
    return reply.status(500).send({ error: 'Failed to get access token' });
  }

  // Call Databricks Apps API
  try {
    const response = await fetch(
      `${databricks.hostUrl}/api/2.0/apps/${encodeURIComponent(appName)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = (await response.json()) as DatabricksAppResponse;

    // Handle 404 - App not found
    if (
      response.status === 404 ||
      data.error_code === 'RESOURCE_DOES_NOT_EXIST'
    ) {
      return reply.status(404).send({ error: 'App not found' });
    }

    // Handle other errors
    if (!response.ok || data.error_code) {
      console.error('Databricks API error:', data);
      return reply
        .status(500)
        .send({ error: data.message || 'Failed to get app status' });
    }

    // Format response
    // Use pending_deployment if active_deployment is not available
    const deployment = data.pending_deployment ?? data.active_deployment;
    return {
      app_status: data.app_status
        ? {
            state: data.app_status.state,
            message: data.app_status.message || '',
          }
        : null,
      deployment_status: deployment
        ? {
            deployment_id: deployment.deployment_id,
            state: deployment.status.state,
            message: deployment.status.message || '',
          }
        : null,
      compute_status: data.compute_status
        ? {
            state: data.compute_status.state,
            message: data.compute_status.message || '',
          }
        : null,
    };
  } catch (error: any) {
    console.error('Failed to fetch app status:', error);
    return reply.status(500).send({ error: 'Failed to fetch app status' });
  }
}

// Get app handler (proxy to Databricks Apps API)
export async function getAppHandler(
  request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply
) {
  const { sessionId } = request.params;

  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const userId = context.user.sub;

  const sessionRecord = await getSessionById(sessionId, userId);
  if (!sessionRecord) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  const session = (
    await import('../../../models/Session.js')
  ).Session.fromSelectSession(sessionRecord);
  const appName = session.getAppName();

  let accessToken: string;
  try {
    const userPat = await getUserPersonalAccessToken(userId);
    accessToken = userPat ?? (await getAccessToken());
  } catch (error: any) {
    console.error('Failed to get access token:', error);
    return reply.status(500).send({ error: 'Failed to get access token' });
  }

  try {
    const response = await fetch(
      `${databricks.hostUrl}/api/2.0/apps/${encodeURIComponent(appName)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const body = await response.json();
    return reply.status(response.status).send(body);
  } catch (error: any) {
    console.error('Failed to fetch app:', error);
    return reply.status(500).send({ error: 'Failed to fetch app' });
  }
}

// List app deployments handler (proxy to Databricks Apps API)
export async function listAppDeploymentsHandler(
  request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply
) {
  const { sessionId } = request.params;

  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const userId = context.user.sub;

  const sessionRecord = await getSessionById(sessionId, userId);
  if (!sessionRecord) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  const session = (
    await import('../../../models/Session.js')
  ).Session.fromSelectSession(sessionRecord);
  const appName = session.getAppName();

  let accessToken: string;
  try {
    const userPat = await getUserPersonalAccessToken(userId);
    accessToken = userPat ?? (await getAccessToken());
  } catch (error: any) {
    console.error('Failed to get access token:', error);
    return reply.status(500).send({ error: 'Failed to get access token' });
  }

  try {
    const response = await fetch(
      `${databricks.hostUrl}/api/2.0/apps/${encodeURIComponent(appName)}/deployments`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const body = await response.json();
    return reply.status(response.status).send(body);
  } catch (error: any) {
    console.error('Failed to list app deployments:', error);
    return reply.status(500).send({ error: 'Failed to list app deployments' });
  }
}

// Create app deployment handler (proxy to Databricks Apps API)
export async function createAppDeploymentHandler(
  request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply
) {
  const { sessionId } = request.params;

  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const userId = context.user.sub;

  const sessionRecord = await getSessionById(sessionId, userId);
  if (!sessionRecord) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  const session = (
    await import('../../../models/Session.js')
  ).Session.fromSelectSession(sessionRecord);
  const appName = session.getAppName();

  let accessToken: string;
  try {
    const userPat = await getUserPersonalAccessToken(userId);
    accessToken = userPat ?? (await getAccessToken());
  } catch (error: any) {
    console.error('Failed to get access token:', error);
    return reply.status(500).send({ error: 'Failed to get access token' });
  }

  // Build deployment request body
  const deploymentBody: Record<string, unknown> = {};
  if (sessionRecord.databricksWorkspacePath) {
    deploymentBody.source_code_path = sessionRecord.databricksWorkspacePath;
  }

  try {
    const response = await fetch(
      `${databricks.hostUrl}/api/2.0/apps/${encodeURIComponent(appName)}/deployments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(deploymentBody),
      }
    );

    const body = await response.json();
    return reply.status(response.status).send(body);
  } catch (error: any) {
    console.error('Failed to create app deployment:', error);
    return reply.status(500).send({ error: 'Failed to create app deployment' });
  }
}

// Get session handler
export async function getSessionHandler(
  request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply
) {
  const { sessionId } = request.params;

  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const userId = context.user.sub;

  // Get session from database
  const selectSession = await getSessionById(sessionId, userId);
  if (!selectSession) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  // Convert to Session model to get agentLocalPath
  const session = Session.fromSelectSession(selectSession);

  // Get workspace_url if databricksWorkspacePath is set
  let workspaceUrl: string | null = null;
  if (session.databricksWorkspacePath) {
    try {
      const status = await workspaceService.getStatus(
        session.databricksWorkspacePath
      );
      workspaceUrl = status.browse_url;
    } catch (error) {
      // Log error but don't fail the request
      console.error('Failed to get workspace status:', error);
    }
  }

  // Build response in snake_case format
  const response: Record<string, unknown> = {
    id: session.toString(),
    title: session.title,
    summary: session.summary,
    workspace_path: session.databricksWorkspacePath,
    workspace_url: workspaceUrl,
    workspace_auto_push: session.databricksWorkspaceAutoPush,
    local_path: session.cwd(),
    is_archived: session.isArchived,
    model: session.model,
    created_at: session.createdAt.toISOString(),
    updated_at: session.updatedAt.toISOString(),
  };

  return response;
}
