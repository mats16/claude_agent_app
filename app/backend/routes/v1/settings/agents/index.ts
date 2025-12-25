import type { FastifyPluginAsync } from 'fastify';
import {
  listSubagentsHandler,
  getSubagentHandler,
  createSubagentHandler,
  updateSubagentHandler,
  deleteSubagentHandler,
} from './handlers.js';

// Common schemas
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

const subagentNameParams = {
  type: 'object',
  properties: {
    subagentName: {
      type: 'string',
      pattern: '^[a-zA-Z0-9-]+$',
      description: 'Subagent name (alphanumeric and hyphens)',
    },
  },
  required: ['subagentName'],
};

const subagentResponse = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    tools: { type: 'string', nullable: true },
    model: { type: 'string', enum: ['sonnet', 'opus'], nullable: true },
    content: { type: 'string' },
  },
  required: ['name', 'description', 'content'],
};

const agentRoutes: FastifyPluginAsync = async (fastify) => {
  // List all subagents
  // GET /api/v1/settings/agents
  fastify.get(
    '/',
    {
      schema: {
        tags: ['agents'],
        summary: 'List all subagents',
        description: 'List all subagents for the current user',
        response: {
          200: {
            type: 'object',
            properties: {
              subagents: { type: 'array', items: subagentResponse },
            },
          },
          400: errorResponse,
          500: errorResponse,
        },
      },
    },
    listSubagentsHandler
  );

  // Get single subagent
  // GET /api/v1/settings/agents/:subagentName
  fastify.get(
    '/:subagentName',
    {
      schema: {
        tags: ['agents'],
        summary: 'Get subagent',
        description: 'Get a specific subagent by name',
        params: subagentNameParams,
        response: {
          200: subagentResponse,
          400: errorResponse,
          404: errorResponse,
        },
      },
    },
    getSubagentHandler
  );

  // Create new subagent
  // POST /api/v1/settings/agents
  fastify.post(
    '/',
    {
      schema: {
        tags: ['agents'],
        summary: 'Create subagent',
        description: 'Create a new subagent',
        body: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              pattern: '^[a-zA-Z0-9-]+$',
              description: 'Subagent name',
            },
            description: { type: 'string', maxLength: 500 },
            tools: { type: 'string', maxLength: 500 },
            model: { type: 'string', enum: ['sonnet', 'opus'] },
            content: { type: 'string' },
          },
          required: ['name', 'description', 'content'],
        },
        response: {
          200: subagentResponse,
          400: errorResponse,
          409: errorResponse,
          500: errorResponse,
        },
      },
    },
    createSubagentHandler
  );

  // Update existing subagent
  // PATCH /api/v1/settings/agents/:subagentName
  fastify.patch(
    '/:subagentName',
    {
      schema: {
        tags: ['agents'],
        summary: 'Update subagent',
        description: 'Update an existing subagent',
        params: subagentNameParams,
        body: {
          type: 'object',
          properties: {
            description: { type: 'string', maxLength: 500 },
            tools: { type: 'string', maxLength: 500 },
            model: { type: 'string', enum: ['sonnet', 'opus'] },
            content: { type: 'string' },
          },
          required: ['description', 'content'],
        },
        response: {
          200: successResponse,
          400: errorResponse,
          404: errorResponse,
          500: errorResponse,
        },
      },
    },
    updateSubagentHandler
  );

  // Delete subagent
  // DELETE /api/v1/settings/agents/:subagentName
  fastify.delete(
    '/:subagentName',
    {
      schema: {
        tags: ['agents'],
        summary: 'Delete subagent',
        description: 'Delete an existing subagent',
        params: subagentNameParams,
        response: {
          200: successResponse,
          400: errorResponse,
          404: errorResponse,
          500: errorResponse,
        },
      },
    },
    deleteSubagentHandler
  );
};

export default agentRoutes;
