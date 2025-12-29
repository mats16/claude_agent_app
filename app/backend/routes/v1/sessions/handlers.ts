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
  getSessionById,
  getSessionsByUserId,
  updateSession,
  archiveSession,
  updateClaudeCodeSessionId,
} from '../../../db/sessions.js';
import { getSettingsDirect } from '../../../db/settings.js';
import { upsertUser } from '../../../db/users.js';
import { enqueueDelete } from '../../../services/workspaceQueueService.js';
import { getUserPersonalAccessToken } from '../../../services/userService.js';
import { extractRequestContext } from '../../../utils/headers.js';
import { ClaudeSettings } from '../../../models/ClaudeSettings.js';
import { Session } from '../../../models/Session.js';
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
    databricksAppAutoDeploy?: boolean;
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
  const databricksAppAutoDeploy =
    session_context.databricksAppAutoDeploy ?? false;

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
  let claudeCodeSessionId = '';
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

  // Create Session model with TypeID and local directory
  const session = new Session();
  session.ensureLocalDir();
  console.log(
    `[New Session] Created session: ${session.id}, localPath: ${session.localPath}`
  );

  // Create settings.json with workspace sync hooks for all sessions
  const claudeSettings = new ClaudeSettings({
    workspacePath: databricksWorkspacePath,
    workspaceAutoPush: databricksWorkspaceAutoPush,
    appAutoDeploy: databricksAppAutoDeploy,
    claudeConfigAutoPush,
  });
  claudeSettings.save(session.localPath);

  const startAgentProcessing = async () => {
    // Create MessageStream for this session
    // Note: workspace sync is now handled by settings.json hooks
    const stream = new MessageStream(messageContent);

    // Get user's PAT if configured (for Databricks CLI operations)
    const userPersonalAccessToken = await getUserPersonalAccessToken(userId);

    // Start processing in background
    const agentIterator = processAgentRequest(
      messageContent,
      model,
      {
        databricksWorkspaceAutoPush,
        claudeConfigAutoPush,
        databricksAppAutoDeploy,
        sessionId: session.id,
        sessionLocalPath: session.localPath,
        sessionAppName: session.appName,
        sessionGitBranch: session.gitBranch,
      },
      undefined,
      user,
      databricksWorkspacePath,
      stream,
      userPersonalAccessToken
    );

    // Process events in background
    (async () => {
      try {
        let userMessageSaved = false;
        let sessionSaved = false;
        for await (const sdkMessage of agentIterator) {
          // Extract Claude Code session ID from init message
          if (
            sdkMessage.type === 'system' &&
            'subtype' in sdkMessage &&
            sdkMessage.subtype === 'init'
          ) {
            claudeCodeSessionId = sdkMessage.session_id;
            session.setClaudeCodeSessionId(claudeCodeSessionId);
            getOrCreateQueue(session.id);

            // Store MessageStream for this session (for interactive messaging)
            sessionMessageStreams.set(session.id, stream);

            // Ensure user exists before creating session
            await upsertUser(userId, user.email);

            // Save session to database with our TypeID
            // Title is null initially, will be auto-generated from structured output
            const sessionTitle = null;
            await createSession(
              {
                id: session.id,
                claudeCodeSessionId,
                title: sessionTitle,
                model,
                databricksWorkspacePath,
                userId,
                databricksWorkspaceAutoPush,
                databricksAppAutoDeploy,
              },
              userId
            );
            sessionSaved = true;

            // Notify session list WebSocket listeners
            notifySessionCreated(userId, {
              id: session.id,
              claudeCodeSessionId,
              title: sessionTitle,
              databricksWorkspacePath: databricksWorkspacePath ?? null,
              databricksWorkspaceAutoPush,
              databricksAppAutoDeploy,
              updatedAt: new Date().toISOString(),
            });

            // Trigger async title generation (supports both text and images)
            void generateTitleAsync({
              sessionId: session.id,
              messageContent,
              userId,
              userAccessToken: userPersonalAccessToken,
            });

            resolveInit?.();

            // Save user message after session is created
            if (!userMessageSaved) {
              const userMsg = createUserMessage(session.id, messageContent);
              await saveMessage(userMsg);
              addEventToQueue(session.id, userMsg);
              userMessageSaved = true;
            }
          }

          // Save all messages to database (use our session ID for events)
          if (sessionSaved) {
            await saveMessage(sdkMessage);
            addEventToQueue(session.id, sdkMessage);
          }
        }
      } catch (error: any) {
        console.error('Error processing agent request:', error);

        // If init message was not received yet, retry or reject
        if (!claudeCodeSessionId) {
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
        if (claudeCodeSessionId) {
          markQueueCompleted(session.id);
          // Cleanup MessageStream
          sessionMessageStreams.delete(session.id);
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

  return {
    session_id: session.id,
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
  const sessionList = await getSessionsByUserId(userId, filter);

  return { sessions: sessionList };
}

// Update session handler
export async function updateSessionHandler(
  request: FastifyRequest<{
    Params: { sessionId: string };
    Body: {
      title?: string;
      databricks_workspace_auto_push?: boolean;
      databricks_workspace_path?: string | null;
      databricks_app_auto_deploy?: boolean;
    };
  }>,
  reply: FastifyReply
) {
  const { sessionId } = request.params;
  const {
    title,
    databricks_workspace_auto_push: databricksWorkspaceAutoPush,
    databricks_workspace_path: databricksWorkspacePath,
    databricks_app_auto_deploy: databricksAppAutoDeploy,
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
    databricksWorkspacePath === undefined &&
    databricksAppAutoDeploy === undefined
  ) {
    return reply.status(400).send({
      error:
        'title, databricks_workspace_auto_push, databricks_workspace_path, or databricks_app_auto_deploy is required',
    });
  }

  const updates: {
    title?: string;
    databricksWorkspaceAutoPush?: boolean;
    databricksWorkspacePath?: string | null;
    databricksAppAutoDeploy?: boolean;
  } = {};
  if (title !== undefined) updates.title = title;
  if (databricksAppAutoDeploy !== undefined)
    updates.databricksAppAutoDeploy = databricksAppAutoDeploy;
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
    const session = await getSessionById(sessionId, userId);
    const finalWorkspacePath =
      updates.databricksWorkspacePath ?? session?.databricksWorkspacePath;
    if (finalWorkspacePath && finalWorkspacePath.trim()) {
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
  const dbSession = await getSessionById(sessionId, userId);
  if (!dbSession) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  // Reconstruct Session model from TypeID to get paths
  const sessionModel = Session.fromString(dbSession.id);

  // Archive the session in database
  await archiveSession(sessionId, userId);

  // Delete working directory in background
  console.log(`[Archive] Enqueueing deletion of: ${sessionModel.localPath}`);
  enqueueDelete({
    userId,
    localPath: sessionModel.localPath,
  });

  // Delete Databricks App if databricksAppAutoDeploy was enabled
  if (dbSession.databricksAppAutoDeploy) {
    const appName = sessionModel.appName;
    try {
      const userPat = await getUserPersonalAccessToken(userId);
      const accessToken = userPat ?? (await getAccessToken());

      const response = await fetch(
        `${databricks.hostUrl}/api/2.0/apps/${encodeURIComponent(appName)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (response.ok || response.status === 404) {
        console.log(`[Archive] Deleted app: ${appName}`);
      } else {
        const data = await response.json();
        console.error(`[Archive] Failed to delete app ${appName}:`, data);
      }
    } catch (error) {
      console.error(`[Archive] Error deleting app ${appName}:`, error);
    }
  }

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
  const session = await getSessionById(sessionId, userId);
  if (!session) {
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
  const dbSession = await getSessionById(sessionId, userId);
  if (!dbSession) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  // Reconstruct Session model from TypeID to get app name
  const sessionModel = Session.fromString(dbSession.id);
  const appName = sessionModel.appName;

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

  const dbSession = await getSessionById(sessionId, userId);
  if (!dbSession) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  const sessionModel = Session.fromString(dbSession.id);
  const appName = sessionModel.appName;

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

  const dbSession = await getSessionById(sessionId, userId);
  if (!dbSession) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  const sessionModel = Session.fromString(dbSession.id);
  const appName = sessionModel.appName;

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

  const dbSession = await getSessionById(sessionId, userId);
  if (!dbSession) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  const sessionModel = Session.fromString(dbSession.id);
  const appName = sessionModel.appName;

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
  if (dbSession.databricksWorkspacePath) {
    deploymentBody.source_code_path = dbSession.databricksWorkspacePath;
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
  const dbSession = await getSessionById(sessionId, userId);
  if (!dbSession) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  // Reconstruct Session model from TypeID to get paths
  const sessionModel = Session.fromString(dbSession.id);

  // Get workspace_url if databricksWorkspacePath is set
  let workspaceUrl: string | null = null;
  if (dbSession.databricksWorkspacePath) {
    try {
      const status = await workspaceService.getStatus(
        dbSession.databricksWorkspacePath
      );
      workspaceUrl = status.browse_url;
    } catch (error) {
      // Log error but don't fail the request
      console.error('Failed to get workspace status:', error);
    }
  }

  // Build response in snake_case format
  const response: Record<string, unknown> = {
    id: dbSession.id,
    claude_code_session_id: dbSession.claudeCodeSessionId,
    title: dbSession.title,
    summary: dbSession.summary,
    databricks_workspace_path: dbSession.databricksWorkspacePath,
    databricks_workspace_url: workspaceUrl,
    databricks_workspace_auto_push: dbSession.databricksWorkspaceAutoPush,
    databricks_app_auto_deploy: dbSession.databricksAppAutoDeploy,
    local_path: sessionModel.localPath,
    is_archived: dbSession.isArchived,
    model: dbSession.model,
    created_at: dbSession.createdAt.toISOString(),
    updated_at: dbSession.updatedAt.toISOString(),
  };

  // Only include databricks_app_name and console_url when databricks_app_auto_deploy is true
  if (dbSession.databricksAppAutoDeploy) {
    response.databricks_app_name = sessionModel.appName;
    response.console_url = `https://${databricks.host}/apps/${sessionModel.appName}`;
  }

  return response;
}
