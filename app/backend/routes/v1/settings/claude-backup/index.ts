import type { FastifyPluginAsync } from 'fastify';
import { extractRequestContext } from '../../../../utils/headers.js';
import * as userService from '../../../../services/userService.js';
import * as claudeBackupService from '../../../../services/claudeBackupService.js';

// Common schemas
const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
  required: ['error'],
};

const claudeBackupRoutes: FastifyPluginAsync = async (fastify) => {
  // Get Claude backup settings
  // GET /api/v1/settings/claude-backup
  fastify.get(
    '/',
    {
      schema: {
        tags: ['claude-backup'],
        summary: 'Get backup settings',
        description: 'Get Claude config backup settings',
        response: {
          200: {
            type: 'object',
            properties: {
              claudeConfigAutoPush: { type: 'boolean' },
            },
          },
          400: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) => {
      let context;
      try {
        context = extractRequestContext(request);
      } catch (error: any) {
        return reply.status(400).send({ error: error.message });
      }

      try {
        const settings = await userService.getUserSettings(context.user.sub);
        return { claudeConfigAutoPush: settings.claudeConfigAutoPush };
      } catch (error: any) {
        console.error('Failed to get backup settings:', error);
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  // Update Claude backup settings
  // PATCH /api/v1/settings/claude-backup
  fastify.patch<{ Body: { claudeConfigAutoPush: boolean } }>(
    '/',
    {
      schema: {
        tags: ['claude-backup'],
        summary: 'Update backup settings',
        description: 'Update Claude config backup settings',
        body: {
          type: 'object',
          properties: {
            claudeConfigAutoPush: { type: 'boolean' },
          },
          required: ['claudeConfigAutoPush'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              claudeConfigAutoPush: { type: 'boolean' },
            },
          },
          400: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) => {
      let context;
      try {
        context = extractRequestContext(request);
      } catch (error: any) {
        return reply.status(400).send({ error: error.message });
      }

      const { claudeConfigAutoPush } = request.body;

      if (claudeConfigAutoPush === undefined) {
        return reply
          .status(400)
          .send({ error: 'claudeConfigAutoPush is required' });
      }

      try {
        await userService.updateUserSettings(context.user, {
          claudeConfigAutoPush,
        });
        return { success: true, claudeConfigAutoPush };
      } catch (error: any) {
        console.error('Failed to update backup settings:', error);
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  // Pull (restore) Claude config from workspace
  // POST /api/v1/settings/claude-backup/pull
  fastify.post(
    '/pull',
    {
      schema: {
        tags: ['claude-backup'],
        summary: 'Pull Claude config',
        description: 'Pull (restore) Claude config from workspace',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              taskId: { type: 'string' },
            },
          },
          401: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) => {
      let context;
      try {
        context = extractRequestContext(request);
      } catch (error: any) {
        return reply.status(401).send({ error: error.message });
      }

      const { user } = context;
      await userService.ensureUser(user);

      try {
        const taskId = await claudeBackupService.pullClaudeConfig(user);
        return { success: true, taskId };
      } catch (error: any) {
        console.error(
          `[Backup Pull] Failed to enqueue claude config pull: ${error.message}`
        );
        return reply
          .status(500)
          .send({ error: 'Failed to enqueue claude config pull' });
      }
    }
  );

  // Push (backup) Claude config to workspace
  // POST /api/v1/settings/claude-backup/push
  fastify.post(
    '/push',
    {
      schema: {
        tags: ['claude-backup'],
        summary: 'Push Claude config',
        description: 'Push (backup) Claude config to workspace',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              taskId: { type: 'string' },
            },
          },
          401: errorResponse,
          500: errorResponse,
        },
      },
    },
    async (request, reply) => {
      let context;
      try {
        context = extractRequestContext(request);
      } catch (error: any) {
        return reply.status(401).send({ error: error.message });
      }

      const { user } = context;
      await userService.ensureUser(user);

      try {
        const taskId = await claudeBackupService.pushClaudeConfig(user);
        return { success: true, taskId };
      } catch (error: any) {
        console.error(
          `[Backup Push] Failed to enqueue claude config push: ${error.message}`
        );
        return reply
          .status(500)
          .send({ error: 'Failed to enqueue claude config push' });
      }
    }
  );
};

export default claudeBackupRoutes;
