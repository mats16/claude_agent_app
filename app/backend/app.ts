import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { processAgentRequest, AgentMessage } from './agent/index.js';

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
  events: AgentMessage[];
  listeners: Set<(event: AgentMessage) => void>;
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

function addEventToQueue(sessionId: string, event: AgentMessage) {
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
  session_context: { model: string };
}

fastify.post<{ Body: CreateSessionBody }>(
  '/api/v1/sessions',
  async (request, reply) => {
    const { events, session_context } = request.body;

    // Get user info from request headers
    const userAccessToken = request.headers['x-forwarded-access-token'] as
      | string
      | undefined;
    const userEmail = request.headers['x-forwarded-email'] as string | undefined;

    // Extract first user message
    const userEvent = events.find((e) => e.type === 'user');
    if (!userEvent) {
      return reply.status(400).send({ error: 'No user message found' });
    }

    const userMessage = userEvent.message.content;
    const model =
      session_context.model === 'sonnet'
        ? 'databricks-claude-sonnet-4-5'
        : session_context.model === 'opus'
          ? 'databricks-claude-opus-4-5'
          : `databricks-claude-${session_context.model}`;

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
      userEmail
    );

    // Process events in background
    (async () => {
      try {
        for await (const agentMessage of agentIterator) {
          if (agentMessage.type === 'init') {
            sessionId = agentMessage.sessionId;
            getOrCreateQueue(sessionId);
            resolveInit?.();
          }

          if (sessionId) {
            addEventToQueue(sessionId, agentMessage);
          }
        }
      } catch (error: any) {
        if (sessionId) {
          addEventToQueue(sessionId, {
            type: 'error',
            error: error.message || 'Unknown error occurred',
          });
        }
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

// Get session events (placeholder - data store not implemented)
fastify.get<{ Params: { sessionId: string } }>(
  '/api/v1/sessions/:sessionId/events',
  async (_request, _reply) => {
    // TODO: Implement when data store is ready
    return { events: [] };
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
      const onEvent = (event: AgentMessage) => {
        socket.send(JSON.stringify(event));
      };

      socket.on('message', async (messageBuffer: Buffer) => {
        try {
          const messageStr = messageBuffer.toString();
          const message = JSON.parse(messageStr);

          if (message.type === 'connect') {
            socket.send(JSON.stringify({ type: 'connected' }));

            // Send all queued events
            if (queue) {
              for (const event of queue.events) {
                socket.send(JSON.stringify(event));
              }

              // If not completed, subscribe to new events
              if (!queue.completed) {
                queue.listeners.add(onEvent);
              }
            }
            return;
          }

          if (message.type === 'user_message') {
            const userMessage = message.content;
            const model = message.model || 'databricks-claude-sonnet-4-5';

            // Process agent request and stream responses (use URL sessionId for resume)
            for await (const agentMessage of processAgentRequest(
              userMessage,
              model,
              sessionId,
              userAccessToken,
              userEmail
            )) {
              socket.send(JSON.stringify(agentMessage));
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
