import type { FastifyPluginAsync } from 'fastify';
import { createRepoHandler } from './handlers.js';

const reposRoutes: FastifyPluginAsync = async (fastify) => {
  // Create a Git folder (repo) in Databricks workspace
  // POST /api/v1/repos
  // Body: { url: string, path: string }
  fastify.post('/', createRepoHandler);
};

export default reposRoutes;
