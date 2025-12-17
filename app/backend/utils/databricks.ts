import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Pull from workspace to local (workspace -> local)
 * Uses: databricks workspace export-dir
 * @param overwrite - If true, adds --overwrite flag to overwrite existing local files
 */
export async function workspacePull(
  workspacePath: string,
  localPath: string,
  overwrite: boolean = false
): Promise<void> {
  const overwriteFlag = overwrite ? ' --overwrite' : '';
  const cmd = `databricks workspace export-dir "${workspacePath}" "${localPath}"${overwriteFlag}`;
  try {
    await execAsync(cmd);
  } catch (error: any) {
    console.error(`[workspacePull] Error: ${error.message}`);
  }
}

/**
 * Push from local to workspace (local -> workspace)
 * Uses: databricks sync
 */
export async function workspacePush(
  localPath: string,
  workspacePath: string
): Promise<void> {
  const cmd = [
    'databricks',
    'sync',
    localPath,
    workspacePath,
    '--output',
    'json',
    '--exclude-from',
    '.gitignore',
    // Claude Code - exclude entire directories
    '--exclude',
    '".claude.json.corrupted.*"',
    '--exclude',
    '"debug/*"',
    '--exclude',
    '"telemetry/*"',
    '--exclude',
    '"shell-snapshots/*"',
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
  try {
    await execAsync(cmd);
  } catch (error: any) {
    console.error(`[workspacePush] Error: ${error.message}`);
  }
}
