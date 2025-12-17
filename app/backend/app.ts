import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  processAgentRequest,
  SDKMessage,
  getAccessToken,
  databricksHost,
} from './agent/index.js';
import { saveMessage, getMessagesBySessionId } from './db/events.js';
import {
  createSession,
  getSessionById,
  getSessionByIdDirect,
  getSessionsByUserId,
  updateSession,
} from './db/sessions.js';
import {
  getSettings,
  getSettingsDirect,
  upsertSettings,
} from './db/settings.js';
import { upsertUser } from './db/users.js';
import { syncToWorkspace } from './utils/workspace-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from parent directory (.env or ../.env)
dotenv.config({ path: path.join(__dirname, '../.env') });

const fastify = Fastify({
  logger: true,
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8000;

// Default user ID and email for local development (when headers are not present)
const DEFAULT_USER_ID = '3635764964872574@5099015744649857';
const DEFAULT_USER_EMAIL = 'kazuki.matsuda@databricks.com';

// Session event queue for streaming events to WebSocket
interface SessionQueue {
  events: SDKMessage[];
  listeners: Set<(event: SDKMessage) => void>;
  completed: boolean;
}

const sessionQueues = new Map<string, SessionQueue>();

// User session list WebSocket connections (for real-time session list updates)
import type { WebSocket as WsWebSocket } from 'ws';
const userSessionListeners = new Map<string, Set<WsWebSocket>>();

// Notify user's session list listeners about session creation
function notifySessionCreated(
  userId: string,
  session: {
    id: string;
    title: string;
    workspacePath: string | null;
    updatedAt: string;
  }
) {
  const listeners = userSessionListeners.get(userId);
  if (!listeners) return;

  const message = JSON.stringify({
    type: 'session_created',
    session,
  });

  for (const ws of listeners) {
    try {
      ws.send(message);
    } catch (error) {
      console.error('Failed to send session_created notification:', error);
    }
  }
}

function getOrCreateQueue(sessionId: string): SessionQueue {
  let queue = sessionQueues.get(sessionId);
  if (!queue) {
    queue = { events: [], listeners: new Set(), completed: false };
    sessionQueues.set(sessionId, queue);
  }
  return queue;
}

function addEventToQueue(sessionId: string, event: SDKMessage) {
  const queue = getOrCreateQueue(sessionId);
  queue.events.push(event);
  // Notify all listeners
  queue.listeners.forEach((listener) => listener(event));
}

function markQueueCompleted(sessionId: string) {
  const queue = sessionQueues.get(sessionId);
  if (queue) {
    queue.completed = true;
  }
}

// Create SDKMessage for user message (supports text and image content)
import type { MessageContent } from '@app/shared';

function createUserMessage(
  sessionId: string,
  content: MessageContent[]
): SDKMessage {
  // Convert MessageContent[] to API format
  const apiContent = content.map((c) => {
    if (c.type === 'text') {
      return { type: 'text' as const, text: c.text };
    } else {
      return {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: c.source.media_type,
          data: c.source.data,
        },
      };
    }
  });

  return {
    type: 'user',
    session_id: sessionId,
    uuid: crypto.randomUUID(),
    message: {
      role: 'user',
      content: apiContent,
    },
  } as SDKMessage;
}

// Register WebSocket plugin
await fastify.register(websocket);

// Register static file serving for frontend
await fastify.register(staticPlugin, {
  root: path.join(__dirname, '../../frontend/dist'),
  prefix: '/',
});

// Health check endpoint
fastify.get('/api/health', async () => {
  return {
    status: 'ok',
    service: 'Fastify Backend with Claude Agent',
  };
});

// Hello endpoint
fastify.get('/api/hello', async () => {
  return {
    message: 'Hello from Fastify Backend!',
    timestamp: new Date().toISOString(),
  };
});

// Create session endpoint - returns immediately after init message
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
    overwrite?: boolean;
    autoWorkspacePush?: boolean;
  };
}

