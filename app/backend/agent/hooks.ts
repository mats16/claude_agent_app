import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Pull from workspace to local (workspace -> local)
 * Uses: databricks workspace export-dir
 */
export async function workspacePull(
  workspacePath: string,
  localPath: string
): Promise<void> {
  const cmd = `databricks workspace export-dir "${workspacePath}" "${localPath}" --overwrite`;
  console.log(`[workspacePull] ${workspacePath} -> ${localPath}`);
  try {
    const { stdout, stderr } = await execAsync(cmd);
    if (stdout) console.log(`[workspacePull] stdout: ${stdout}`);
    if (stderr) console.log(`[workspacePull] stderr: ${stderr}`);
    console.log(`[workspacePull] Completed`);
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
    '--exclude',
    '"*.pyc"',
    '--exclude',
    '"__pycache__"',
    '--exclude',
    '"node_modules/*"',
    '--exclude',
    '".turbo/*"',
  ].join(' ');
  console.log(`[workspacePush] ${localPath} -> ${workspacePath}`);
  try {
    const { stdout, stderr } = await execAsync(cmd);
    if (stdout) console.log(`[workspacePush] stdout: ${stdout}`);
    if (stderr) console.log(`[workspacePush] stderr: ${stderr}`);
    console.log(`[workspacePush] Completed`);
  } catch (error: any) {
    console.error(`[workspacePush] Error: ${error.message}`);
  }
}
