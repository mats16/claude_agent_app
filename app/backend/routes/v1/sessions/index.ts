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

// Common response schemas
const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
  required: ['error'],
};

const successResponse = {
  type: 'object',
  properties: { success: { type: 'boolean' } },
  required: ['success'],
};

const sessionIdParams = {
  type: 'object',
  properties: { sessionId: { type: 'string', format: 'uuid' } },
  required: ['sessionId'],
};

const sessionResponse = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    stub: { type: 'string' },
    title: { type: 'string', nullable: true },
    summary: { type: 'string', nullable: true },
    workspace_path: { type: 'string', nullable: true },
    workspace_url: { type: 'string', nullable: true },
    workspace_auto_push: { type: 'boolean' },
    app_auto_deploy: { type: 'boolean' },
    local_path: { type: 'string' },
    is_archived: { type: 'boolean' },
    model: { type: 'string' },
    app_name: { type: 'string' },
    console_url: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  // Create session
  fastify.post(
    '/',
    {
      schema: {
        tags: ['sessions'],
        summary: 'Create a new session',
        description: 'Create a new Claude agent session with initial message',
        body: {
          type: 'object',
          properties: {
            events: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  uuid: { type: 'string', format: 'uuid' },
                  session_id: { type: 'string' },
                  type: { type: 'string' },
                  message: {
                    type: 'object',
                    properties: {
                      role: { type: 'string' },
                      content: {},
                    },
                  },
                },
              },
            },
            session_context: {
              type: 'object',
              properties: {
                model: { type: 'string' },
                workspacePath: { type: 'string' },
                workspaceAutoPush: { type: 'boolean' },
                appAutoDeploy: { type: 'boolean' },
              },
              required: ['model'],
            },
          },
          required: ['events', 'session_context'],
        },
        response: {
          200: {
            type: 'object',
            properties: { session_id: { type: 'string', format: 'uuid' } },
            required: ['session_id'],
          },
          400: errorResponse,
          500: errorResponse,
        },
      },
    },
    createSessionHandler
  );

  // List sessions
  fastify.get(
    '/',
    {
      schema: {
        tags: ['sessions'],
        summary: 'List sessions',
        description: 'List all sessions for the current user',
        querystring: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              enum: ['active', 'archived', 'all'],
              default: 'active',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              sessions: { type: 'array', items: sessionResponse },
            },
          },
          400: errorResponse,
        },
      },
    },
    listSessionsHandler
  );

  // Get session
  fastify.get(
    '/:sessionId',
    {
      schema: {
        tags: ['sessions'],
        summary: 'Get session details',
        description: 'Get details of a specific session',
        params: sessionIdParams,
        response: {
          200: sessionResponse,
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    getSessionHandler
  );

  // Update session
  fastify.patch(
    '/:sessionId',
    {
      schema: {
        tags: ['sessions'],
        summary: 'Update session',
        description: 'Update session properties',
        params: sessionIdParams,
        body: {
          type: 'object',
          properties: {
            title: { type: 'string', maxLength: 200 },
            workspace_auto_push: { type: 'boolean' },
            workspace_path: { type: 'string', nullable: true },
            app_auto_deploy: { type: 'boolean' },
          },
        },
        response: {
          200: successResponse,
          400: errorResponse,
        },
      },
    },
    updateSessionHandler
  );

  // Archive session
  fastify.patch(
    '/:sessionId/archive',
    {
      schema: {
        tags: ['sessions'],
        summary: 'Archive session',
        description: 'Archive a session and delete associated resources',
        params: sessionIdParams,
        response: {
          200: successResponse,
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    archiveSessionHandler
  );

  // Get session events
  fastify.get(
    '/:sessionId/events',
    {
      schema: {
        tags: ['sessions'],
        summary: 'Get session events',
        description: 'Get all events/messages for a session',
        params: sessionIdParams,
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array', items: { type: 'object' } },
              first_id: { type: 'string', nullable: true },
              last_id: { type: 'string', nullable: true },
              has_more: { type: 'boolean' },
            },
          },
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    getSessionEventsHandler
  );

  // Get app live status
  fastify.get(
    '/:sessionId/app/live-status',
    {
      schema: {
        tags: ['sessions'],
        summary: 'Get app live status',
        description: 'Get real-time status of the Databricks app',
        params: sessionIdParams,
        response: {
          200: {
            type: 'object',
            properties: {
              app_status: {
                type: 'object',
                nullable: true,
                properties: {
                  state: { type: 'string' },
                  message: { type: 'string' },
                },
              },
              deployment_status: {
                type: 'object',
                nullable: true,
                properties: {
                  deployment_id: { type: 'string' },
                  state: { type: 'string' },
                  message: { type: 'string' },
                },
              },
              compute_status: {
                type: 'object',
                nullable: true,
                properties: {
                  state: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          400: errorResponse,
          404: errorResponse,
          500: errorResponse,
        },
      },
    },
    getAppLiveStatusHandler
  );

  // Get app (proxy to Databricks Apps API)
  fastify.get(
    '/:sessionId/app',
    {
      schema: {
        tags: ['sessions'],
        summary: 'Get app details',
        description: 'Proxy to Databricks Apps API to get app details',
        params: sessionIdParams,
        response: {
          200: { type: 'object' },
          400: errorResponse,
          404: errorResponse,
          500: errorResponse,
        },
      },
    },
    getAppHandler
  );

  // List app deployments (proxy to Databricks Apps API)
  fastify.get(
    '/:sessionId/app/deployments',
    {
      schema: {
        tags: ['sessions'],
        summary: 'List app deployments',
        description: 'Proxy to Databricks Apps API to list app deployments',
        params: sessionIdParams,
        response: {
          200: { type: 'object' },
          400: errorResponse,
          404: errorResponse,
          500: errorResponse,
        },
      },
    },
    listAppDeploymentsHandler
  );

  // Create app deployment (proxy to Databricks Apps API)
  fastify.post(
    '/:sessionId/app/deployments',
    {
      schema: {
        tags: ['sessions'],
        summary: 'Create app deployment',
        description: 'Proxy to Databricks Apps API to create a new deployment',
        params: sessionIdParams,
        response: {
          200: { type: 'object' },
          400: errorResponse,
          404: errorResponse,
          500: errorResponse,
        },
      },
    },
    createAppDeploymentHandler
  );
};

export default sessionRoutes;
