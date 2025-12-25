import type { FastifyPluginAsync } from 'fastify';
import {
  createSessionHandler,
  listSessionsHandler,
  getSessionHandler,
  updateSessionHandler,
  archiveSessionHandler,
  getSessionEventsHandler,
  getAppLiveStatusHandler,
  getAppHandler,
  listAppDeploymentsHandler,
  createAppDeploymentHandler,
} from './handlers.js';

const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  // Create session
  fastify.post('/', createSessionHandler);

  // List sessions
  fastify.get('/', listSessionsHandler);

  // Get session
  fastify.get('/:sessionId', getSessionHandler);

  // Update session
  fastify.patch('/:sessionId', updateSessionHandler);

  // Archive session
  fastify.patch('/:sessionId/archive', archiveSessionHandler);

  // Get session events
  fastify.get('/:sessionId/events', getSessionEventsHandler);

  // Get app live status
  fastify.get('/:sessionId/app/live-status', getAppLiveStatusHandler);

  // Get app (proxy to Databricks Apps API)
  fastify.get('/:sessionId/app', getAppHandler);

  // List app deployments (proxy to Databricks Apps API)
  fastify.get('/:sessionId/app/deployments', listAppDeploymentsHandler);

  // Create app deployment (proxy to Databricks Apps API)
  fastify.post('/:sessionId/app/deployments', createAppDeploymentHandler);
};

export default sessionRoutes;
