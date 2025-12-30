import { getAccessToken } from './agent.service.js';
import { databricks } from '../config/index.js';

export interface WorkspaceObject {
  path: string;
  object_type: string;
}

export interface WorkspaceListResult {
  objects: WorkspaceObject[];
  browse_url?: string | null;
}

export interface WorkspaceStatus {
  path: string;
  object_type: string;
  object_id: number | null;
  browse_url: string | null;
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
  workspacePath: string,
  accessToken?: string
): Promise<WorkspaceListResult> {
  const token = accessToken ?? (await getAccessToken());
  const response = await fetch(
    `${databricks.hostUrl}/api/2.0/workspace/list?path=${encodeURIComponent(workspacePath)}`,
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
  email: string,
  accessToken?: string
): Promise<WorkspaceListResult> {
  const workspacePath = `/Workspace/Users/${email}`;
  return listWorkspace(workspacePath, accessToken);
}

// List any workspace path (Shared, Repos, etc.)
export async function listWorkspacePath(
  subpath: string,
  accessToken?: string
): Promise<WorkspaceListResult> {
  const wsPath = `/Workspace/${subpath}`;
  return listWorkspace(wsPath, accessToken);
}

// Create a directory in workspace
export async function createDirectory(
  workspacePath: string,
  accessToken?: string
): Promise<{ path: string }> {
  const token = accessToken ?? (await getAccessToken());
  const response = await fetch(
    `${databricks.hostUrl}/api/2.0/workspace/mkdirs`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: workspacePath }),
    }
  );

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

// Get workspace object status (including object_id and browse_url)
export async function getStatus(
  workspacePath: string,
  accessToken?: string
): Promise<WorkspaceStatus> {
  const token = accessToken ?? (await getAccessToken());
  const response = await fetch(
    `${databricks.hostUrl}/api/2.0/workspace/get-status?path=${encodeURIComponent(workspacePath)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const data = (await response.json()) as {
    path?: string;
    object_type?: string;
    object_id?: number;
    error_code?: string;
    message?: string;
  };

  if (data.error_code === 'PERMISSION_DENIED') {
    throw new WorkspaceError('Permission denied', 'PERMISSION_DENIED');
  }

  if (data.error_code === 'RESOURCE_DOES_NOT_EXIST') {
    throw new WorkspaceError('Resource not found', 'NOT_FOUND');
  }

  if (data.error_code) {
    throw new WorkspaceError(data.message || 'API error', 'API_ERROR');
  }

  // Build browse_url from databricks.hostUrl and object_id
  const browseUrl =
    data.object_id != null
      ? `${databricks.hostUrl}/browse/folders/${data.object_id}`
      : null;

  return {
    path: data.path || workspacePath,
    object_type: data.object_type || 'UNKNOWN',
    object_id: data.object_id ?? null,
    browse_url: browseUrl,
  };
}

// Raw API response interface
export interface RawApiResponse {
  status: number;
  body: unknown;
}

// Raw wrapper for /api/2.0/workspace/get-status
// Returns the original response status and body from Databricks API
export async function getStatusRaw(
  workspacePath: string,
  accessToken?: string
): Promise<RawApiResponse> {
  const token = accessToken ?? (await getAccessToken());
  const response = await fetch(
    `${databricks.hostUrl}/api/2.0/workspace/get-status?path=${encodeURIComponent(workspacePath)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const body = await response.json();
  return { status: response.status, body };
}

// Raw wrapper for /api/2.0/workspace/list
// Returns the original response status and body from Databricks API
export async function listWorkspaceRaw(
  workspacePath: string,
  accessToken?: string
): Promise<RawApiResponse> {
  const token = accessToken ?? (await getAccessToken());
  const response = await fetch(
    `${databricks.hostUrl}/api/2.0/workspace/list?path=${encodeURIComponent(workspacePath)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const body = await response.json();
  return { status: response.status, body };
}

// Raw wrapper for /api/2.0/workspace/mkdirs
// Returns the original response status and body from Databricks API
export async function mkdirsRaw(
  workspacePath: string,
  accessToken?: string
): Promise<RawApiResponse> {
  const token = accessToken ?? (await getAccessToken());
  const response = await fetch(
    `${databricks.hostUrl}/api/2.0/workspace/mkdirs`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: workspacePath }),
    }
  );

  const body = await response.json();
  return { status: response.status, body };
}
