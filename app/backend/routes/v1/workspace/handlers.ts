import type { FastifyRequest, FastifyReply } from 'fastify';
import { extractRequestContext } from '../../../utils/headers.js';
import { getPersonalAccessToken } from '../../../services/user.service.js';
import * as workspaceService from '../../../services/workspace.service.js';

// List root workspace (returns Users and Shared)
export async function listRootWorkspaceHandler(
  _request: FastifyRequest,
  _reply: FastifyReply
) {
  return workspaceService.getRootWorkspace();
}

// List user's workspace directory (uses PAT if available, falls back to Service Principal)
export async function listUserWorkspaceHandler(
  request: FastifyRequest<{ Params: { email: string } }>,
  reply: FastifyReply
) {
  let email: string | undefined = request.params.email;
  let userId: string | undefined;

  // Extract context for userId and 'me' resolution
  try {
    const context = extractRequestContext(request);
    userId = context.user.sub;
    if (email === 'me') {
      email = context.user.email;
    }
  } catch (error: any) {
    if (email === 'me') {
      return reply.status(400).send({ error: error.message });
    }
    // For non-'me' paths, continue without userId (will use SP)
  }

  if (!email) {
    return reply.status(400).send({ error: 'Email required' });
  }

  try {
    const accessToken = userId
      ? await getPersonalAccessToken(userId)
      : undefined;
    const result = await workspaceService.listUserWorkspace(email, accessToken);
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

// Convert API path to Databricks workspace path
// Supports both lowercase and capitalized paths:
// e.g., "users/foo@example.com/bar" -> "Users/foo@example.com/bar"
//       "Users/foo@example.com/bar" -> "Users/foo@example.com/bar"
//       "shared/project" -> "Shared/project"
//       "Shared/project" -> "Shared/project"
function convertToWorkspacePath(subpath: string, userEmail?: string): string {
  // Handle users/me/... or Users/me/... pattern - replace 'me' with actual email
  if (/^[Uu]sers\/me\//.test(subpath) && userEmail) {
    return `Users/${userEmail}/${subpath.slice(9)}`;
  }
  if (/^[Uu]sers\/me$/.test(subpath) && userEmail) {
    return `Users/${userEmail}`;
  }

  // Handle users/... or Users/... pattern
  if (/^[Uu]sers\//.test(subpath)) {
    return `Users/${subpath.slice(6)}`;
  }

  // Handle shared/... or Shared/... pattern
  if (/^[Ss]hared\//.test(subpath)) {
    return `Shared/${subpath.slice(7)}`;
  }
  if (/^[Ss]hared$/.test(subpath)) {
    return 'Shared';
  }

  // Return as-is for other paths
  return subpath;
}

// List any workspace path (Shared, Repos, etc., uses PAT if available, falls back to Service Principal)
export async function listWorkspacePathHandler(
  request: FastifyRequest<{ Params: { '*': string } }>,
  reply: FastifyReply
) {
  const subpath = request.params['*'];

  // Get user context for 'me' resolution and PAT auth
  let userEmail: string | undefined;
  let userId: string | undefined;
  try {
    const context = extractRequestContext(request);
    userEmail = context.user.email;
    userId = context.user.sub;
  } catch {
    // Ignore - will use SP token
  }

  // Convert lowercase API path to Databricks workspace path
  const workspacePath = convertToWorkspacePath(subpath, userEmail);
  const fullWorkspacePath = `/Workspace/${workspacePath}`;

  try {
    const accessToken = userId
      ? await getPersonalAccessToken(userId)
      : undefined;
    // Fetch list and status in parallel to get browse_url
    const [listResult, statusResult] = await Promise.all([
      workspaceService.listWorkspacePath(workspacePath, accessToken),
      workspaceService
        .getStatus(fullWorkspacePath, accessToken)
        .catch(() => null),
    ]);

    return {
      ...listResult,
      browse_url: statusResult?.browse_url ?? null,
    };
  } catch (error: any) {
    if (error instanceof workspaceService.WorkspaceError) {
      if (error.code === 'PERMISSION_DENIED') {
        return reply.status(403).send({ error: 'PERMISSION_DENIED' });
      }
    }
    return reply.status(500).send({ error: error.message });
  }
}

// Get workspace object status
// GET /api/v1/Workspace/status?path=Users/me/.claude
export async function getStatusHandler(
  request: FastifyRequest<{ Querystring: { path: string } }>,
  reply: FastifyReply
) {
  const { path: subpath } = request.query;

  if (!subpath) {
    return reply
      .status(400)
      .send({ error: 'Path query parameter is required' });
  }

  // Get user context for 'me' resolution and PAT auth
  let userEmail: string | undefined;
  let userId: string | undefined;
  try {
    const context = extractRequestContext(request);
    userEmail = context.user.email;
    userId = context.user.sub;
  } catch {
    // Ignore - will use SP token
  }

  // Convert lowercase API path to Databricks workspace path
  const workspacePath = `/Workspace/${convertToWorkspacePath(subpath, userEmail)}`;

  try {
    const accessToken = userId
      ? await getPersonalAccessToken(userId)
      : undefined;
    const result = await workspaceService.getStatus(workspacePath, accessToken);
    return result;
  } catch (error: any) {
    if (error instanceof workspaceService.WorkspaceError) {
      if (error.code === 'PERMISSION_DENIED') {
        return reply.status(403).send({ error: 'PERMISSION_DENIED' });
      }
      if (error.code === 'NOT_FOUND') {
        return reply.status(404).send({ error: 'NOT_FOUND' });
      }
    }
    return reply.status(500).send({ error: error.message });
  }
}

// Create a directory in workspace
// POST /api/v1/Workspace/*
// Example: POST /api/v1/Workspace/Users/me/new-folder
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

  // Get user context for 'me' resolution and PAT auth
  let userEmail: string | undefined;
  let userId: string | undefined;
  try {
    const context = extractRequestContext(request);
    userEmail = context.user.email;
    userId = context.user.sub;
  } catch {
    // Ignore - will use SP token
  }

  // Convert lowercase API path to Databricks workspace path
  const workspacePath = `/Workspace/${convertToWorkspacePath(subpath, userEmail)}`;

  try {
    const accessToken = userId
      ? await getPersonalAccessToken(userId)
      : undefined;
    const result = await workspaceService.createDirectory(
      workspacePath,
      accessToken
    );
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

// Get workspace object status (wrapper for /api/2.0/workspace/get-status)
// GET /api/v1/workspace/get?path=/Workspace/Users/me/.claude
// Returns the original Databricks API response and status code
export async function getWorkspaceObjectHandler(
  request: FastifyRequest<{ Querystring: { path: string } }>,
  reply: FastifyReply
) {
  const { path: rawPath } = request.query;

  if (!rawPath) {
    return reply.status(400).send({
      error_code: 'INVALID_PARAMETER_VALUE',
      message: 'Path query parameter is required',
    });
  }

  // Decode path if URL-encoded
  let workspacePath = decodeURIComponent(rawPath);
  let userId: string | undefined;

  // Resolve 'me' in path to actual user email and get userId for PAT auth
  if (workspacePath.includes('/me')) {
    try {
      const context = extractRequestContext(request);
      userId = context.user.sub;
      workspacePath = workspacePath.replace(
        /\/Users\/me(\/|$)/,
        `/Users/${context.user.email}$1`
      );
    } catch {
      // Ignore - keep original path
    }
  } else {
    // Try to get userId for PAT auth even if path doesn't contain 'me'
    try {
      const context = extractRequestContext(request);
      userId = context.user.sub;
    } catch {
      // Ignore - will use SP token
    }
  }

  const accessToken = userId ? await getPersonalAccessToken(userId) : undefined;
  const result = await workspaceService.getStatusRaw(
    workspacePath,
    accessToken
  );
  return reply.status(result.status).send(result.body);
}

// List workspace directory contents (wrapper for /api/2.0/workspace/list)
// GET /api/v1/workspace/list?path=/Workspace/Users/me/.claude
// Returns the original Databricks API response and status code
export async function listWorkspaceHandler(
  request: FastifyRequest<{ Querystring: { path: string } }>,
  reply: FastifyReply
) {
  const { path: rawPath } = request.query;

  if (!rawPath) {
    return reply.status(400).send({
      error_code: 'INVALID_PARAMETER_VALUE',
      message: 'Path query parameter is required',
    });
  }

  // Decode path if URL-encoded (Fastify should auto-decode but ensure it)
  let workspacePath = decodeURIComponent(rawPath);
  let userId: string | undefined;

  // Resolve 'me' in path to actual user email and get userId for PAT auth
  if (workspacePath.includes('/me')) {
    try {
      const context = extractRequestContext(request);
      userId = context.user.sub;
      workspacePath = workspacePath.replace(
        /\/Users\/me(\/|$)/,
        `/Users/${context.user.email}$1`
      );
    } catch {
      // Ignore - keep original path
    }
  } else {
    // Try to get userId for PAT auth even if path doesn't contain 'me'
    try {
      const context = extractRequestContext(request);
      userId = context.user.sub;
    } catch {
      // Ignore - will use SP token
    }
  }

  const accessToken = userId ? await getPersonalAccessToken(userId) : undefined;
  const result = await workspaceService.listWorkspaceRaw(
    workspacePath,
    accessToken
  );
  return reply.status(result.status).send(result.body);
}

// Create directory in workspace (wrapper for /api/2.0/workspace/mkdirs)
// POST /api/v1/workspace/mkdirs
// Body: { path: "/Workspace/Users/me/new-folder" }
// Returns the original Databricks API response and status code
export async function mkdirsHandler(
  request: FastifyRequest<{ Body: { path: string } }>,
  reply: FastifyReply
) {
  const { path: rawPath } = request.body || {};

  if (!rawPath) {
    return reply.status(400).send({
      error_code: 'INVALID_PARAMETER_VALUE',
      message: 'Path is required in body',
    });
  }

  // Resolve 'me' in path to actual user email and get userId for PAT auth
  let workspacePath = rawPath;
  let userId: string | undefined;
  if (workspacePath.includes('/me')) {
    try {
      const context = extractRequestContext(request);
      userId = context.user.sub;
      workspacePath = workspacePath.replace(
        /\/Users\/me(\/|$)/,
        `/Users/${context.user.email}$1`
      );
    } catch {
      // Ignore - keep original path
    }
  } else {
    // Try to get userId for PAT auth even if path doesn't contain 'me'
    try {
      const context = extractRequestContext(request);
      userId = context.user.sub;
    } catch {
      // Ignore - will use SP token
    }
  }

  const accessToken = userId ? await getPersonalAccessToken(userId) : undefined;
  const result = await workspaceService.mkdirsRaw(workspacePath, accessToken);
  return reply.status(result.status).send(result.body);
}
