import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface WorkspaceClientConfig {
  /** Databricks workspace host (e.g., "your-workspace.cloud.databricks.com") */
  host: string;
  /** Function to get access token (allows token refresh) */
  getToken: () => Promise<string>;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

export type WorkspaceObjectType =
  | 'DIRECTORY'
  | 'FILE'
  | 'NOTEBOOK'
  | 'REPO'
  | 'LIBRARY';

export interface WorkspaceObject {
  path: string;
  object_type: WorkspaceObjectType;
  object_id?: number;
  language?: 'PYTHON' | 'SCALA' | 'SQL' | 'R';
  created_at?: number;
  modified_at?: number;
  size?: number;
}

export interface ListObjectsResponse {
  objects: WorkspaceObject[];
}

export interface HeadObjectResponse {
  path: string;
  object_type: WorkspaceObjectType;
  object_id?: number;
  language?: 'PYTHON' | 'SCALA' | 'SQL' | 'R';
  created_at?: number;
  modified_at?: number;
  size?: number;
}

export interface PutObjectOptions {
  /** Overwrite if exists (default: false) */
  overwrite?: boolean;
  /** File format for notebooks (default: AUTO) */
  format?: 'SOURCE' | 'HTML' | 'JUPYTER' | 'DBC' | 'AUTO';
  /** Language for notebooks */
  language?: 'PYTHON' | 'SCALA' | 'SQL' | 'R';
}

export interface PutObjectResponse {
  path: string;
}

export interface GetObjectResponse {
  path: string;
  content: Buffer;
  object_type: WorkspaceObjectType;
}

export interface DeleteObjectOptions {
  /** Delete recursively for directories (default: auto-detect via headObject) */
  recursive?: boolean;
}

export interface DeleteObjectResponse {
  path: string;
  deleted: boolean;
}

export interface SyncOptions {
  /** Delete files in dest that don't exist in src (default: false) */
  delete?: boolean;
  /** Overwrite existing files (default: true) */
  overwrite?: boolean;
  /** Glob patterns to exclude */
  exclude?: string[];
  /** Full sync mode - sync all files without .gitignore exclusions (default: false) */
  full?: boolean;
}

export interface SyncResult {
  direction: 'push' | 'pull';
  success: boolean;
  error?: string;
}

export type WorkspaceErrorCode =
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_PATH'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'API_ERROR';

export class WorkspaceClientError extends Error {
  constructor(
    message: string,
    public readonly code: WorkspaceErrorCode,
    public readonly httpStatus?: number,
    public readonly path?: string
  ) {
    super(message);
    this.name = 'WorkspaceClientError';
  }
}

// ============================================================================
// WorkspaceClient
// ============================================================================

export class WorkspaceClient {
  private readonly baseUrl: string;
  private readonly host: string;
  private readonly getToken: () => Promise<string>;
  private readonly timeout: number;

  constructor(config: WorkspaceClientConfig) {
    // Ensure host doesn't have protocol
    this.host = config.host.replace(/^https?:\/\//, '');
    this.baseUrl = `https://${this.host}`;
    this.getToken = config.getToken;
    this.timeout = config.timeout ?? 30000;
  }

  // --------------------------------------------------------------------------
  // Public Methods
  // --------------------------------------------------------------------------

  /**
   * List objects in a workspace directory
   */
  async listObjects(path: string): Promise<ListObjectsResponse> {
    const token = await this.getToken();
    const url = `${this.baseUrl}/api/2.0/workspace/list?path=${encodeURIComponent(path)}`;

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await this.handleResponse<{ objects?: WorkspaceObject[] }>(
      response,
      path
    );
    return { objects: data.objects ?? [] };
  }

  /**
   * Get object status/metadata
   */
  async headObject(path: string): Promise<HeadObjectResponse> {
    const token = await this.getToken();
    const url = `${this.baseUrl}/api/2.0/workspace/get-status?path=${encodeURIComponent(path)}`;

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    return await this.handleResponse<HeadObjectResponse>(response, path);
  }

  /**
   * Upload a file to workspace
   * Parent directories are created automatically
   */
  async putObject(
    path: string,
    content: string | Buffer,
    options: PutObjectOptions = {}
  ): Promise<PutObjectResponse> {
    // Auto-create parent directory
    const parentDir = path.substring(0, path.lastIndexOf('/'));
    if (parentDir) {
      await this.mkdirs(parentDir);
    }

    const token = await this.getToken();
    const url = `${this.baseUrl}/api/2.0/workspace/import`;

    // Convert content to base64
    const contentBuffer =
      typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    const base64Content = contentBuffer.toString('base64');

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path,
        content: base64Content,
        overwrite: options.overwrite ?? false,
        format: options.format ?? 'AUTO',
        language: options.language,
      }),
    });

    await this.handleResponse(response, path);
    return { path };
  }

  /**
   * Download a file from workspace
   */
  async getObject(path: string): Promise<GetObjectResponse> {
    const token = await this.getToken();
    const url = `${this.baseUrl}/api/2.0/workspace/export?path=${encodeURIComponent(path)}&format=AUTO`;

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await this.handleResponse<{
      content: string;
      file_type?: WorkspaceObjectType;
    }>(response, path);

    // Decode base64 content
    const content = Buffer.from(data.content, 'base64');

    return {
      path,
      content,
      object_type: data.file_type ?? 'FILE',
    };
  }

  /**
   * Delete a file or directory from workspace
   * Automatically detects if path is a directory and sets recursive accordingly
   */
  async deleteObject(
    path: string,
    options: DeleteObjectOptions = {}
  ): Promise<DeleteObjectResponse> {
    let recursive = options.recursive;

    // Auto-detect if directory when recursive not specified
    if (recursive === undefined) {
      try {
        const info = await this.headObject(path);
        recursive = info.object_type === 'DIRECTORY';
      } catch (error) {
        // If headObject fails (e.g., not found), assume not recursive
        if (
          error instanceof WorkspaceClientError &&
          error.code === 'NOT_FOUND'
        ) {
          return { path, deleted: false };
        }
        throw error;
      }
    }

    const token = await this.getToken();
    const url = `${this.baseUrl}/api/2.0/workspace/delete`;

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path,
        recursive,
      }),
    });

    // 404 is acceptable for delete (already doesn't exist)
    if (response.status === 404) {
      return { path, deleted: false };
    }

    await this.handleResponse(response, path);
    return { path, deleted: true };
  }

  /**
   * Sync files between local filesystem and workspace using Databricks CLI
   * Direction is determined by path prefixes:
   * - src starts with /Workspace, dest doesn't → pull (workspace → local)
   * - dest starts with /Workspace, src doesn't → push (local → workspace)
   */
  async sync(
    src: string,
    dest: string,
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const direction = this.detectSyncDirection(src, dest);
    const token = await this.getToken();

    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      DATABRICKS_HOST: this.baseUrl,
      DATABRICKS_TOKEN: token,
    };

    try {
      if (direction === 'push') {
        await this.syncPush(src, dest, options, env);
      } else {
        await this.syncPull(src, dest, options, env);
      }
      return { direction, success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[WorkspaceClient] Sync ${direction} error: ${message}`);
      return { direction, success: false, error: message };
    }
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  /**
   * Create directory recursively (internal use)
   */
  private async mkdirs(path: string): Promise<void> {
    const token = await this.getToken();
    const url = `${this.baseUrl}/api/2.0/workspace/mkdirs`;

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path }),
    });

    // mkdirs returns 200 even if directory already exists
    await this.handleResponse(response, path);
  }

  /**
   * Fetch with timeout support
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new WorkspaceClientError(
          `Request timed out after ${this.timeout}ms`,
          'TIMEOUT'
        );
      }
      throw new WorkspaceClientError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        'NETWORK_ERROR'
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Handle API response and convert errors
   */
  private async handleResponse<T>(
    response: Response,
    path?: string
  ): Promise<T> {
    if (response.ok) {
      const text = await response.text();
      return text ? JSON.parse(text) : ({} as T);
    }

    let errorData: { error_code?: string; message?: string } = {};
    try {
      errorData = (await response.json()) as {
        error_code?: string;
        message?: string;
      };
    } catch {
      // Ignore JSON parse errors
    }

    const errorCode = errorData.error_code;
    const message =
      errorData.message || `HTTP ${response.status}: ${response.statusText}`;

    switch (errorCode) {
      case 'PERMISSION_DENIED':
        throw new WorkspaceClientError(
          message,
          'PERMISSION_DENIED',
          response.status,
          path
        );
      case 'RESOURCE_DOES_NOT_EXIST':
        throw new WorkspaceClientError(
          message,
          'NOT_FOUND',
          response.status,
          path
        );
      case 'RESOURCE_ALREADY_EXISTS':
        throw new WorkspaceClientError(
          message,
          'ALREADY_EXISTS',
          response.status,
          path
        );
      case 'QUOTA_EXCEEDED':
        throw new WorkspaceClientError(
          message,
          'QUOTA_EXCEEDED',
          response.status,
          path
        );
      case 'INVALID_PARAMETER_VALUE':
        throw new WorkspaceClientError(
          message,
          'INVALID_PATH',
          response.status,
          path
        );
      default:
        throw new WorkspaceClientError(
          message,
          'API_ERROR',
          response.status,
          path
        );
    }
  }

  /**
   * Detect sync direction from paths
   */
  private detectSyncDirection(src: string, dest: string): 'push' | 'pull' {
    const srcIsWorkspace = src.startsWith('/Workspace');
    const destIsWorkspace = dest.startsWith('/Workspace');

    if (srcIsWorkspace && !destIsWorkspace) {
      return 'pull'; // workspace → local
    } else if (!srcIsWorkspace && destIsWorkspace) {
      return 'push'; // local → workspace
    } else {
      throw new WorkspaceClientError(
        'Invalid sync paths: exactly one path must start with /Workspace',
        'INVALID_PATH'
      );
    }
  }

  /**
   * Push from local to workspace using `databricks sync`
   */
  private async syncPush(
    localPath: string,
    workspacePath: string,
    options: SyncOptions,
    env: Record<string, string | undefined>
  ): Promise<void> {
    // Delete workspace directory first if delete option is enabled
    if (options.delete) {
      const deleteCmd = `databricks workspace delete "${workspacePath}" --recursive`;
      try {
        await execAsync(deleteCmd, { env });
        console.log(
          `[WorkspaceClient] Deleted workspace directory: ${workspacePath}`
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        // Ignore if directory doesn't exist
        if (
          !message.includes('RESOURCE_DOES_NOT_EXIST') &&
          !message.includes('does not exist')
        ) {
          console.error(
            `[WorkspaceClient] Delete error (continuing): ${message}`
          );
        }
      }
    }

    // Build databricks sync command
    const cmdParts = [
      'databricks',
      'sync',
      `"${localPath}"`,
      `"${workspacePath}"`,
    ];
    cmdParts.push('--output', 'json');

    // Full sync mode or use .gitignore
    if (options.full) {
      cmdParts.push('--full');
    } else {
      cmdParts.push('--exclude-from', '.gitignore');
    }

    // Add exclude patterns
    if (options.exclude && options.exclude.length > 0) {
      for (const pattern of options.exclude) {
        cmdParts.push('--exclude', `"${pattern}"`);
      }
    }

    const cmd = cmdParts.join(' ');
    console.log(`[WorkspaceClient] Running: ${cmd}`);

    await execAsync(cmd, { env });
  }

  /**
   * Pull from workspace to local using `databricks workspace export-dir`
   */
  private async syncPull(
    workspacePath: string,
    localPath: string,
    options: SyncOptions,
    env: Record<string, string | undefined>
  ): Promise<void> {
    const overwriteFlag = options.overwrite !== false ? ' --overwrite' : '';
    const cmd = `databricks workspace export-dir "${workspacePath}" "${localPath}"${overwriteFlag}`;

    console.log(`[WorkspaceClient] Running: ${cmd}`);

    await execAsync(cmd, { env });
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

// Exclude patterns for .claude directory sync
export const claudeConfigExcludePatterns = [
  '.claude.json.corrupted.*',
  'debug/*',
  'telemetry/*',
  'shell-snapshots/*',
];

// Exclude patterns for workspace directory sync
export const workspaceExcludePatterns = [
  '.bundle/*',
  '*.pyc',
  '__pycache__',
  'node_modules/*',
  '.turbo/*',
];
