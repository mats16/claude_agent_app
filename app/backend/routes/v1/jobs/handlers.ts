import type { FastifyRequest, FastifyReply } from 'fastify';
import { getPersonalAccessToken } from '../../../services/user.service.js';

// List jobs (wrapper for /api/2.2/jobs/list)
// GET /api/v1/jobs/list
// Returns the original Databricks API response and status code
export async function listJobsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {

  const userId = request.ctx!.user.id;

  const accessToken = await getPersonalAccessToken(request.server, userId);

  // Forward query parameters to Databricks API
  const queryString = request.url.includes('?')
    ? request.url.substring(request.url.indexOf('?'))
    : '';

  const databricksHostUrl = `https://${request.server.config.DATABRICKS_HOST}`;
  const response = await fetch(
    `${databricksHostUrl}/api/2.2/jobs/list${queryString}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const body = await response.json();
  return reply.status(response.status).send(body);
}

// List job runs (wrapper for /api/2.2/jobs/runs/list)
// GET /api/v1/jobs/runs/list
// Returns the original Databricks API response and status code
export async function listJobRunsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = request.ctx!.user.id;

  const accessToken = await getPersonalAccessToken(request.server, userId);

  // Forward query parameters to Databricks API
  const queryString = request.url.includes('?')
    ? request.url.substring(request.url.indexOf('?'))
    : '';

  const databricksHostUrl = `https://${request.server.config.DATABRICKS_HOST}`;
  const response = await fetch(
    `${databricksHostUrl}/api/2.2/jobs/runs/list${queryString}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const body = await response.json();
  return reply.status(response.status).send(body);
}
