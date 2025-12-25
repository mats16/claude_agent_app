import type { FastifyPluginAsync } from 'fastify';
import { listJobsHandler, listJobRunsHandler } from './handlers.js';

const jobsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/jobs/list → Databricks /api/2.2/jobs/list
  fastify.get(
    '/list',
    {
      schema: {
        tags: ['jobs'],
        summary: 'List jobs',
        description: 'Proxy to Databricks /api/2.2/jobs/list',
        querystring: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Max number of jobs to return',
            },
            offset: { type: 'number', description: 'Offset for pagination' },
            name: { type: 'string', description: 'Filter by job name' },
          },
        },
        response: {
          200: { type: 'object' },
        },
      },
    },
    listJobsHandler
  );

  // GET /api/v1/jobs/runs/list → Databricks /api/2.2/jobs/runs/list
  fastify.get(
    '/runs/list',
    {
      schema: {
        tags: ['jobs'],
        summary: 'List job runs',
        description: 'Proxy to Databricks /api/2.2/jobs/runs/list',
        querystring: {
          type: 'object',
          properties: {
            job_id: { type: 'number', description: 'Filter by job ID' },
            limit: {
              type: 'number',
              description: 'Max number of runs to return',
            },
            offset: { type: 'number', description: 'Offset for pagination' },
          },
        },
        response: {
          200: { type: 'object' },
        },
      },
    },
    listJobRunsHandler
  );
};

export default jobsRoutes;
