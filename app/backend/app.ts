import Fastify from 'fastify';
import autoload from '@fastify/autoload';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Route imports
import healthRoutes from './routes/health/index.js';
import sessionRoutes from './routes/v1/sessions/index.js';
import sessionWebSocketRoutes from './routes/v1/sessions/websocket.js';
import userRoutes from './routes/v1/users/index.js';
import skillRoutes from './routes/v1/skills/index.js';
import presetConfigRoutes from './routes/v1/preset-configs/index.js';
import workspaceRoutes from './routes/v1/workspace/index.js';
import servicePrincipalRoutes from './routes/v1/service-principal/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from parent directory (.env or ../.env)
dotenv.config({ path: path.join(__dirname, '../.env') });

// Build and configure Fastify application
export async function buildApp() {
  const fastify = Fastify({
    logger: true,
  });

  // Register plugins via autoload (websocket, static)
  // Note: auth and session-state plugins are excluded for Phase 1
  await fastify.register(autoload, {
    dir: path.join(__dirname, 'plugins'),
    ignorePattern: /^(auth|session-state)\./,
  });

  // Register routes with explicit prefixes
  await fastify.register(healthRoutes, { prefix: '/api' });
  await fastify.register(sessionRoutes, { prefix: '/api/v1/sessions' });
  await fastify.register(sessionWebSocketRoutes, {
    prefix: '/api/v1/sessions',
  });
  await fastify.register(userRoutes, { prefix: '/api/v1/users' });
  await fastify.register(skillRoutes, { prefix: '/api/v1/claude/skills' });
  await fastify.register(presetConfigRoutes, {
    prefix: '/api/v1/preset-configs',
  });
  await fastify.register(workspaceRoutes, { prefix: '/api/v1/Workspace' });
  await fastify.register(servicePrincipalRoutes, {
    prefix: '/api/v1/service-principal',
  });

  return fastify;
}
