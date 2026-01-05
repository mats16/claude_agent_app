import fp from 'fastify-plugin';
import staticPlugin from '@fastify/static';
import path from 'path';

const __dirname = import.meta.dirname;

export default fp(
  async (fastify) => {
    await fastify.register(staticPlugin, {
      root: path.join(__dirname, '../../../frontend/dist'),
      prefix: '/',
    });

    // SPA fallback - catch all routes and serve index.html
    fastify.setNotFoundHandler((_request, reply) => {
      reply.sendFile('index.html');
    });
  },
  { name: 'static' }
);
