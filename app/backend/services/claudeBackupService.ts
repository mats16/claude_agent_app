import path from 'path';
import { getOidcAccessToken } from '../agent/index.js';
import { claudeConfigExcludePatterns } from '../utils/workspaceClient.js';
import { enqueuePull, enqueuePush } from './workspaceQueueService.js';

// Convert exclude patterns to CLI flags format for backward compatibility
function buildExcludeFlags(patterns: string[]): string {
  return patterns.map((p) => `--exclude "${p}"`).join(' ');
}

// Get base path for user's local storage
function getLocalBasePath(): string {
  return path.join(process.env.HOME ?? '/tmp', 'u');
}

// Get local claude config path for a user
function getLocalClaudeConfigPath(userEmail: string): string {
  return path.join(getLocalBasePath(), userEmail, '.claude');
}

// Get workspace claude config path for a user
function getWorkspaceClaudeConfigPath(userEmail: string): string {
  return `/Workspace/Users/${userEmail}/.claude`;
}

// Pull (restore) claude config from workspace to local
export async function pullClaudeConfig(
  userEmail: string,
  userId: string
): Promise<string> {
  const localClaudeConfigPath = getLocalClaudeConfigPath(userEmail);
  const workspaceClaudeConfigPath = getWorkspaceClaudeConfigPath(userEmail);

  const spAccessToken = await getOidcAccessToken();

  console.log(
    `[Backup Pull] Enqueueing claude config pull from ${workspaceClaudeConfigPath} to ${localClaudeConfigPath}...`
  );

  const taskId = enqueuePull({
    userId,
    workspacePath: workspaceClaudeConfigPath,
    localPath: localClaudeConfigPath,
    overwrite: true,
    token: spAccessToken,
  });

  return taskId;
}

// Push (backup) claude config from local to workspace
export async function pushClaudeConfig(
  userEmail: string,
  userId: string
): Promise<string> {
  const localClaudeConfigPath = getLocalClaudeConfigPath(userEmail);
  const workspaceClaudeConfigPath = getWorkspaceClaudeConfigPath(userEmail);

  const spAccessToken = await getOidcAccessToken();
  if (!spAccessToken) {
    throw new Error('Failed to get SP access token for backup push');
  }

  console.log(
    `[Backup Push] Enqueueing claude config push from ${localClaudeConfigPath} to ${workspaceClaudeConfigPath}...`
  );

  // Directory will be created automatically by WorkspaceClient.putObject
  const taskId = enqueuePush({
    userId,
    token: spAccessToken,
    localPath: localClaudeConfigPath,
    workspacePath: workspaceClaudeConfigPath,
    flags: `${buildExcludeFlags(claudeConfigExcludePatterns)} --full`,
    replace: true,
  });

  return taskId;
}

// Manual pull for /me/claude-config/pull endpoint (uses different path calculation for production)
export async function manualPullClaudeConfig(
  userEmail: string,
  userId: string
): Promise<string> {
  const isProduction = process.env.NODE_ENV === 'production';
  const homeBase = isProduction
    ? '/home/app/u'
    : path.join(process.env.HOME ?? '/tmp', 'u');
  const localClaudeConfigPath = path.join(homeBase, userEmail, '.claude');
  const workspaceClaudeConfigPath = getWorkspaceClaudeConfigPath(userEmail);

  const spAccessToken = await getOidcAccessToken();

  console.log(
    `[Manual Pull] Enqueueing claude config pull from ${workspaceClaudeConfigPath} to ${localClaudeConfigPath}...`
  );

  const taskId = enqueuePull({
    userId,
    workspacePath: workspaceClaudeConfigPath,
    localPath: localClaudeConfigPath,
    overwrite: true,
    token: spAccessToken,
  });

  return taskId;
}
