import type { FastifyPluginAsync } from 'fastify';
import { extractRequestContext } from '../../../utils/headers.js';
import * as userService from '../../../services/userService.js';

const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  // Get current user settings
  // GET /api/v1/settings
  fastify.get(
    '/',
    {
      schema: {
        tags: ['settings'],
        summary: 'Get user settings',
        description: 'Returns current user settings',
        response: {
          200: {
            type: 'object',
            properties: {
              claudeConfigAutoPush: { type: 'boolean' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          400: {
            type: 'object',
            properties: { error: { type: 'string' } },
            required: ['error'],
          },
          500: {
            type: 'object',
            properties: { error: { type: 'string' } },
            required: ['error'],
          },
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
        return settings;
      } catch (error: any) {
        console.error('Failed to get user settings:', error);
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  // Update current user settings
  // PATCH /api/v1/settings
  fastify.patch<{ Body: { claudeConfigAutoPush?: boolean } }>(
    '/',
    {
      schema: {
        tags: ['settings'],
        summary: 'Update user settings',
        description: 'Update current user settings',
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
            properties: { success: { type: 'boolean' } },
            required: ['success'],
          },
          400: {
            type: 'object',
            properties: { error: { type: 'string' } },
            required: ['error'],
          },
          500: {
            type: 'object',
            properties: { error: { type: 'string' } },
            required: ['error'],
          },
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
        return { success: true };
      } catch (error: any) {
        console.error('Failed to update user settings:', error);
        return reply.status(500).send({ error: error.message });
      }
    }
  );
};

export default settingsRoutes;
