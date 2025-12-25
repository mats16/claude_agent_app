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

const workspaceRoutes: FastifyPluginAsync = async (fastify) => {
  // List root workspace (returns Users and Shared)
  // GET /api/v1/Workspace
  fastify.get('/', listRootWorkspaceHandler);

  // Get workspace object status (including object_id and browse_url)
  // GET /api/v1/Workspace/status?path=Users/me/.claude
  // Must be registered before wildcard route
  fastify.get('/status', getStatusHandler);

  // Wrapper for /api/2.0/workspace/get-status
  // GET /api/v1/workspace/get?path=Users/me/.claude
  fastify.get('/get', getWorkspaceObjectHandler);

  // Wrapper for /api/2.0/workspace/list
  // GET /api/v1/workspace/list?path=Users/me/.claude
  fastify.get('/list', listWorkspaceHandler);

  // Wrapper for /api/2.0/workspace/mkdirs
  // POST /api/v1/workspace/mkdirs
  fastify.post('/mkdirs', mkdirsHandler);

  // List user's workspace directory (uses Service Principal token)
  // GET /api/v1/Workspace/Users/:email
  // Note: 'me' is resolved to actual email from header
  fastify.get('/users/:email', listUserWorkspaceHandler);

  // List any workspace path (uses Service Principal token)
  // GET /api/v1/Workspace/*
  // Supports: /Users/me/..., /Users/:email/..., /Shared/...
  fastify.get('/*', listWorkspacePathHandler);

  // Create a directory in workspace
  // POST /api/v1/Workspace/*
  // Example: POST /api/v1/Workspace/Users/me/new-folder
  fastify.post('/*', createDirectoryHandler);
};

export default workspaceRoutes;