fastify.post<{ Body: CreateSessionBody }>(
  '/api/v1/sessions',
  async (request, reply) => {
    const { events, session_context } = request.body;

    // Get user info from request headers
    const userEmail =
      (request.headers['x-forwarded-email'] as string | undefined) ||
      DEFAULT_USER_EMAIL;
    const userId =
      (request.headers['x-forwarded-user'] as string | undefined) ||
      DEFAULT_USER_ID;

    // Extract first user message
    const userEvent = events.find((e) => e.type === 'user');
    if (!userEvent) {
      return reply.status(400).send({ error: 'No user message found' });
    }

    const userMessage = userEvent.message.content;
    const model = session_context.model;
    const workspacePath = session_context.workspacePath;
    const overwrite = session_context.overwrite ?? false;
    const autoWorkspacePush = session_context.autoWorkspacePush ?? false;

    // Get user settings for claudeConfigSync
    const userSettings = await getSettingsDirect(userId);
    const claudeConfigSync = userSettings?.claudeConfigSync ?? true;

    // Note: workspace export-dir is now handled by SessionStart hook in agent/hooks.ts

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

    const startAgentProcessing = () => {
      // Start processing in background
      const agentIterator = processAgentRequest(
        messageContent,
        model,
        undefined,
        userEmail,
        workspacePath,
        { overwrite, autoWorkspacePush, claudeConfigSync }
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

              // Ensure user exists before creating session
              await upsertUser(userId, userEmail);

              // Save session to database
              // Extract title from message content
              const sessionTitle = (
                messageContent.find((c) => c.type === 'text')?.text ??
                'New Session'
              ).slice(0, 100);
              await createSession(
                {
                  id: sessionId,
                  title: sessionTitle,
                  model,
                  workspacePath,
                  userId,
                  autoWorkspacePush,
                },
                userId
              );

              // Notify session list WebSocket listeners
              notifySessionCreated(userId, {
                id: sessionId,
                title: sessionTitle,
                workspacePath: workspacePath ?? null,
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
              startAgentProcessing();
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
          }
        }
      })();
    };

    // Start initial processing
    startAgentProcessing();

    // Wait for init message with timeout
    const timeoutMs = 60000; // 60 seconds timeout
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
);

// Get all sessions for the current user
fastify.get('/api/v1/sessions', async (request, _reply) => {
  const userId =
    (request.headers['x-forwarded-user'] as string | undefined) ||
    DEFAULT_USER_ID;

  const sessionList = await getSessionsByUserId(userId);

  return { sessions: sessionList };
});

// Update session settings (title, autoWorkspacePush)
fastify.patch<{
  Params: { sessionId: string };
  Body: { title?: string; autoWorkspacePush?: boolean };
}>('/api/v1/sessions/:sessionId', async (request, reply) => {
  const { sessionId } = request.params;
  const { title, autoWorkspacePush } = request.body;
  const userId =
    (request.headers['x-forwarded-user'] as string | undefined) ||
    DEFAULT_USER_ID;

  // At least one field must be provided
  if (title === undefined && autoWorkspacePush === undefined) {
    return reply
      .status(400)
      .send({ error: 'title or autoWorkspacePush is required' });
  }

  const updates: { title?: string; autoWorkspacePush?: boolean } = {};
  if (title !== undefined) updates.title = title;
  if (autoWorkspacePush !== undefined)
    updates.autoWorkspacePush = autoWorkspacePush;

  await updateSession(sessionId, updates, userId);
  return { success: true };
});

// Get session events from database
fastify.get<{ Params: { sessionId: string } }>(
  '/api/v1/sessions/:sessionId/events',
  async (request, _reply) => {
    const { sessionId } = request.params;
    const messages = await getMessagesBySessionId(sessionId);
    return { events: messages };
  }
);

