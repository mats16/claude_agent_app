import { getOidcAccessToken } from '../agent/index.js';
import { claudeConfigExcludePatterns } from '../utils/workspaceClient.js';
import { enqueueSync } from './workspaceQueueService.js';
import type { RequestUser } from '../models/RequestUser.js';

// Pull (restore) claude config from workspace to local
export async function pullClaudeConfig(user: RequestUser): Promise<string> {
  const spAccessToken = await getOidcAccessToken();
  if (!spAccessToken) {
    throw new Error('Failed to get SP access token for backup pull');
  }

  console.log(
    `[Backup Pull] Enqueueing claude config pull from ${user.remote.claudeConfigDir} to ${user.local.claudeConfigDir}...`
  );

  const taskId = enqueueSync({
    userId: user.sub,
    token: spAccessToken,
    src: user.remote.claudeConfigDir,
    dest: user.local.claudeConfigDir,
    options: { overwrite: true },
  });

  return taskId;
}

// Push (backup) claude config from local to workspace
export async function pushClaudeConfig(user: RequestUser): Promise<string> {
  const spAccessToken = await getOidcAccessToken();
  if (!spAccessToken) {
    throw new Error('Failed to get SP access token for backup push');
  }

  console.log(
    `[Backup Push] Enqueueing claude config push from ${user.local.claudeConfigDir} to ${user.remote.claudeConfigDir}...`
  );

  const taskId = enqueueSync({
    userId: user.sub,
    token: spAccessToken,
    src: user.local.claudeConfigDir,
    dest: user.remote.claudeConfigDir,
    options: {
      delete: true,
      exclude: claudeConfigExcludePatterns,
      full: true,
    },
  });

  return taskId;
}

// Manual pull for /me/claude-config/pull endpoint
export async function manualPullClaudeConfig(
  user: RequestUser
): Promise<string> {
  const spAccessToken = await getOidcAccessToken();
  if (!spAccessToken) {
    throw new Error('Failed to get SP access token for manual pull');
  }

  console.log(
    `[Manual Pull] Enqueueing claude config pull from ${user.remote.claudeConfigDir} to ${user.local.claudeConfigDir}...`
  );

  const taskId = enqueueSync({
    userId: user.sub,
    token: spAccessToken,
    src: user.remote.claudeConfigDir,
    dest: user.local.claudeConfigDir,
    options: { overwrite: true },
  });

  return taskId;
}
