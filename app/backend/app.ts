import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { processAgentRequest } from './agent/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from parent directory (.env or ../.env)
dotenv.config({ path: path.join(__dirname, '../.env') });

const fastify = Fastify({
  logger: true,
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8000;
const WORKSPACE_PATH = process.env.WORKSPACE_PATH || process.cwd();

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

// WebSocket endpoint for agent communication
fastify.register(async (fastify) => {
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    console.log('Client connected to WebSocket');

    // Get user access token from request header
    const userAccessToken = req.headers['x-forwarded-access-token'] as
      | string
      | undefined;

    socket.on('message', async (messageBuffer: Buffer) => {
      try {
        const messageStr = messageBuffer.toString();
        const message = JSON.parse(messageStr);

        if (message.type === 'connect') {
          socket.send(
            JSON.stringify({
              type: 'connected',
            })
          );
          return;
        }

        if (message.type === 'user_message') {
          const userMessage = message.content;
          const model = message.model || 'databricks-claude-sonnet-4-5';
          const sessionId = message.sessionId;

          // Process agent request and stream responses
          for await (const agentMessage of processAgentRequest(
            userMessage,
            WORKSPACE_PATH,
            model,
            sessionId,
            userAccessToken
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
      console.log('Client disconnected from WebSocket');
    });

    socket.on('error', (error: Error) => {
      console.error('WebSocket connection error:', error);
    });
  });
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
