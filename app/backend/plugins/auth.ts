import fp from 'fastify-plugin';
import { extractRequestContext } from '../utils/headers.js';
import type { RequestContext } from '../utils/headers.js';

declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestContext | null;
  }
}

export default fp(
  async (fastify) => {
    // Add request context decorator
    fastify.decorateRequest('ctx', null);

    // Add preHandler hook for extracting request context
    fastify.addHook('preHandler', async (request) => {
      try {
        request.ctx = extractRequestContext(request);
      } catch {
        // Allow health/public endpoints to proceed without auth
        request.ctx = null;
      }
    });
  },
  { name: 'auth' }
);
