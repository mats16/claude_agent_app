import type { FastifyRequest, FastifyReply } from 'fastify';
import { extractRequestContext } from '../../../utils/headers.js';
import * as workspaceService from '../../../services/workspaceService.js';

// List root workspace (returns Users and Shared)
export async function listRootWorkspaceHandler(
  _request: FastifyRequest,
  _reply: FastifyReply
) {
  return workspaceService.getRootWorkspace();
}

// List user's workspace directory (uses Service Principal token)
export async function listUserWorkspaceHandler(
  request: FastifyRequest<{ Params: { email: string } }>,
  reply: FastifyReply
) {
  let email: string | undefined = request.params.email;

  // Resolve 'me' to actual email from header
  if (email === 'me') {
    try {
      const context = extractRequestContext(request);
      email = context.userEmail;
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  if (!email) {
    return reply.status(400).send({ error: 'Email required' });
  }

  try {
    const result = await workspaceService.listUserWorkspace(email);
    return result;
  } catch (error: any) {
    if (error instanceof workspaceService.WorkspaceError) {
      if (error.code === 'PERMISSION_DENIED') {
        return reply.status(403).send({ error: 'PERMISSION_DENIED' });
      }
      if (error.code === 'API_ERROR') {
        return reply.status(400).send({ error: error.message });
      }
    }
    return reply.status(500).send({ error: error.message });
  }
}

// Convert lowercase API path to Databricks workspace path
// e.g., "users/foo@example.com/bar" -> "Users/foo@example.com/bar"
//       "shared/project" -> "Shared/project"
function convertToWorkspacePath(subpath: string, userEmail?: string): string {
  // Handle users/me/... pattern - replace 'me' with actual email
  if (subpath.startsWith('users/me/') && userEmail) {
    return `Users/${userEmail}/${subpath.slice(9)}`;
  }
  if (subpath === 'users/me' && userEmail) {
    return `Users/${userEmail}`;
  }

  // Handle users/... pattern
  if (subpath.startsWith('users/')) {
    return `Users/${subpath.slice(6)}`;
  }

  // Handle shared/... pattern
  if (subpath.startsWith('shared/')) {
    return `Shared/${subpath.slice(7)}`;
  }
  if (subpath === 'shared') {
    return 'Shared';
  }

  // Return as-is for other paths (already capitalized or unknown)
  return subpath;
}

// List any workspace path (Shared, Repos, etc., uses Service Principal token)
export async function listWorkspacePathHandler(
  request: FastifyRequest<{ Params: { '*': string } }>,
  reply: FastifyReply
) {
  const subpath = request.params['*'];

  // Get user email for 'me' resolution
  let userEmail: string | undefined;
  try {
    const context = extractRequestContext(request);
    userEmail = context.userEmail;
  } catch {
    // Ignore - userEmail will be undefined
  }

  // Convert lowercase API path to Databricks workspace path
  const workspacePath = convertToWorkspacePath(subpath, userEmail);

  try {
    const result = await workspaceService.listWorkspacePath(workspacePath);
    return result;
  } catch (error: any) {
    if (error instanceof workspaceService.WorkspaceError) {
      if (error.code === 'PERMISSION_DENIED') {
        return reply.status(403).send({ error: 'PERMISSION_DENIED' });
      }
    }
    return reply.status(500).send({ error: error.message });
  }
}

// Create a directory in workspace
// POST /api/v1/workspace/*
// Example: POST /api/v1/workspace/users/me/new-folder
// Body: { object_type: "DIRECTORY" }
export async function createDirectoryHandler(
  request: FastifyRequest<{
    Params: { '*': string };
    Body: { object_type: string };
  }>,
  reply: FastifyReply
) {
  const subpath = request.params['*'];
  const { object_type } = request.body || {};

  if (!subpath) {
    return reply.status(400).send({ error: 'Path is required' });
  }

  if (object_type !== 'DIRECTORY') {
    return reply
      .status(400)
      .send({ error: 'Only DIRECTORY object_type is supported' });
  }

  // Get user email for 'me' resolution
  let userEmail: string | undefined;
  try {
    const context = extractRequestContext(request);
    userEmail = context.userEmail;
  } catch {
    // Ignore - userEmail will be undefined
  }

  // Convert lowercase API path to Databricks workspace path
  const workspacePath = `/Workspace/${convertToWorkspacePath(subpath, userEmail)}`;

  try {
    const result = await workspaceService.createDirectory(workspacePath);
    return result;
  } catch (error: any) {
    if (error instanceof workspaceService.WorkspaceError) {
      if (error.code === 'PERMISSION_DENIED') {
        return reply.status(403).send({ error: 'PERMISSION_DENIED' });
      }
      if (error.code === 'API_ERROR') {
        return reply.status(400).send({ error: error.message });
      }
    }
    return reply.status(500).send({ error: error.message });
  }
}
