import fp from 'fastify-plugin';
import fastifyRequestContext from '@fastify/request-context';

declare module '@fastify/request-context' {
  interface RequestContextData {
    requestId: string;
    userId: string;
    accessToken: string;
  }
}

export default fp(
  async (fastify) => {
    fastify.register(fastifyRequestContext, {
      defaultStoreValues: (req) => ({
        requestId: req.headers['x-request-id'] as string,
        userId: req.headers['x-forwarded-user'] as string,
        accessToken: req.headers['x-forwarded-access-token'] as string,
      }),
    });
  },
  { name: 'request-context' }
);
