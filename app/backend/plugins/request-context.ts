import fp from 'fastify-plugin';
import requestContext from '@fastify/request-context';

export default fp(async function (app) {
  app.register(requestContext, {
    defaultStoreValues: {
      context: null
    }
  });
});
