import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Health check endpoint
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      service: 'Fastify Backend with Claude Agent',
    };
  });

  // Hello endpoint
  fastify.get('/hello', async () => {
    return {
      message: 'Hello from Fastify Backend!',
      timestamp: new Date().toISOString(),
    };
  });
};

export default healthRoutes;
