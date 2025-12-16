import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { processAgentRequest, SDKMessage } from './agent/index.js';
import { saveMessage, getMessagesBySessionId } from './db/events.js';
import {
  createSession,
  getSessionById,
  getSessions,
  getSessionsByUserEmail,
  updateSession,
} from './db/sessions.js';
import {
  getSettings,
  getSettingsDirect,
  upsertSettings,
} from './db/settings.js';
import { syncToWorkspace } from './utils/workspace-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from parent directory (.env or ../.env)
dotenv.config({ path: path.join(__dirname, '../.env') });

const fastify = Fastify({
  logger: true,
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8000;

// Default user ID for local development (when X-Forwarded-User header is not present)
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

// Session event queue for streaming events to WebSocket
interface SessionQueue {
  events: SDKMessage[];
  listeners: Set<(event: SDKMessage) => void>;
  completed: boolean;
}

const sessionQueues = new Map<string, SessionQueue>();

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

// Create SDKMessage for user message
function createUserMessage(sessionId: string, content: string): SDKMessage {
  return {
    type: 'user',
    session_id: sessionId,
    uuid: crypto.randomUUID(),
    message: {
      role: 'user',
      content: content,
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
    message: { role: string; content: string };
  }>;
  session_context: {
    model: string;
    workspacePath?: string;
    overwrite?: boolean;
    autoSync?: boolean;
  };
}

fastify.post<{ Body: CreateSessionBody }>(
  '/api/v1/sessions',
  async (request, reply) => {
    const { events, session_context } = request.body;

    // Get user info from request headers
    const userAccessToken = request.headers['x-forwarded-access-token'] as
      | string
      | undefined;
    const userEmail = request.headers['x-forwarded-email'] as
      | string
      | undefined;
    const userId =
      (request.headers['x-forwarded-user'] as string | undefined) ||
      DEFAULT_USER_ID;

    // Fetch stored access token from user settings
    const userSettings = await getSettingsDirect(userId);
    const storedAccessToken = userSettings?.accessToken ?? undefined;

    // Extract first user message
    const userEvent = events.find((e) => e.type === 'user');
    if (!userEvent) {
      return reply.status(400).send({ error: 'No user message found' });
    }

    const userMessage = userEvent.message.content;
    const model = session_context.model;
    const workspacePath = session_context.workspacePath;
    const overwrite = session_context.overwrite ?? false;
    const autoSync = session_context.autoSync ?? false;

    // Execute workspace export-dir if workspacePath is provided (fire and forget)
    if (workspacePath) {
      const { exec } = await import('child_process');

      // Target path mirrors the workspace path structure under base directory
      // e.g., /Workspace/Users/user@example.com/hoge -> /home/app/Workspace/Users/user@example.com/hoge
      // Use /home/app in Databricks Apps (when DATABRICKS_APP_NAME is set), otherwise ./tmp for local dev
      const basePath = process.env.DATABRICKS_APP_NAME ? '/home/app' : './tmp';
      const targetPath = path.join(basePath, workspacePath);
      const cmd = overwrite
        ? `databricks workspace export-dir "${workspacePath}" "${targetPath}" --overwrite`
        : `databricks workspace export-dir "${workspacePath}" "${targetPath}"`;

      console.log(`Executing (background): ${cmd}`);
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.error('export-dir error:', error.message);
        }
        if (stdout) console.log('export-dir stdout:', stdout);
        if (stderr) console.log('export-dir stderr:', stderr);
      });
    }

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

    const startAgentProcessing = () => {
      // Start processing in background
      const agentIterator = processAgentRequest(
        userMessage,
        model,
        undefined,
        userAccessToken,
        userEmail,
        workspacePath,
        storedAccessToken
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

              // Save session to database
              await createSession({
                id: sessionId,
                title: userMessage.slice(0, 100), // Use first 100 chars of message as title
                model,
                workspacePath,
                userEmail,
                autoSync,
              });

              resolveInit?.();

              // Save user message after getting sessionId
              if (!userMessageSaved) {
                const userMsg = createUserMessage(sessionId, userMessage);
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

// Get all sessions
fastify.get('/api/v1/sessions', async (request, _reply) => {
  const userEmail = request.headers['x-forwarded-email'] as string | undefined;

  // If user email is provided, filter by user
  const sessionList = userEmail
    ? await getSessionsByUserEmail(userEmail)
    : await getSessions();

  return { sessions: sessionList };
});

// Update session settings (title, autoSync)
fastify.patch<{
  Params: { sessionId: string };
  Body: { title?: string; autoSync?: boolean };
}>('/api/v1/sessions/:sessionId', async (request, reply) => {
  const { sessionId } = request.params;
  const { title, autoSync } = request.body;

  // At least one field must be provided
  if (title === undefined && autoSync === undefined) {
    return reply.status(400).send({ error: 'title or autoSync is required' });
  }

  const updates: { title?: string; autoSync?: boolean } = {};
  if (title !== undefined) updates.title = title;
  if (autoSync !== undefined) updates.autoSync = autoSync;

  await updateSession(sessionId, updates);
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

// Create user (register)
fastify.post<{
  Body: { accessToken?: string; claudeConfigSync?: boolean };
}>('/api/v1/users', async (request, _reply) => {
  const userId =
    (request.headers['x-forwarded-user'] as string | undefined) ||
    DEFAULT_USER_ID;

  const { accessToken, claudeConfigSync } = request.body;

  await upsertSettings(userId, {
    accessToken: accessToken ?? undefined,
    claudeConfigSync: claudeConfigSync ?? false,
  });

  return { success: true };
});

// Get current user settings
fastify.get('/api/v1/users/me', async (request, _reply) => {
  const userId =
    (request.headers['x-forwarded-user'] as string | undefined) ||
    DEFAULT_USER_ID;

  const userSettings = await getSettings(userId);

  if (!userSettings) {
    return {
      userId,
      hasAccessToken: false,
      claudeConfigSync: false,
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
}>('/api/v1/users/me', async (request, reply) => {
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

  const updates: { accessToken?: string; claudeConfigSync?: boolean } = {};
  if (accessToken !== undefined) updates.accessToken = accessToken;
  if (claudeConfigSync !== undefined)
    updates.claudeConfigSync = claudeConfigSync;

  await upsertSettings(userId, updates);
  return { success: true };
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

// Workspace API - List user's workspace directory
fastify.get<{ Params: { email: string } }>(
  '/api/v1/Workspace/Users/:email',
  async (request, reply) => {
    // Prefer PAT from localStorage (x-databricks-token) over Databricks Apps proxy token
    // because the proxy token may not have sufficient scope for SCIM API
    const token =
      (request.headers['x-databricks-token'] as string) ||
      (request.headers['x-forwarded-access-token'] as string);

    if (!token) {
      return reply.status(401).send({ error: 'Token required' });
    }

    const databricksHost = process.env.DATABRICKS_HOST;
    let email: string | undefined = request.params.email;

    // Resolve 'me' to actual email
    if (email === 'me') {
      // Try x-forwarded-email header first (Databricks Apps)
      email = request.headers['x-forwarded-email'] as string | undefined;

      // If not available, fetch from Databricks SCIM API
      if (!email) {
        try {
          const meResponse = await fetch(
            `https://${databricksHost}/api/2.0/preview/scim/v2/Me`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          const meData = (await meResponse.json()) as {
            userName?: string;
            emails?: Array<{ value: string }>;
          };
          email = meData.userName || meData.emails?.[0]?.value;
        } catch (error: any) {
          return reply
            .status(500)
            .send({ error: 'Failed to resolve current user' });
        }
      }
    }

    if (!email) {
      return reply.status(400).send({ error: 'Email required' });
    }

    const workspacePath = `/Workspace/Users/${email}`;

    try {
      const response = await fetch(
        `https://${databricksHost}/api/2.0/workspace/list?path=${encodeURIComponent(workspacePath)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = (await response.json()) as {
        objects?: Array<{ path: string; object_type: string }>;
        error_code?: string;
        message?: string;
      };

      // Check for API error
      if (data.error_code) {
        return { objects: [], error: data.message };
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

// Workspace API - Get workspace object status (includes object_id)
fastify.post<{ Body: { path: string } }>(
  '/api/v1/workspace/status',
  async (request, reply) => {
    const { path: workspacePath } = request.body;

    if (!workspacePath) {
      return reply.status(400).send({ error: 'path is required' });
    }

    // Prefer PAT from localStorage (x-databricks-token) over Databricks Apps proxy token
    const token =
      (request.headers['x-databricks-token'] as string) ||
      (request.headers['x-forwarded-access-token'] as string);

    if (!token) {
      return reply.status(401).send({ error: 'Token required' });
    }

    const databricksHost = process.env.DATABRICKS_HOST;

    try {
      const response = await fetch(
        `https://${databricksHost}/api/2.0/workspace/get-status?path=${encodeURIComponent(workspacePath)}`,
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

      if (data.error_code) {
        return reply.status(404).send({ error: data.message });
      }

      // Build browse URL for Databricks console
      const browseUrl = data.object_id
        ? `https://${databricksHost}/browse/folders/${data.object_id}`
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

// Workspace API - List any workspace path (Shared, Repos, etc.)
fastify.get<{ Params: { '*': string } }>(
  '/api/v1/Workspace/*',
  async (request, reply) => {
    const subpath = request.params['*'];

    // Prefer PAT from localStorage (x-databricks-token) over Databricks Apps proxy token
    const token =
      (request.headers['x-databricks-token'] as string) ||
      (request.headers['x-forwarded-access-token'] as string);

    if (!token) {
      return reply.status(401).send({ error: 'Token required' });
    }

    const databricksHost = process.env.DATABRICKS_HOST;
    const path = `/Workspace/${subpath}`;

    try {
      const response = await fetch(
        `https://${databricksHost}/api/2.0/workspace/list?path=${encodeURIComponent(path)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = (await response.json()) as {
        objects?: Array<{ path: string; object_type: string }>;
      };
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

// WebSocket endpoint for existing session - receives queued events
fastify.register(async (fastify) => {
  fastify.get<{ Params: { sessionId: string } }>(
    '/api/v1/sessions/:sessionId/ws',
    { websocket: true },
    (socket, req) => {
      const sessionId = req.params.sessionId;
      console.log(`Client connected to WebSocket for session: ${sessionId}`);

      // Get user info from request headers
      const userAccessToken = req.headers['x-forwarded-access-token'] as
        | string
        | undefined;
      const userEmail = req.headers['x-forwarded-email'] as string | undefined;
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
            const userMessage = message.content;
            const model = message.model || 'databricks-claude-sonnet-4-5';

            // Fetch session to get workspacePath and autoSync for resume
            const session = await getSessionById(sessionId);
            const workspacePath = session?.workspacePath ?? undefined;
            const autoSync = session?.autoSync ?? false;

            // Fetch user settings to get stored access token and claude config sync
            const userSettings = await getSettingsDirect(userId);
            const storedAccessToken = userSettings?.accessToken ?? undefined;
            const claudeConfigSync = userSettings?.claudeConfigSync ?? false;

            // Save user message to database
            const userMsg = createUserMessage(sessionId, userMessage);
            await saveMessage(userMsg);

            // Process agent request and stream responses (use URL sessionId for resume)
            for await (const sdkMessage of processAgentRequest(
              userMessage,
              model,
              sessionId,
              userAccessToken,
              userEmail,
              workspacePath,
              storedAccessToken
            )) {
              // Save message to database (always execute regardless of WebSocket state)
              await saveMessage(sdkMessage);

              // Send to client (continue even if WebSocket is disconnected)
              try {
                socket.send(JSON.stringify(sdkMessage));
              } catch (sendError) {
                console.error('Failed to send WebSocket message:', sendError);
              }

              // Auto sync: import local changes back to workspace on result success
              // (always execute regardless of WebSocket state)
              if (
                autoSync &&
                workspacePath &&
                sdkMessage.type === 'result' &&
                'subtype' in sdkMessage &&
                sdkMessage.subtype === 'success'
              ) {
                const { exec } = await import('child_process');
                const basePath = process.env.DATABRICKS_APP_NAME
                  ? '/home/app'
                  : './tmp';
                const localPath = path.join(basePath, workspacePath);
                const importCmd = `databricks workspace import-dir "${localPath}" "${workspacePath}" --overwrite`;

                console.log(`Auto sync (background): ${importCmd}`);
                exec(importCmd, (error, stdout, stderr) => {
                  if (error) {
                    console.error('import-dir error:', error.message);
                  }
                  if (stdout) console.log('import-dir stdout:', stdout);
                  if (stderr) console.log('import-dir stderr:', stderr);
                });
              }

              // Claude config sync: sync .claude directory to workspace on result success
              if (
                claudeConfigSync &&
                userEmail &&
                storedAccessToken &&
                sdkMessage.type === 'result' &&
                'subtype' in sdkMessage &&
                sdkMessage.subtype === 'success'
              ) {
                const basePath = process.env.DATABRICKS_APP_NAME
                  ? '/home/app'
                  : './tmp';
                const claudeLocalPath = path.join(
                  basePath,
                  'Workspace',
                  'Users',
                  userEmail,
                  '.claude'
                );
                const claudeWorkspacePath = `/Workspace/Users/${userEmail}/.claude`;

                console.log(
                  `Claude config sync: ${claudeLocalPath} -> ${claudeWorkspacePath}`
                );
                syncToWorkspace(
                  claudeLocalPath,
                  claudeWorkspacePath,
                  storedAccessToken
                ).catch((error) => {
                  console.error('Claude config sync error:', error.message);
                });
              }
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
