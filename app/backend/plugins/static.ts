import fp from 'fastify-plugin';
import staticPlugin from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
