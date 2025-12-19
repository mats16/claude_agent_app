import type { FastifyPluginAsync } from 'fastify';
import { extractRequestContext } from '../../../../utils/headers.js';
import * as userService from '../../../../services/userService.js';
import * as claudeBackupService from '../../../../services/claudeBackupService.js';

const claudeBackupRoutes: FastifyPluginAsync = async (fastify) => {
  // Get Claude backup settings
  // GET /api/v1/settings/claude-backup
  fastify.get('/', async (request, reply) => {
    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }

    try {
      const settings = await userService.getUserSettings(context.userId);
      return { claudeConfigSync: settings.claudeConfigSync };
    } catch (error: any) {
      console.error('Failed to get backup settings:', error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // Update Claude backup settings
  // PATCH /api/v1/settings/claude-backup
  fastify.patch<{ Body: { claudeConfigSync: boolean } }>(
    '/',
    async (request, reply) => {
      let context;
      try {
        context = extractRequestContext(request);
      } catch (error: any) {
        return reply.status(400).send({ error: error.message });
      }

      const { claudeConfigSync } = request.body;

      if (claudeConfigSync === undefined) {
        return reply
          .status(400)
          .send({ error: 'claudeConfigSync is required' });
      }

      try {
        await userService.updateUserSettings(
          context.userId,
          context.userEmail,
          { claudeConfigSync }
        );
        return { success: true, claudeConfigSync };
      } catch (error: any) {
        console.error('Failed to update backup settings:', error);
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  // Pull (restore) Claude config from workspace
  // POST /api/v1/settings/claude-backup/pull
  fastify.post('/pull', async (request, reply) => {
    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.status(401).send({ error: error.message });
    }

    const { userId, userEmail } = context;
    await userService.ensureUser(userId, userEmail);

    try {
      await claudeBackupService.pullClaudeConfig(userEmail);
      return { success: true };
    } catch (error: any) {
      console.error(
        `[Backup Pull] Failed to pull claude config: ${error.message}`
      );
      return reply.status(500).send({ error: 'Failed to pull claude config' });
    }
  });

  // Push (backup) Claude config to workspace
  // POST /api/v1/settings/claude-backup/push
  fastify.post('/push', async (request, reply) => {
    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.status(401).send({ error: error.message });
    }

    const { userId, userEmail } = context;
    await userService.ensureUser(userId, userEmail);

    try {
      await claudeBackupService.pushClaudeConfig(userEmail);
      return { success: true };
    } catch (error: any) {
      console.error(
        `[Backup Push] Failed to push claude config: ${error.message}`
      );
      return reply.status(500).send({ error: 'Failed to push claude config' });
    }
  });
};

export default claudeBackupRoutes;
