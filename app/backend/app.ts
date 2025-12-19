import Fastify from 'fastify';
import autoload from '@fastify/autoload';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Route imports
import healthRoutes from './routes/health/index.js';
import sessionRoutes from './routes/v1/sessions/index.js';
import sessionWebSocketRoutes from './routes/v1/sessions/websocket.js';
import meRoutes from './routes/v1/me/index.js';
import settingsRoutes from './routes/v1/settings/index.js';
import claudeBackupRoutes from './routes/v1/settings/claude-backup/index.js';
import skillRoutes from './routes/v1/settings/skills/index.js';
import agentRoutes from './routes/v1/settings/agents/index.js';
import spPermissionRoutes from './routes/v1/settings/sp-permission/index.js';
import presetSettingsRoutes from './routes/v1/preset-settings/index.js';
import workspaceRoutes from './routes/v1/workspace/index.js';

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
  await fastify.register(meRoutes, { prefix: '/api/v1/me' });
  await fastify.register(settingsRoutes, { prefix: '/api/v1/settings' });
  await fastify.register(claudeBackupRoutes, {
    prefix: '/api/v1/settings/claude-backup',
  });
  await fastify.register(skillRoutes, { prefix: '/api/v1/settings/skills' });
  await fastify.register(agentRoutes, { prefix: '/api/v1/settings/agents' });
  await fastify.register(spPermissionRoutes, {
    prefix: '/api/v1/settings/sp-permission',
  });
  await fastify.register(presetSettingsRoutes, {
    prefix: '/api/v1/preset-settings',
  });
  await fastify.register(workspaceRoutes, { prefix: '/api/v1/Workspace' });

  return fastify;
}
