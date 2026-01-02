import type { FastifyRequest, FastifyReply } from 'fastify';
import { extractRequestContext } from '../../../utils/headers.js';
import {
  getAccessTokenForUser,
  getServicePrincipalAccessToken,
} from '../../../utils/auth.js';
import { databricks } from '../../../config/index.js';

// List jobs (wrapper for /api/2.2/jobs/list)
// GET /api/v1/jobs/list
// Returns the original Databricks API response and status code
export async function listJobsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  let userId: string | undefined;

  try {
    const context = extractRequestContext(request);
    userId = context.user.sub;
  } catch {
    // Ignore - will use SP token
  }

  const accessToken = userId
    ? await getAccessTokenForUser(userId)
    : await getServicePrincipalAccessToken().then((token) => {
        if (!token) {
          throw new Error(
            'No access token available. Set DATABRICKS_CLIENT_ID/DATABRICKS_CLIENT_SECRET.'
          );
        }
        return token;
      });

  // Forward query parameters to Databricks API
  const queryString = request.url.includes('?')
    ? request.url.substring(request.url.indexOf('?'))
    : '';

  const response = await fetch(
    `${databricks.hostUrl}/api/2.2/jobs/list${queryString}`,
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
  let userId: string | undefined;

  try {
    const context = extractRequestContext(request);
    userId = context.user.sub;
  } catch {
    // Ignore - will use SP token
  }

  const accessToken = userId
    ? await getAccessTokenForUser(userId)
    : await getServicePrincipalAccessToken().then((token) => {
        if (!token) {
          throw new Error(
            'No access token available. Set DATABRICKS_CLIENT_ID/DATABRICKS_CLIENT_SECRET.'
          );
        }
        return token;
      });

  // Forward query parameters to Databricks API
  const queryString = request.url.includes('?')
    ? request.url.substring(request.url.indexOf('?'))
    : '';

  const response = await fetch(
    `${databricks.hostUrl}/api/2.2/jobs/runs/list${queryString}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const body = await response.json();
  return reply.status(response.status).send(body);
}
