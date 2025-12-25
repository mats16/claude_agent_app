import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Health check endpoint
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Health check',
        description: 'Check if the service is running',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'ok' },
              service: {
                type: 'string',
                example: 'Fastify Backend with Claude Agent',
              },
            },
            required: ['status', 'service'],
          },
        },
      },
    },
    async () => {
      return {
        status: 'ok',
        service: 'Fastify Backend with Claude Agent',
      };
    }
  );

  // Hello endpoint
  fastify.get(
    '/hello',
    {
      schema: {
        tags: ['health'],
        summary: 'Hello endpoint',
        description: 'Returns a greeting message with timestamp',
        response: {
          200: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                example: 'Hello from Fastify Backend!',
              },
              timestamp: { type: 'string', format: 'date-time' },
            },
            required: ['message', 'timestamp'],
          },
        },
      },
    },
    async () => {
      return {
        message: 'Hello from Fastify Backend!',
        timestamp: new Date().toISOString(),
      };
    }
  );
};

export default healthRoutes;
