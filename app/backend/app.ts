import Fastify from 'fastify';
import autoload from '@fastify/autoload';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Route imports
import healthRoutes from './routes/health/index.js';
import sessionRoutes from './routes/v1/sessions/index.js';
import sessionWebSocketRoutes from './routes/v1/sessions/websocket.js';
import sessionFileRoutes from './routes/v1/sessions/files/index.js';
import meRoutes from './routes/v1/me/index.js';
import settingsRoutes from './routes/v1/settings/index.js';
import claudeBackupRoutes from './routes/v1/settings/claude-backup/index.js';
import skillRoutes from './routes/v1/settings/skills/index.js';
import agentRoutes from './routes/v1/settings/agents/index.js';
import spPermissionRoutes from './routes/v1/settings/sp-permission/index.js';
import patRoutes from './routes/v1/settings/pat/index.js';
import presetSettingsRoutes from './routes/v1/preset-settings/index.js';
import workspaceRoutes from './routes/v1/workspace/index.js';
import queueRoutes from './routes/v1/queues/index.js';
import reposRoutes from './routes/v1/repos/index.js';
import jobsRoutes from './routes/v1/jobs/index.js';

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

  // Register multipart plugin for file uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB max
    },
  });

  // Register Swagger for OpenAPI documentation
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Claude Agent API',
        description:
          'Claude Code-like coding agent API running on Databricks Apps',
        version: '1.0.0',
      },
      servers: [
        {
          url: '/',
          description: 'Current server',
        },
      ],
      tags: [
        { name: 'health', description: 'Health check endpoints' },
        { name: 'me', description: 'Current user information' },
        { name: 'sessions', description: 'Session management' },
        { name: 'files', description: 'Session file operations' },
        { name: 'settings', description: 'User settings' },
        { name: 'claude-backup', description: 'Claude config backup/restore' },
        { name: 'skills', description: 'Skills management' },
        { name: 'agents', description: 'Subagents management' },
        { name: 'pat', description: 'Personal Access Token management' },
        { name: 'sp-permission', description: 'Service Principal permissions' },
        { name: 'preset-settings', description: 'Preset skills and agents' },
        { name: 'workspace', description: 'Databricks Workspace operations' },
        { name: 'repos', description: 'Git repository operations' },
        { name: 'jobs', description: 'Databricks Jobs operations' },
        { name: 'queues', description: 'Task queue status' },
      ],
      components: {
        securitySchemes: {
          databricksAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-Forwarded-User',
            description: 'Databricks user context header',
          },
        },
      },
    },
  });

  // Register Swagger UI
  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Register routes with explicit prefixes
  await fastify.register(healthRoutes, { prefix: '/api' });
  await fastify.register(sessionRoutes, { prefix: '/api/v1/sessions' });
  await fastify.register(sessionWebSocketRoutes, {
    prefix: '/api/v1/sessions',
  });
  await fastify.register(sessionFileRoutes, {
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
  await fastify.register(patRoutes, { prefix: '/api/v1/settings/pat' });
  await fastify.register(presetSettingsRoutes, {
    prefix: '/api/v1/preset-settings',
  });
  await fastify.register(workspaceRoutes, { prefix: '/api/v1/Workspace' });
  await fastify.register(workspaceRoutes, { prefix: '/api/v1/workspace' });
  await fastify.register(queueRoutes, { prefix: '/api/v1/queues' });
  await fastify.register(reposRoutes, { prefix: '/api/v1/repos' });
  await fastify.register(jobsRoutes, { prefix: '/api/v1/jobs' });

  return fastify;
}
