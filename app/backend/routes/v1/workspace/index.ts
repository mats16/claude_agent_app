import type { FastifyPluginAsync } from 'fastify';
import {
  listRootWorkspaceHandler,
  listUserWorkspaceHandler,
  listWorkspacePathHandler,
  createDirectoryHandler,
  getStatusHandler,
  getWorkspaceObjectHandler,
  listWorkspaceHandler,
  mkdirsHandler,
} from './handlers.js';

// Common schemas
const errorResponse = {
  type: 'object',
  properties: { error: { type: 'string' } },
  required: ['error'],
};

const workspaceObjectSchema = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    object_type: {
      type: 'string',
      enum: ['DIRECTORY', 'FILE', 'NOTEBOOK', 'LIBRARY', 'REPO'],
    },
    object_id: { type: 'number' },
    language: { type: 'string', nullable: true },
  },
};

const workspaceListResponse = {
  type: 'object',
  properties: {
    objects: { type: 'array', items: workspaceObjectSchema },
    browse_url: { type: 'string', nullable: true },
  },
};

const workspaceRoutes: FastifyPluginAsync = async (fastify) => {
  // List root workspace (returns Users and Shared)
  // GET /api/v1/Workspace
  fastify.get(
    '/',
    {
      schema: {
        tags: ['workspace'],
        summary: 'List root workspace',
        description: 'Returns Users and Shared directories',
        response: {
          200: workspaceListResponse,
        },
      },
    },
    listRootWorkspaceHandler
  );

  // Get workspace object status (including object_id and browse_url)
  // GET /api/v1/Workspace/status?path=Users/me/.claude
  // Must be registered before wildcard route
  fastify.get(
    '/status',
    {
      schema: {
        tags: ['workspace'],
        summary: 'Get workspace object status',
        description: 'Get status including object_id and browse_url',
        querystring: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Workspace path (supports me resolution)',
            },
          },
          required: ['path'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              object_type: { type: 'string' },
              object_id: { type: 'number', nullable: true },
              browse_url: { type: 'string', nullable: true },
            },
          },
          400: errorResponse,
          403: errorResponse,
          404: errorResponse,
          500: errorResponse,
        },
      },
    },
    getStatusHandler
  );

  // Wrapper for /api/2.0/workspace/get-status
  // GET /api/v1/workspace/get?path=Users/me/.claude
  fastify.get(
    '/get',
    {
      schema: {
        tags: ['workspace'],
        summary: 'Get workspace object',
        description: 'Wrapper for Databricks /api/2.0/workspace/get-status',
        querystring: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Full workspace path' },
          },
          required: ['path'],
        },
        response: {
          200: { type: 'object' },
          400: { type: 'object' },
        },
      },
    },
    getWorkspaceObjectHandler
  );

  // Wrapper for /api/2.0/workspace/list
  // GET /api/v1/workspace/list?path=Users/me/.claude
  fastify.get(
    '/list',
    {
      schema: {
        tags: ['workspace'],
        summary: 'List workspace directory',
        description: 'Wrapper for Databricks /api/2.0/workspace/list',
        querystring: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Full workspace path' },
          },
          required: ['path'],
        },
        response: {
          200: { type: 'object' },
          400: { type: 'object' },
        },
      },
    },
    listWorkspaceHandler
  );

  // Wrapper for /api/2.0/workspace/mkdirs
  // POST /api/v1/workspace/mkdirs
  fastify.post(
    '/mkdirs',
    {
      schema: {
        tags: ['workspace'],
        summary: 'Create directory',
        description: 'Wrapper for Databricks /api/2.0/workspace/mkdirs',
        body: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Full workspace path' },
          },
          required: ['path'],
        },
        response: {
          200: { type: 'object' },
          400: { type: 'object' },
        },
      },
    },
    mkdirsHandler
  );

  // List user's workspace directory (uses Service Principal token)
  // GET /api/v1/Workspace/Users/:email
  // Note: 'me' is resolved to actual email from header
  fastify.get(
    '/users/:email',
    {
      schema: {
        tags: ['workspace'],
        summary: 'List user workspace',
        description:
          'List user workspace directory. Use "me" to list current user directory.',
        params: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'User email or "me"' },
          },
          required: ['email'],
        },
        response: {
          200: workspaceListResponse,
          400: errorResponse,
          403: errorResponse,
          500: errorResponse,
        },
      },
    },
    listUserWorkspaceHandler
  );

  // List any workspace path (uses Service Principal token)
  // GET /api/v1/Workspace/*
  // Supports: /Users/me/..., /Users/:email/..., /Shared/...
  fastify.get(
    '/*',
    {
      schema: {
        tags: ['workspace'],
        summary: 'List workspace path',
        description: 'List any workspace path. Supports Users/me, Shared, etc.',
        params: {
          type: 'object',
          properties: {
            '*': { type: 'string', description: 'Workspace subpath' },
          },
        },
        response: {
          200: workspaceListResponse,
          403: errorResponse,
          500: errorResponse,
        },
      },
    },
    listWorkspacePathHandler
  );

  // Create a directory in workspace
  // POST /api/v1/Workspace/*
  // Example: POST /api/v1/Workspace/Users/me/new-folder
  fastify.post(
    '/*',
    {
      schema: {
        tags: ['workspace'],
        summary: 'Create directory',
        description: 'Create a directory in workspace',
        params: {
          type: 'object',
          properties: {
            '*': { type: 'string', description: 'Workspace subpath' },
          },
        },
        body: {
          type: 'object',
          properties: {
            object_type: { type: 'string', enum: ['DIRECTORY'] },
          },
          required: ['object_type'],
        },
        response: {
          200: { type: 'object' },
          400: errorResponse,
          403: errorResponse,
          500: errorResponse,
        },
      },
    },
    createDirectoryHandler
  );
};

export default workspaceRoutes;
