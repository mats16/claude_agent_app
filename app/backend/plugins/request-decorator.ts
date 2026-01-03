import fp from 'fastify-plugin';

interface RequestUser {
  /** The user identifier provided by the IdP. */
  id: string;
  /** The user name provided by the IdP. */
  name: string;
  /** The user email provided by the IdP. */
  email: string;
  /** The user’s access token as on-behalf-of-user authorization */
  accessToken: string;
}

interface RequestContext {
  /** The original host or domain requested by the client. */
  host: string;
  /** The UUID of the request. */
  requestId: string;
  /** The IP address of the client that made the original request. */
  realIp: string;
  /** The user information from Databricks Apps headers. */
  user: RequestUser;
}

declare module 'fastify' {
  interface FastifyRequest {
    context: RequestContext | null;
  }
}

export default fp(
  async (fastify) => {
    // Add request context decorator
    fastify.decorateRequest('context', null);

    // Add preHandler hook for extracting request context
    fastify.addHook('preHandler', async (req) => {
      req.context = {
        host: req.headers['x-forwarded-host'] as string,
        requestId: req.headers['x-request-id'] as string,
        realIp: req.headers['x-real-ip'] as string,
        user: {
          id: req.headers['x-forwarded-user'] as string,
          name: req.headers['x-forwarded-preferred-username'] as string,
          email: req.headers['x-forwarded-email'] as string,
          accessToken: req.headers['x-forwarded-access-token'] as string,
        },
      };
    });
  },
  { name: 'request-decorator' }
);
