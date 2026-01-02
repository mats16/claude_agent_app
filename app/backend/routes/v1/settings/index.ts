import type { FastifyPluginAsync } from 'fastify';
import { extractRequestContext } from '../../../utils/headers.js';
import * as settingsService from '../../../services/user-settings.service.js';

const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  // Get current user settings
  // GET /api/v1/settings
  fastify.get('/', async (request, reply) => {
    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }

    try {
      const settings = await settingsService.getUserSettings(context.user.sub);
      return settings;
    } catch (error: any) {
      console.error('Failed to get user settings:', error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // Update current user settings
  // PATCH /api/v1/settings
  fastify.patch<{ Body: { claudeConfigAutoPush?: boolean } }>(
    '/',
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
        await settingsService.updateUserSettings(context.user.sub, {
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
