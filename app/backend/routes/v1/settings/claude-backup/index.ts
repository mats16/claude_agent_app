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
      const settings = await userService.getUserSettings(context.user.sub);
      return { claude_config_auto_push: settings.claudeConfigAutoPush };
    } catch (error: any) {
      console.error('Failed to get backup settings:', error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // Update Claude backup settings
  // PATCH /api/v1/settings/claude-backup
  fastify.patch<{ Body: { claude_config_auto_push: boolean } }>(
    '/',
    async (request, reply) => {
      let context;
      try {
        context = extractRequestContext(request);
      } catch (error: any) {
        return reply.status(400).send({ error: error.message });
      }

      const { claude_config_auto_push: claudeConfigAutoPush } = request.body;

      if (claudeConfigAutoPush === undefined) {
        return reply
          .status(400)
          .send({ error: 'claude_config_auto_push is required' });
      }

      try {
        await userService.updateUserSettings(context.user, {
          claudeConfigAutoPush,
        });
        return { success: true, claude_config_auto_push: claudeConfigAutoPush };
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

    const { user } = context;
    await userService.ensureUser(user);

    try {
      const taskId = await claudeBackupService.pullClaudeConfig(user);
      return { success: true, task_id: taskId };
    } catch (error: any) {
      console.error(
        `[Backup Pull] Failed to enqueue claude config pull: ${error.message}`
      );
      return reply
        .status(500)
        .send({ error: 'Failed to enqueue claude config pull' });
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

    const { user } = context;
    await userService.ensureUser(user);

    try {
      const taskId = await claudeBackupService.pushClaudeConfig(user);
      return { success: true, task_id: taskId };
    } catch (error: any) {
      console.error(
        `[Backup Push] Failed to enqueue claude config push: ${error.message}`
      );
      return reply
        .status(500)
        .send({ error: 'Failed to enqueue claude config push' });
    }
  });
};

export default claudeBackupRoutes;
