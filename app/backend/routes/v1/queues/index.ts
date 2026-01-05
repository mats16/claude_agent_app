import type { FastifyPluginAsync } from 'fastify';
import {
  getUserPendingCount,
  getUserPendingTasks,
  getTotalPendingCount,
  getQueueStats,
} from '../../../services/workspace-queue.service.js';

const queueRoutes: FastifyPluginAsync = async (fastify) => {
  // Get current user's queue status
  // GET /api/v1/queues/status
  fastify.get('/status', async (request, reply) => {
    if (!request.ctx?.user) {
      return reply.status(400).send({ error: 'User authentication required' });
    }

    const userId = request.ctx.user.id;

    return {
      userPendingCount: getUserPendingCount(userId),
      userTasks: getUserPendingTasks(userId),
      totalPendingCount: getTotalPendingCount(),
      queueStats: getQueueStats(),
    };
  });
};

export default queueRoutes;
