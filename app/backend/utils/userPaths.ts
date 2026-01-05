import path from 'path';
import fs from 'fs';
import type { User } from '../models/User.js';
import { getUsernameFromEmail } from '../models/User.js';

/**
 * Get user's local home directory.
 *
 * @param user - User object
 * @param userBaseDir - User base directory from config (config.USER_BASE_DIR)
 * @returns Local home directory path: {userBaseDir}/{username}
 */
export function getLocalHomeDir(
  user: User,
  userBaseDir: string
): string {
  const username = getUsernameFromEmail(user.email);
  return path.join(userBaseDir, username);
}

/**
 * Get user's local Claude config directory.
 *
 * @param user - User object
 * @param userBaseDir - User base directory from config (config.USER_BASE_DIR)
 * @returns Local Claude config path: {userBaseDir}/{username}/.claude
 */
export function getLocalClaudeConfigDir(
  user: User,
  userBaseDir: string
): string {
  return path.join(getLocalHomeDir(user, userBaseDir), '.claude');
}

/**
 * Get user's local skills directory.
 *
 * @param user - User object
 * @param userBaseDir - User base directory from config (config.USER_BASE_DIR)
 * @returns Local skills path: {userBaseDir}/{username}/.claude/skills
 */
export function getLocalSkillsPath(
  user: User,
  userBaseDir: string
): string {
  return path.join(getLocalClaudeConfigDir(user, userBaseDir), 'skills');
}

/**
 * Get user's local agents directory.
 *
 * @param user - User object
 * @param userBaseDir - User base directory from config (config.USER_BASE_DIR)
 * @returns Local agents path: {userBaseDir}/{username}/.claude/agents
 */
export function getLocalAgentsPath(
  user: User,
  userBaseDir: string
): string {
  return path.join(getLocalClaudeConfigDir(user, userBaseDir), 'agents');
}

/**
 * Get user's remote home directory (Databricks Workspace).
 *
 * @param user - User object
 * @returns Remote home path: /Workspace/Users/{email}
 */
export function getRemoteHomeDir(user: User): string {
  return path.join('/Workspace/Users', user.email);
}

/**
 * Get user's remote Claude config directory (Databricks Workspace).
 *
 * @param user - User object
 * @returns Remote Claude config path: /Workspace/Users/{email}/.claude
 */
export function getRemoteClaudeConfigDir(user: User): string {
  return path.join(getRemoteHomeDir(user), '.claude');
}

/**
 * Get user's remote skills directory (Databricks Workspace).
 *
 * @param user - User object
 * @returns Remote skills path: /Workspace/Users/{email}/.claude/skills
 */
export function getRemoteSkillsPath(user: User): string {
  return path.join(getRemoteClaudeConfigDir(user), 'skills');
}

/**
 * Get user's remote agents directory (Databricks Workspace).
 *
 * @param user - User object
 * @returns Remote agents path: /Workspace/Users/{email}/.claude/agents
 */
export function getRemoteAgentsPath(user: User): string {
  return path.join(getRemoteClaudeConfigDir(user), 'agents');
}

/**
 * Ensure user's local directory structure exists.
 * Creates skills and agents directories with all parent directories.
 *
 * @param user - User object
 * @param userBaseDir - User base directory from config (config.USER_BASE_DIR)
 */
export function ensureUserLocalDirectories(
  user: User,
  userBaseDir: string
): void {
  const skillsPath = getLocalSkillsPath(user, userBaseDir);
  const agentsPath = getLocalAgentsPath(user, userBaseDir);
  fs.mkdirSync(skillsPath, { recursive: true });
  fs.mkdirSync(agentsPath, { recursive: true });
}
