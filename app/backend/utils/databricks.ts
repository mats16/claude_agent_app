import { exec } from 'child_process';
import { promisify } from 'util';
import { rm } from 'fs/promises';
import { getAccessToken, databricksHost } from '../agent/index.js';

const execAsync = promisify(exec);

// .claude ディレクトリ同期用の除外フラグ
export const claudeConfigSyncFlags = [
  '--exclude',
  '".claude.json.corrupted.*"',
  '--exclude',
  '"debug/*"',
  '--exclude',
  '"telemetry/*"',
  '--exclude',
  '"shell-snapshots/*"',
].join(' ');

// 作業ディレクトリ同期用の除外フラグ
export const workspaceSyncFlags = [
  '--exclude',
  '".bundle/*"',
  // Python
  '--exclude',
  '"*.pyc"',
  '--exclude',
  '"__pycache__"',
  // Node.js
  '--exclude',
  '"node_modules/*"',
  '--exclude',
  '".turbo/*"',
].join(' ');

/**
 * Pull from workspace to local (workspace -> local)
 * Uses: databricks workspace export-dir
 * @param overwrite - If true, adds --overwrite flag to overwrite existing local files
 * @param token - Optional SP token to use for authentication
 */
export async function workspacePull(
  workspacePath: string,
  localPath: string,
  overwrite: boolean = false,
  token?: string
): Promise<void> {
  const overwriteFlag = overwrite ? ' --overwrite' : '';
  const cmd = `databricks workspace export-dir "${workspacePath}" "${localPath}"${overwriteFlag}`;
  try {
    //const env = token ? { ...process.env, DATABRICKS_TOKEN: token } : process.env;
    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      DATABRICKS_HOST: databricksHost,
      DATABRICKS_TOKEN: token ?? process.env.DATABRICKS_SP_TOKEN,
    };
    await execAsync(cmd, { env });
  } catch (error: any) {
    console.error(`[workspacePull] Error: ${error.message}`);
  }
}

/**
 * Push from local to workspace (local -> workspace)
 * Uses: databricks sync
 * @param token - SP token to use for authentication (required)
 * @param localPath - Local directory path to sync from
 * @param workspacePath - Databricks workspace destination path
 * @param flags - Additional flags to pass to databricks sync command
 * @param replace - If true, deletes workspace directory before sync to propagate deletions
 */
export async function workspacePush(
  token: string,
  localPath: string,
  workspacePath: string,
  flags?: string,
  replace?: boolean
): Promise<void> {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    DATABRICKS_HOST: databricksHost,
    DATABRICKS_TOKEN: token,
  };

  // replace が有効な場合、先にWorkspaceディレクトリを削除
  if (replace) {
    const deleteCmd = `databricks workspace delete "${workspacePath}" --recursive`;
    try {
      await execAsync(deleteCmd, { env });
      console.log(
        `[workspacePush] Deleted workspace directory: ${workspacePath}`
      );
    } catch (error: any) {
      // ディレクトリが存在しない場合はエラーを無視
      if (
        !error.message.includes('RESOURCE_DOES_NOT_EXIST') &&
        !error.message.includes('does not exist')
      ) {
        console.error(
          `[workspacePush] Delete error (continuing): ${error.message}`
        );
      }
    }
  }

  const cmdParts = ['databricks', 'sync', localPath, workspacePath];

  cmdParts.push('--output', 'json', '--exclude-from', '.gitignore');

  // 追加フラグを末尾に連結
  const cmd = cmdParts.join(' ') + (flags ? ` ${flags}` : '');

  try {
    await execAsync(cmd, { env });
  } catch (error: any) {
    console.error(`[workspacePush] Error: ${error.message}`);
  }
}

/**
 * Ensure workspace directory exists (creates recursively if needed)
 * Uses: Databricks Workspace API /api/2.0/workspace/mkdirs
 * Returns 200 even if directory already exists
 * @param token - Optional SP token to use for authentication
 */
export async function ensureWorkspaceDirectory(
  workspacePath: string,
  token?: string
): Promise<void> {
  try {
    const accessToken = token ?? (await getAccessToken());
    const response = await fetch(`${databricksHost}/api/2.0/workspace/mkdirs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: workspacePath }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create workspace directory: ${errorText}`);
    }
  } catch (error: any) {
    console.error(
      `[ensureWorkspaceDirectory] Error creating ${workspacePath}: ${error.message}`
    );
    throw error;
  }
}

/**
 * Delete working directory
 * Uses fire-and-forget pattern for background deletion
 */
export async function deleteWorkDir(localPath: string): Promise<void> {
  try {
    await rm(localPath, { recursive: true, force: true });
    console.log(`[deleteWorkDir] Successfully deleted: ${localPath}`);
  } catch (error: any) {
    console.error(
      `[deleteWorkDir] Error deleting ${localPath}: ${error.message}`
    );
  }
}
