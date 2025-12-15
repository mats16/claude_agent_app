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
  getSessions,
  getSessionsByUserEmail,
  updateSessionTitle,
} from './db/sessions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from parent directory (.env or ../.env)
dotenv.config({ path: path.join(__dirname, '../.env') });

const fastify = Fastify({
  logger: true,
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8000;

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

    // Extract first user message
    const userEvent = events.find((e) => e.type === 'user');
    if (!userEvent) {
      return reply.status(400).send({ error: 'No user message found' });
    }

    const userMessage = userEvent.message.content;
    const model = session_context.model;
    const workspacePath = session_context.workspacePath;
    const overwrite = session_context.overwrite ?? false;

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

    // Promise to wait for init message
    let sessionId = '';
    let resolveInit: (() => void) | undefined;
    const initReceived = new Promise<void>((resolve) => {
      resolveInit = resolve;
    });

    // Start processing in background
    const agentIterator = processAgentRequest(
      userMessage,
      model,
      undefined,
      userAccessToken,
      userEmail,
      workspacePath
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
      } finally {
        if (sessionId) {
          markQueueCompleted(sessionId);
        }
      }
    })();

    // Wait for init message only
    await initReceived;

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

// Update session title
fastify.patch<{ Params: { sessionId: string }; Body: { title: string } }>(
  '/api/v1/sessions/:sessionId',
  async (request, reply) => {
    const { sessionId } = request.params;
    const { title } = request.body;

    if (!title || typeof title !== 'string') {
      return reply.status(400).send({ error: 'title is required' });
    }

    await updateSessionTitle(sessionId, title);
    return { success: true };
  }
);

// Get session events from database
fastify.get<{ Params: { sessionId: string } }>(
  '/api/v1/sessions/:sessionId/events',
  async (request, _reply) => {
    const { sessionId } = request.params;
    const messages = await getMessagesBySessionId(sessionId);
    return { events: messages };
  }
);

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
    const token =
      (request.headers['x-forwarded-access-token'] as string) ||
      (request.headers['x-databricks-token'] as string);

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

    const path = `/Workspace/Users/${email}`;

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

// Workspace API - List any workspace path (Shared, Repos, etc.)
fastify.get<{ Params: { '*': string } }>(
  '/api/v1/Workspace/*',
  async (request, reply) => {
    const subpath = request.params['*'];

    const token =
      (request.headers['x-forwarded-access-token'] as string) ||
      (request.headers['x-databricks-token'] as string);

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

            // Save user message to database
            const userMsg = createUserMessage(sessionId, userMessage);
            await saveMessage(userMsg);

            // Process agent request and stream responses (use URL sessionId for resume)
            for await (const sdkMessage of processAgentRequest(
              userMessage,
              model,
              sessionId,
              userAccessToken,
              userEmail
            )) {
              // Save message to database
              await saveMessage(sdkMessage);
              // Send to client
              socket.send(JSON.stringify(sdkMessage));
            }
          }
        } catch (error: any) {
          console.error('WebSocket error:', error);
          socket.send(
            JSON.stringify({
              type: 'error',
              error: error.message || 'Unknown error occurred',
            })
          );
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
