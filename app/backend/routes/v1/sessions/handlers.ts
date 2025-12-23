import type { FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import fs from 'fs';
import type { MessageContent } from '@app/shared';
import { processAgentRequest, MessageStream } from '../../../agent/index.js';
import { saveMessage, getMessagesBySessionId } from '../../../db/events.js';
import {
  createSession,
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
import { writeClaudeSettings } from '../../../utils/claudeSettings.js';
import { generateSessionStub } from '../../../utils/stub.js';
import {
  sessionMessageStreams,
  notifySessionCreated,
  getOrCreateQueue,
  addEventToQueue,
  markQueueCompleted,
  createUserMessage,
} from '../../../services/sessionState.js';

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
    workspacePath?: string;
    workspaceAutoPush?: boolean;
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

  const { userId, userEmail, userName, accessToken } = context;

  // Extract first user message
  const userEvent = events.find((e) => e.type === 'user');
  if (!userEvent) {
    return reply.status(400).send({ error: 'No user message found' });
  }

  const userMessage = userEvent.message.content;
  const model = session_context.model;
  const workspacePath = session_context.workspacePath;
  // Force workspaceAutoPush to false if workspacePath is not specified
  const workspaceAutoPush =
    workspacePath && workspacePath.trim()
      ? (session_context.workspaceAutoPush ?? false)
      : false;
  const appAutoDeploy = session_context.appAutoDeploy ?? false;

  // Get user settings for claudeConfigAutoPush (still needed for agent hook)
  const userSettings = await getSettingsDirect(userId);
  const claudeConfigAutoPush = userSettings?.claudeConfigAutoPush ?? true;

  // Compute paths (same logic as in agent/index.ts)
  const localBasePath = path.join(process.env.HOME ?? '/tmp', 'u');
  const localClaudeConfigPath = path.join(localBasePath, userEmail, '.claude');

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

  // Generate unique stub for workDir and create it before starting agent
  const sessionStub = generateSessionStub();
  const localWorkPath = path.join(localBasePath, userEmail, 's', sessionStub);
  console.log(
    `[New Session] Creating workDir with stub: ${sessionStub}, path: ${localWorkPath}`
  );
  fs.mkdirSync(localWorkPath, { recursive: true });

  // Create settings.local.json with workspace sync hooks if workspacePath is provided
  if (workspacePath && workspacePath.trim()) {
    writeClaudeSettings(localWorkPath);
  }

  const startAgentProcessing = async () => {
    // Create MessageStream for this session
    // Note: workspace sync is now handled by settings.local.json hooks
    const stream = new MessageStream(messageContent);

    // Get user's PAT if configured (for Databricks CLI operations)
    const userPersonalAccessToken = await getUserPersonalAccessToken(userId);

    // Start processing in background
    const agentIterator = processAgentRequest(
      messageContent,
      model,
      {
        workspaceAutoPush,
        claudeConfigAutoPush,
        cwd: localWorkPath,
        appAutoDeploy,
        sessionStub,
      },
      undefined,
      userEmail,
      workspacePath,
      stream,
      accessToken,
      userId,
      userPersonalAccessToken,
      userName
    );

    // Process events in background
    (async () => {
      try {
        let userMessageSaved = false;
        for await (const sdkMessage of agentIterator) {
          // Extract sessionId from init message
          if (
            sdkMessage.type === 'system' &&
            'subtype' in sdkMessage &&
            sdkMessage.subtype === 'init'
          ) {
            sessionId = sdkMessage.session_id;
            getOrCreateQueue(sessionId);

            // Store MessageStream for this session (for interactive messaging)
            sessionMessageStreams.set(sessionId, stream);

            // Ensure user exists before creating session
            await upsertUser(userId, userEmail);

            // Save session to database
            // Use default title
            const sessionTitle = 'Untitled';
            await createSession(
              {
                id: sessionId,
                stub: sessionStub,
                title: sessionTitle,
                model,
                workspacePath,
                userId,
                workspaceAutoPush,
                appAutoDeploy,
                cwd: localWorkPath,
              },
              userId
            );

            // Notify session list WebSocket listeners
            notifySessionCreated(userId, {
              id: sessionId,
              title: sessionTitle,
              workspacePath: workspacePath ?? null,
              workspaceAutoPush,
              appAutoDeploy,
              updatedAt: new Date().toISOString(),
            });

            resolveInit?.();

            // Save user message after getting sessionId
            if (!userMessageSaved) {
              const userMsg = createUserMessage(sessionId, messageContent);
              await saveMessage(userMsg);
              addEventToQueue(sessionId, userMsg);
              userMessageSaved = true;
            }
          }

          // Save all messages to database
          if (sessionId) {
            await saveMessage(sdkMessage);
            addEventToQueue(sessionId, sdkMessage);
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
        if (sessionId) {
          markQueueCompleted(sessionId);
          // Cleanup MessageStream
          sessionMessageStreams.delete(sessionId);
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
    session_id: sessionId,
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

  const { userId } = context;
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
      workspaceAutoPush?: boolean;
      workspacePath?: string | null;
      appAutoDeploy?: boolean;
    };
  }>,
  reply: FastifyReply
) {
  const { sessionId } = request.params;
  const { title, workspaceAutoPush, workspacePath, appAutoDeploy } =
    request.body;

  let context;
  try {
    context = extractRequestContext(request);
  } catch (error: any) {
    return reply.status(400).send({ error: error.message });
  }

  const { userId } = context;

  // At least one field must be provided
  if (
    title === undefined &&
    workspaceAutoPush === undefined &&
    workspacePath === undefined &&
    appAutoDeploy === undefined
  ) {
    return reply.status(400).send({
      error:
        'title, workspaceAutoPush, workspacePath, or appAutoDeploy is required',
    });
  }

  const updates: {
    title?: string;
    workspaceAutoPush?: boolean;
    workspacePath?: string | null;
    appAutoDeploy?: boolean;
  } = {};
  if (title !== undefined) updates.title = title;
  if (appAutoDeploy !== undefined) updates.appAutoDeploy = appAutoDeploy;
  if (workspacePath !== undefined) {
    updates.workspacePath = workspacePath || null;
    // Force workspaceAutoPush to false when workspacePath is cleared
    if (!workspacePath || !workspacePath.trim()) {
      updates.workspaceAutoPush = false;
    }
  }
  if (workspaceAutoPush !== undefined) {
    // Only apply workspaceAutoPush if workspacePath is set
    // (either from current update or existing session)
    const session = await getSessionById(sessionId, userId);
    const finalWorkspacePath = updates.workspacePath ?? session?.workspacePath;
    if (finalWorkspacePath && finalWorkspacePath.trim()) {
      updates.workspaceAutoPush = workspaceAutoPush;
    } else {
      updates.workspaceAutoPush = false;
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

  const { userId } = context;

  // Get session to retrieve cwd before archiving
  const session = await getSessionById(sessionId, userId);
  if (!session) {
    return reply.status(404).send({ error: 'Session not found' });
  }

  // Archive the session in database
  await archiveSession(sessionId, userId);

  // Delete working directory in background if it exists
  if (session.cwd) {
    console.log(`[Archive] Enqueueing deletion of: ${session.cwd}`);
    enqueueDelete({
      userId,
      localPath: session.cwd,
    });
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

  const { userId } = context;

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
