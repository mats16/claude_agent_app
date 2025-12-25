import type { FastifyPluginAsync } from 'fastify';
import { extractRequestContext } from '../../../utils/headers.js';
import * as userService from '../../../services/userService.js';

const meRoutes: FastifyPluginAsync = async (fastify) => {
  // Get current user info (includes workspace permission check)
  // GET /api/v1/me
  fastify.get(
    '/',
    {
      schema: {
        tags: ['me'],
        summary: 'Get current user info',
        description:
          'Returns current user information including workspace permissions',
        response: {
          200: {
            type: 'object',
            properties: {
              sub: { type: 'string', description: 'User ID' },
              email: { type: 'string', format: 'email' },
              name: { type: 'string' },
              hasWorkspacePermission: { type: 'boolean' },
              hasPat: { type: 'boolean' },
              encryptionAvailable: { type: 'boolean' },
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
        const userInfo = await userService.getUserInfo(context.user);
        return userInfo;
      } catch (error: any) {
        console.error('Failed to get user info:', error);
        return reply.status(500).send({ error: error.message });
      }
    }
  );
};

export default meRoutes;
