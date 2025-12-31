import type { FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import fs from 'fs';
import type { MessageContent } from '@app/shared';
import {
  startAgent,
  MessageStream,
  getAccessToken,
} from '../../../services/agent.service.js';
import { databricks, paths } from '../../../config/index.js';
import * as workspaceService from '../../../services/workspace.service.js';
import * as eventService from '../../../services/event.service.js';
import * as eventRepo from '../../../db/events.js';
import * as sessionService from '../../../services/session.service.js';
import * as userSettingsService from '../../../services/user-settings.service.js';
import { ensureUser, getUserPersonalAccessToken } from '../../../services/user.service.js';
import { extractRequestContext } from '../../../utils/headers.js';
import { ClaudeSettings } from '../../../models/ClaudeSettings.js';
import { SessionDraft } from '../../../models/Session.js';
import { SessionNotFoundError } from '../../../errors/ServiceErrors.js';
import {
  sessionMessageStreams,
  notifySessionCreated,
  getOrCreateQueue,
  addEventToQueue,
  markQueueCompleted,
  createUserMessage,
} from '../../../services/session-state.service.js';
import { generateTitleAsync } from '../../../services/session-title.service.js';

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
    appAutoDeploy?: boolean;
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
  const userSettings = await userSettingsService.getUserSettings(userId);
  const claudeConfigAutoPush = userSettings.claudeConfigAutoPush;

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
  const sessionDraft = new SessionDraft({
    userId,
    databricksWorkspacePath,
    databricksWorkspaceAutoPush,
  });

  // Create working directory
  const localWorkPath = sessionDraft.createWorkingDirectory();
  console.log(
    `[New Session] Created workDir with TypeID: ${sessionDraft.toString()}, path: ${localWorkPath}`
  );

  // TypeID string for DB storage and API responses
  const appSessionId = sessionDraft.toString();

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

    // Get user's PAT (used for: 1) startAgent to avoid re-fetching, 2) title generation)
    const userPersonalAccessToken = await getUserPersonalAccessToken(userId);

    // Start processing in background
    const agentIterator = startAgent({
      session: sessionDraft, // Pass SessionDraft - undefined claudeCodeSessionId means new session
      user,
      model, // Model from request
      messageContent,
      claudeConfigAutoPush,
      messageStream: stream,
      userPersonalAccessToken, // Pass to avoid re-fetching inside startAgent
    });

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
            await ensureUser(user);

            // Convert sessionDraft to Session and save to database
            await sessionService.createSessionFromDraft(
              sessionDraft,
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
              await eventService.saveSessionMessage(userMsg);
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
            await eventService.saveSessionMessage(messageToSave as any);
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
  const sessions_list = await sessionService.listUserSessions(userId, filter);

  // Transform to API response format
  const sessions = sessions_list.map((session) => ({
    id: session.toString(),
    title: session.title,
    workspacePath: session.databricksWorkspacePath,
    workspaceAutoPush: session.databricksWorkspaceAutoPush,
    appAutoDeploy: false, // TODO: Implement app auto-deploy feature
    updatedAt: session.updatedAt.toISOString(),
    isArchived: session.isArchived,
  }));

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
  }
  if (databricksWorkspaceAutoPush !== undefined) {
    updates.databricksWorkspaceAutoPush = databricksWorkspaceAutoPush;
  }

  // Service layer handles validation and business logic
  await sessionService.updateSessionSettings(sessionId, userId, updates);
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

  try {
    // Archive session and enqueue cleanup
    await sessionService.archiveSessionWithCleanup(sessionId, userId);
    return { success: true };
  } catch (error: any) {
    if (error instanceof SessionNotFoundError) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    throw error;
  }
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

  try {
    // getSessionMessages includes session ownership check
    const response = await eventService.getSessionMessages(sessionId, userId);

    return {
      data: response.messages,
      first_id: response.first_id,
      last_id: response.last_id,
      has_more: false, // TODO: Implement pagination
    };
  } catch (error: any) {
    if (error instanceof SessionNotFoundError) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    throw error;
  }
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

  // Get session (includes ownership check)
  const session = await sessionService.getSession(sessionId, userId);
  if (!session) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  const appName = session.appName;

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

  const session = await sessionService.getSession(sessionId, userId);
  if (!session) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  const appName = session.appName;

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

  const session = await sessionService.getSession(sessionId, userId);
  if (!session) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  const appName = session.appName;

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

  const session = await sessionService.getSession(sessionId, userId);
  if (!session) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  const appName = session.appName;

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
  if (session.databricksWorkspacePath) {
    deploymentBody.source_code_path = session.databricksWorkspacePath;
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

  // Get session from database (includes ownership check)
  const session = await sessionService.getSession(sessionId, userId);
  if (!session) {
    return reply.status(404).send({ error: 'Session not found' });
  }

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

  // Get last used model from events (init or result events)
  const lastUsedModel = await eventRepo.getLastUsedModel(sessionId);

  // Build response in snake_case format
  const response: Record<string, unknown> = {
    id: session.toString(),
    title: session.title,
    summary: session.summary,
    workspace_path: session.databricksWorkspacePath,
    workspace_url: workspaceUrl,
    workspace_auto_push: session.databricksWorkspaceAutoPush,
    local_path: session.cwd,
    is_archived: session.isArchived,
    last_used_model: lastUsedModel,
    created_at: session.createdAt.toISOString(),
    updated_at: session.updatedAt.toISOString(),
  };

  return response;
}
