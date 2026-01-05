import type { FastifyInstance } from 'fastify';
import { getServicePrincipalAccessToken } from '../utils/auth.js';
import { claudeConfigExcludePatterns } from '../utils/workspaceClient.js';
import { enqueueSync } from './workspace-queue.service.js';
import type { User } from '../models/User.js';
import { getLocalClaudeConfigDir, getRemoteClaudeConfigDir } from '../utils/userPaths.js';

// Pull (restore) claude config from workspace to local
export async function pullClaudeConfig(fastify: FastifyInstance, user: User): Promise<string> {
  const spAccessToken = await getServicePrincipalAccessToken(fastify);
  if (!spAccessToken) {
    throw new Error('Failed to get SP access token for backup pull');
  }

  const localClaudeConfigDir = getLocalClaudeConfigDir(user, fastify.config.USER_BASE_DIR);
  const remoteClaudeConfigDir = getRemoteClaudeConfigDir(user);

  console.log(
    `[Backup Pull] Enqueueing claude config pull from ${remoteClaudeConfigDir} to ${localClaudeConfigDir}...`
  );

  const taskId = enqueueSync({
    userId: user.id,
    token: spAccessToken,
    src: remoteClaudeConfigDir,
    dest: localClaudeConfigDir,
    options: { overwrite: true },
  });

  return taskId;
}

// Push (backup) claude config from local to workspace
export async function pushClaudeConfig(fastify: FastifyInstance, user: User): Promise<string> {
  const spAccessToken = await getServicePrincipalAccessToken(fastify);
  if (!spAccessToken) {
    throw new Error('Failed to get SP access token for backup push');
  }

  const localClaudeConfigDir = getLocalClaudeConfigDir(user, fastify.config.USER_BASE_DIR);
  const remoteClaudeConfigDir = getRemoteClaudeConfigDir(user);

  console.log(
    `[Backup Push] Enqueueing claude config push from ${localClaudeConfigDir} to ${remoteClaudeConfigDir}...`
  );

  const taskId = enqueueSync({
    userId: user.id,
    token: spAccessToken,
    src: localClaudeConfigDir,
    dest: remoteClaudeConfigDir,
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
  fastify: FastifyInstance,
  user: User
): Promise<string> {
  const spAccessToken = await getServicePrincipalAccessToken(fastify);
  if (!spAccessToken) {
    throw new Error('Failed to get SP access token for manual pull');
  }

  const localClaudeConfigDir = getLocalClaudeConfigDir(user, fastify.config.USER_BASE_DIR);
  const remoteClaudeConfigDir = getRemoteClaudeConfigDir(user);

  console.log(
    `[Manual Pull] Enqueueing claude config pull from ${remoteClaudeConfigDir} to ${localClaudeConfigDir}...`
  );

  const taskId = enqueueSync({
    userId: user.id,
    token: spAccessToken,
    src: remoteClaudeConfigDir,
    dest: localClaudeConfigDir,
    options: { overwrite: true },
  });

  return taskId;
}