// Get current user info (includes workspace permission check)
// Creates user if not exists
fastify.get('/api/v1/users/me', async (request, _reply) => {
  const userId =
    (request.headers['x-forwarded-user'] as string | undefined) ||
    DEFAULT_USER_ID;
  const userEmail =
    (request.headers['x-forwarded-email'] as string | undefined) ||
    DEFAULT_USER_EMAIL;

  // Ensure user exists (create if not)
  await upsertUser(userId, userEmail);

  // Workspace home is derived from user email
  const workspaceHome = userEmail ? `/Workspace/Users/${userEmail}` : null;

  // Check workspace permission by trying to create .claude directory
  // mkdirs returns 200 even if directory already exists
  let hasWorkspacePermission = false;
  if (workspaceHome) {
    try {
      const token = await getAccessToken();
      const claudeConfigPath = `${workspaceHome}/.claude`;
      const response = await fetch(
        `${databricksHost}/api/2.0/workspace/mkdirs`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path: claudeConfigPath }),
        }
      );
      const data = (await response.json()) as {
        error_code?: string;
        message?: string;
      };
      // Permission exists if no error_code (mkdirs returns {} on success)
      hasWorkspacePermission = !data.error_code;
    } catch (error: any) {
      console.error('Failed to check workspace permission:', error);
      hasWorkspacePermission = false;
    }
  }

  // Build Databricks App URL from environment variables
  const databricksAppName = process.env.DATABRICKS_APP_NAME;
  const databricksAppUrl =
    databricksAppName && process.env.DATABRICKS_HOST
      ? `https://${process.env.DATABRICKS_HOST}/apps/${databricksAppName}`
      : null;

  return {
    userId,
    email: userEmail ?? null,
    workspaceHome,
    hasWorkspacePermission,
    databricksAppUrl,
  };
});

// Get current user settings
fastify.get('/api/v1/users/me/settings', async (request, _reply) => {
  const userId =
    (request.headers['x-forwarded-user'] as string | undefined) ||
    DEFAULT_USER_ID;

  const userSettings = await getSettings(userId);

  if (!userSettings) {
    return {
      userId,
      hasAccessToken: false,
      claudeConfigSync: true,
    };
  }

  return {
    userId: userSettings.userId,
    hasAccessToken: !!userSettings.accessToken,
    claudeConfigSync: userSettings.claudeConfigSync,
  };
});

// Update current user settings
fastify.patch<{
  Body: { accessToken?: string; claudeConfigSync?: boolean };
}>('/api/v1/users/me/settings', async (request, reply) => {
  const userId =
    (request.headers['x-forwarded-user'] as string | undefined) ||
    DEFAULT_USER_ID;

  const { accessToken, claudeConfigSync } = request.body;

  // At least one field must be provided
  if (accessToken === undefined && claudeConfigSync === undefined) {
    return reply
      .status(400)
      .send({ error: 'accessToken or claudeConfigSync is required' });
  }

  // Ensure user exists before creating settings
  const userEmail =
    (request.headers['x-forwarded-email'] as string | undefined) ||
    DEFAULT_USER_EMAIL;
  await upsertUser(userId, userEmail);

  const updates: { accessToken?: string; claudeConfigSync?: boolean } = {};
  if (accessToken !== undefined) updates.accessToken = accessToken;
  if (claudeConfigSync !== undefined)
    updates.claudeConfigSync = claudeConfigSync;

  await upsertSettings(userId, updates);
  return { success: true };
});

// Get service principal info
fastify.get('/api/v1/service-principal', async (_request, reply) => {
  try {
    const token = await getAccessToken();

    // Fetch SP info from Databricks SCIM API
    const response = await fetch(
      `${databricksHost}/api/2.0/preview/scim/v2/Me`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return reply.status(500).send({
        error: `Failed to fetch service principal info: ${errorText}`,
      });
    }

    const data = (await response.json()) as {
      displayName?: string;
      applicationId?: string;
      id?: string;
      userName?: string;
    };

    return {
      displayName: data.displayName ?? data.userName ?? 'Service Principal',
      applicationId: data.applicationId ?? data.id ?? null,
      databricksHost: process.env.DATABRICKS_HOST ?? null,
    };
  } catch (error: any) {
    return reply.status(500).send({ error: error.message });
  }
});

// Workspace API - List root workspace (returns Users and Shared)
fastify.get('/api/v1/Workspace', async (_request, _reply) => {
  return {
    objects: [
      { path: '/Workspace/Users', object_type: 'DIRECTORY' },
      { path: '/Workspace/Shared', object_type: 'DIRECTORY' },
    ],
  };
});

