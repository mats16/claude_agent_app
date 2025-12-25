import type { FastifyPluginAsync } from 'fastify';
import { extractRequestContext } from '../../../utils/headers.js';
import {
  getUserPendingCount,
  getUserPendingTasks,
  getTotalPendingCount,
  getQueueStats,
} from '../../../services/workspaceQueueService.js';

const queueRoutes: FastifyPluginAsync = async (fastify) => {
  // Get current user's queue status
  // GET /api/v1/queues/status
  fastify.get('/status', async (request, reply) => {
    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }

    const userId = context.user.sub;

    return {
      userPendingCount: getUserPendingCount(userId),
      userTasks: getUserPendingTasks(userId),
      totalPendingCount: getTotalPendingCount(),
      queueStats: getQueueStats(),
    };
  });
};

export default queueRoutes;
