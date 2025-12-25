import type { FastifyPluginAsync } from 'fastify';
import { createRepoHandler } from './handlers.js';

// Common schemas
const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
  required: ['error'],
};

const reposRoutes: FastifyPluginAsync = async (fastify) => {
  // Create a Git folder (repo) in Databricks workspace
  // POST /api/v1/repos
  // Body: { url: string, path: string }
  fastify.post(
    '/',
    {
      schema: {
        tags: ['repos'],
        summary: 'Create Git repository',
        description: 'Create a Git folder (repo) in Databricks workspace',
        body: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              format: 'uri',
              description: 'Git repository URL',
            },
            path: {
              type: 'string',
              description: 'Workspace path (supports me resolution)',
            },
            sparse_checkout: {
              type: 'object',
              properties: {
                patterns: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          required: ['url', 'path'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              path: { type: 'string' },
              url: { type: 'string' },
              provider: { type: 'string' },
              branch: { type: 'string' },
            },
          },
          400: errorResponse,
          403: errorResponse,
          409: errorResponse,
          500: errorResponse,
        },
      },
    },
    createRepoHandler
  );
};

export default reposRoutes;