// Workspace API - List user's workspace directory (uses Service Principal token)
fastify.get<{ Params: { email: string } }>(
  '/api/v1/Workspace/Users/:email',
  async (request, reply) => {
    let email: string | undefined = request.params.email;

    // Resolve 'me' to actual email from header
    if (email === 'me') {
      email = request.headers['x-forwarded-email'] as string | undefined;
    }

    if (!email) {
      return reply.status(400).send({ error: 'Email required' });
    }

    const workspacePath = `/Workspace/Users/${email}`;

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `${databricksHost}/api/2.0/workspace/list?path=${encodeURIComponent(workspacePath)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = (await response.json()) as {
        objects?: Array<{ path: string; object_type: string }>;
        error_code?: string;
        message?: string;
      };

      // Check for permission error - return 403
      // Empty response {} also means no permission
      if (data.error_code === 'PERMISSION_DENIED' || !('objects' in data)) {
        return reply.status(403).send({ error: 'PERMISSION_DENIED' });
      }

      // Check for other API errors
      if (data.error_code) {
        return reply.status(400).send({ error: data.message });
      }

      // Filter to only return directories
      const directories = data.objects?.filter(
        (obj) => obj.object_type === 'DIRECTORY'
      );
      return { objects: directories || [] };
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  }
);

// Workspace API - Get workspace object status (includes object_id, uses Service Principal token)
fastify.post<{ Body: { path: string } }>(
  '/api/v1/workspace/status',
  async (request, reply) => {
    const { path: workspacePath } = request.body;

    if (!workspacePath) {
      return reply.status(400).send({ error: 'path is required' });
    }

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `${databricksHost}/api/2.0/workspace/get-status?path=${encodeURIComponent(workspacePath)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = (await response.json()) as {
        path?: string;
        object_type?: string;
        object_id?: number;
        error_code?: string;
        message?: string;
      };

      // Check for permission error - return 403
      if (data.error_code === 'PERMISSION_DENIED') {
        return reply.status(403).send({ error: 'PERMISSION_DENIED' });
      }

      if (data.error_code) {
        return reply.status(404).send({ error: data.message });
      }

      // Build browse URL for Databricks console
      const host = process.env.DATABRICKS_HOST;
      const browseUrl = data.object_id
        ? `https://${host}/browse/folders/${data.object_id}`
        : null;

      return {
        path: data.path,
        object_type: data.object_type,
        object_id: data.object_id,
        browse_url: browseUrl,
      };
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  }
);

// Workspace API - List any workspace path (Shared, Repos, etc., uses Service Principal token)
fastify.get<{ Params: { '*': string } }>(
  '/api/v1/Workspace/*',
  async (request, reply) => {
    const subpath = request.params['*'];
    const wsPath = `/Workspace/${subpath}`;

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `${databricksHost}/api/2.0/workspace/list?path=${encodeURIComponent(wsPath)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = (await response.json()) as {
        objects?: Array<{ path: string; object_type: string }>;
        error_code?: string;
        message?: string;
      };

      // Check for permission error - return 403
      // Empty response {} also means no permission
      if (data.error_code === 'PERMISSION_DENIED' || !('objects' in data)) {
        return reply.status(403).send({ error: 'PERMISSION_DENIED' });
      }

      // Filter to only return directories
      const directories = data.objects?.filter(
        (obj) => obj.object_type === 'DIRECTORY'
      );
      return { objects: directories || [] };
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  }
);

// WebSocket endpoint for session list updates
fastify.register(async (fastify) => {
  fastify.get('/api/v1/sessions/ws', { websocket: true }, (socket, req) => {
    const userId =
      (req.headers['x-forwarded-user'] as string | undefined) ||
      DEFAULT_USER_ID;

    console.log(
      `Client connected to session list WebSocket for user: ${userId}`
    );

    // Add to user's session listeners
    let listeners = userSessionListeners.get(userId);
    if (!listeners) {
      listeners = new Set();
      userSessionListeners.set(userId, listeners);
    }
    listeners.add(socket);

    socket.on('message', (messageBuffer: Buffer) => {
      try {
        const messageStr = messageBuffer.toString();
        const message = JSON.parse(messageStr);

        if (message.type === 'subscribe') {
          socket.send(JSON.stringify({ type: 'subscribed' }));
        }
      } catch (error) {
        console.error('Session list WebSocket message error:', error);
      }
    });

    socket.on('close', () => {
      console.log(
        `Client disconnected from session list WebSocket for user: ${userId}`
      );
      const listeners = userSessionListeners.get(userId);
      if (listeners) {
        listeners.delete(socket);
        if (listeners.size === 0) {
          userSessionListeners.delete(userId);
        }
      }
    });

    socket.on('error', (error: Error) => {
      console.error('Session list WebSocket error:', error);
    });
  });
});

// WebSocket endpoint for existing session - receives queued events
fastify.register(async (fastify) => {
  fastify.get<{ Params: { sessionId: string } }>(
    '/api/v1/sessions/:sessionId/ws',
    { websocket: true },
    (socket, req) => {
      const sessionId = req.params.sessionId;
      console.log(`Client connected to WebSocket for session: ${sessionId}`);

      // Get user info from request headers
      const userEmail =
        (req.headers['x-forwarded-email'] as string | undefined) ||
        DEFAULT_USER_EMAIL;
      const userId =
        (req.headers['x-forwarded-user'] as string | undefined) ||
        DEFAULT_USER_ID;

      const queue = sessionQueues.get(sessionId);

      // Event listener for new events
      const onEvent = (event: SDKMessage) => {
        socket.send(JSON.stringify(event));
      };

      socket.on('message', async (messageBuffer: Buffer) => {
        try {
          const messageStr = messageBuffer.toString();
          const message = JSON.parse(messageStr);

          if (message.type === 'connect') {
            socket.send(JSON.stringify({ type: 'connected' }));

            // Only send queued events if session is still being processed
            // Completed sessions should load history from REST API
            if (queue && !queue.completed) {
              for (const event of queue.events) {
                socket.send(JSON.stringify(event));
              }
              queue.listeners.add(onEvent);
            }
            return;
          }

          if (message.type === 'user_message') {
            // message.content is now MessageContent[] from frontend
            const userMessageContent = message.content as MessageContent[];
            const model = message.model || 'databricks-claude-sonnet-4-5';

            // Fetch session to get workspacePath and autoWorkspacePush for resume
            const session = await getSessionById(sessionId, userId);
            const workspacePath = session?.workspacePath ?? undefined;
            const autoWorkspacePush = session?.autoWorkspacePush ?? false;

            // Get user settings for claudeConfigSync
            const userSettings = await getSettingsDirect(userId);
            const claudeConfigSync = userSettings?.claudeConfigSync ?? true;

            // Save user message to database
            const userMsg = createUserMessage(sessionId, userMessageContent);
            await saveMessage(userMsg);

            // Process agent request and stream responses (use URL sessionId for resume)
            for await (const sdkMessage of processAgentRequest(
              userMessageContent,
              model,
              sessionId,
              userEmail,
              workspacePath,
              { autoWorkspacePush, claudeConfigSync }
            )) {
              // Save message to database (always execute regardless of WebSocket state)
              await saveMessage(sdkMessage);

              // Send to client (continue even if WebSocket is disconnected)
              try {
                socket.send(JSON.stringify(sdkMessage));
              } catch (sendError) {
                console.error('Failed to send WebSocket message:', sendError);
              }

              // Note: workspace sync is now handled by Stop hook in agent/hooks.ts
            }
          }
        } catch (error: any) {
          console.error('WebSocket error:', error);
          try {
            socket.send(
              JSON.stringify({
                type: 'error',
                error: error.message || 'Unknown error occurred',
              })
            );
          } catch (sendError) {
            console.error('Failed to send error message:', sendError);
          }
        }
      });

      socket.on('close', () => {
        console.log(
          `Client disconnected from WebSocket for session: ${sessionId}`
        );
        // Remove listener
        if (queue) {
          queue.listeners.delete(onEvent);
        }
      });

      socket.on('error', (error: Error) => {
        console.error('WebSocket connection error:', error);
      });
    }
  );
});

// SPA fallback - catch all routes and serve index.html
fastify.setNotFoundHandler((_request, reply) => {
  reply.sendFile('index.html');
});

// Start server
try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Backend server running on http://0.0.0.0:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`${signal} signal received: closing HTTP server`);
  await fastify.close();
  console.log('HTTP server closed');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
