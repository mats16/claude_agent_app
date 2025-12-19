import { getAccessToken, databricksHost } from '../agent/index.js';

export interface WorkspaceObject {
  path: string;
  object_type: string;
}

export interface WorkspaceListResult {
  objects: WorkspaceObject[];
}

export class WorkspaceError extends Error {
  constructor(
    message: string,
    public readonly code: 'PERMISSION_DENIED' | 'NOT_FOUND' | 'API_ERROR'
  ) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

// Get root workspace directories
export function getRootWorkspace(): WorkspaceListResult {
  return {
    objects: [
      { path: '/Workspace/Users', object_type: 'DIRECTORY' },
      { path: '/Workspace/Shared', object_type: 'DIRECTORY' },
    ],
  };
}

// List workspace directory contents
export async function listWorkspace(
  workspacePath: string
): Promise<WorkspaceListResult> {
  const token = await getAccessToken();
  const response = await fetch(
    `${databricksHost}/api/2.0/workspace/list?path=${encodeURIComponent(workspacePath)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const data = (await response.json()) as {
    objects?: Array<{ path: string; object_type: string }>;
    error_code?: string;
    message?: string;
  };

  // Check for permission error - empty response {} also means no permission
  if (data.error_code === 'PERMISSION_DENIED' || !('objects' in data)) {
    throw new WorkspaceError('Permission denied', 'PERMISSION_DENIED');
  }

  // Check for other API errors
  if (data.error_code) {
    throw new WorkspaceError(data.message || 'API error', 'API_ERROR');
  }

  return { objects: data.objects || [] };
}

// List user's workspace directory
export async function listUserWorkspace(
  email: string
): Promise<WorkspaceListResult> {
  const workspacePath = `/Workspace/Users/${email}`;
  return listWorkspace(workspacePath);
}

// List any workspace path (Shared, Repos, etc.)
export async function listWorkspacePath(
  subpath: string
): Promise<WorkspaceListResult> {
  const wsPath = `/Workspace/${subpath}`;
  return listWorkspace(wsPath);
}

// Create a directory in workspace
export async function createDirectory(
  workspacePath: string
): Promise<{ path: string }> {
  const token = await getAccessToken();
  const response = await fetch(`${databricksHost}/api/2.0/workspace/mkdirs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: workspacePath }),
  });

  const data = (await response.json()) as {
    error_code?: string;
    message?: string;
  };

  if (data.error_code === 'PERMISSION_DENIED') {
    throw new WorkspaceError('Permission denied', 'PERMISSION_DENIED');
  }

  if (data.error_code) {
    throw new WorkspaceError(data.message || 'API error', 'API_ERROR');
  }

  return { path: workspacePath };
}
