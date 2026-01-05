import type { FastifyInstance } from 'fastify';
import { getServicePrincipalAccessToken } from '../utils/auth.js';
import {
  getDatabricksPat,
  hasDatabricksPat as hasPatInDb,
  setDatabricksPat as setPatInDb,
  deleteDatabricksPat,
} from '../db/oauthTokens.js';
import {
  getUserById,
  updateUserEmail,
  createUserWithDefaultSettings,
} from '../db/users.js';
import { isEncryptionAvailable } from '../utils/encryption.js';
import type { User } from '../models/User.js';
import {
  getRemoteClaudeConfigDir,
  getRemoteHomeDir,
} from '../utils/userPaths.js';
import type { SelectUser } from '../db/schema.js';
import * as settingsService from './user-settings.service.js';
import { DEFAULT_USER_SETTINGS, type UserSettings } from './user-settings.service.js';

// Databricks token info from /api/2.0/token/list
interface DatabricksTokenInfo {
  token_id: string;
  creation_time: number; // Unix timestamp in ms
  expiry_time: number; // Unix timestamp in ms, -1 if no expiry
  comment: string;
}

interface DatabricksTokenListResponse {
  token_infos?: DatabricksTokenInfo[];
}

export interface UserInfo {
  userId: string;
  email: string | null;
  workspaceHome: string | null;
  hasWorkspacePermission: boolean;
  databricksAppUrl: string | null;
}

/**
 * Ensure user exists in database with default settings.
 * Uses a transaction to atomically create both user and settings.
 *
 * @param id - User ID
 * @param email - User email
 * @returns Created or existing user
 * @throws Error if user creation transaction fails
 */
export async function ensureUserWithDefaults(
  id: string,
  email: string
): Promise<SelectUser> {
  // Check if user exists
  const existing = await getUserById(id);

  if (existing) {
    // Update email if different
    if (existing.email !== email) {
      await updateUserEmail(id, email);
      return { ...existing, email, updatedAt: new Date() };
    }
    return existing;
  }

  // Create new user with default settings in a transaction
  // This ensures atomicity - either both are created or neither
  return createUserWithDefaultSettings(id, email, DEFAULT_USER_SETTINGS);
}

/**
 * Ensure user exists in database (convenience wrapper, new User interface).
 *
 * @param user - User object
 */
export async function ensureUser(user: User): Promise<void> {
  await ensureUserWithDefaults(user.id, user.email);
}

// Check if user has workspace permission by attempting to create .claude directory (new User interface)
export async function checkWorkspacePermission(
  fastify: FastifyInstance,
  user: User
): Promise<boolean> {
  const claudeConfigPath = getRemoteClaudeConfigDir(user);

  try {
    const spToken = await getServicePrincipalAccessToken(fastify);
    const databricksHostUrl = `https://${fastify.config.DATABRICKS_HOST}`;
    const response = await fetch(
      `${databricksHostUrl}/api/2.0/workspace/mkdirs`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${spToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: claudeConfigPath }),
      }
    );

    const data = (await response.json()) as {
      error_code?: string;
      message?: string;
    };

    return !data.error_code;
  } catch (error: any) {
    console.error('Failed to check workspace permission:', error);
    return false;
  }
}

// Get user info including workspace permission check (new User interface)
export async function getUserInfo(fastify: FastifyInstance, user: User): Promise<UserInfo> {
  // Ensure user exists
  await ensureUser(user);

  // Workspace home from user object
  const workspaceHome = getRemoteHomeDir(user);

  // Check workspace permission
  const hasWorkspacePermission = await checkWorkspacePermission(fastify, user);

  // Build Databricks app URL
  const { config } = fastify;
  const databricksAppUrl =
    config.DATABRICKS_APP_NAME && config.DATABRICKS_HOST
      ? `https://${config.DATABRICKS_HOST}/apps/${config.DATABRICKS_APP_NAME}`
      : null;

  return {
    userId: user.id,
    email: user.email,
    workspaceHome,
    hasWorkspacePermission,
    databricksAppUrl,
  };
}

/**
 * Get user settings (delegates to settings.service).
 * @deprecated Use settingsService.getUserSettings() directly
 */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  return settingsService.getUserSettings(userId);
}

/**
 * Update user settings (new User interface, delegates to settings.service).
 * @deprecated Use settingsService.updateUserSettings() directly
 */
export async function updateUserSettings(
  user: User,
  settings: { claudeConfigAutoPush?: boolean }
): Promise<void> {
  await ensureUser(user);
  await settingsService.updateUserSettings(user.id, settings);
}

// Check if PAT is configured for user
export async function hasDatabricksPat(userId: string): Promise<boolean> {
  // Works in both encrypted and plaintext modes
  return hasPatInDb(userId);
}

/**
 * Get decrypted PAT for agent use (internal only).
 * Uses Direct (non-RLS) query since user context is already verified by caller.
 * Returns undefined when not set (allows direct spread in env config).
 *
 * Note: Decryption is handled automatically by the encryptedText custom type.
 * If decryption fails (e.g., encryption key changed), returns undefined and
 * logs a warning. User will need to re-configure their PAT.
 */
export async function getUserPersonalAccessToken(
  userId: string
): Promise<string | undefined> {
  try {
    const pat = await getDatabricksPat(userId);
    return pat ?? undefined;
  } catch (error) {
    // Decryption failure (when encryption enabled) OR read failure
    // User will need to re-configure their PAT
    console.warn(
      `[PAT] Failed to retrieve PAT for user ${userId}. ` +
        (isEncryptionAvailable()
          ? 'This may occur if the encryption key was changed. '
          : 'Error reading plaintext PAT. ') +
        'User should re-configure their PAT.',
      error instanceof Error ? error.message : error
    );
    return undefined;
  }
}

// Fetch token info from Databricks API using the PAT
// Returns the token with the latest creation time, or null if API call fails
async function fetchDatabricksTokenInfo(
  fastify: FastifyInstance,
  pat: string
): Promise<DatabricksTokenInfo | null> {
  try {
    const databricksHostUrl = `https://${fastify.config.DATABRICKS_HOST}`;
    const response = await fetch(`${databricksHostUrl}/api/2.0/token/list`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(
        'Failed to fetch token list:',
        response.status,
        response.statusText
      );
      return null;
    }

    const data = (await response.json()) as DatabricksTokenListResponse;
    const tokens = data.token_infos ?? [];

    if (tokens.length === 0) {
      return null;
    }

    // Return the most recently created token
    // This is a best-effort heuristic since we can't match PAT value to token_id
    const sortedTokens = [...tokens].sort(
      (a, b) => b.creation_time - a.creation_time
    );
    return sortedTokens[0];
  } catch (error) {
    console.error('Error fetching token info:', error);
    return null;
  }
}

/**
 * Set PAT (new User interface, fetches expiry from Databricks API, stores encrypted).
 *
 * Note: Encryption is handled automatically by the encryptedText custom type.
 */
export async function setDatabricksPat(
  fastify: FastifyInstance,
  user: User,
  pat: string
): Promise<{ expiresAt: Date | null; comment: string | null }> {
  if (!isEncryptionAvailable()) {
    console.warn(
      `[PAT] Storing PAT for user ${user.id} in PLAINTEXT mode. ` +
      'This is NOT secure for production use.'
    );
  }

  await ensureUser(user);

  // Fetch token info from Databricks to get expiry time
  const tokenInfo = await fetchDatabricksTokenInfo(fastify, pat);

  let expiresAt: Date | null = null;
  let comment: string | null = null;

  if (tokenInfo) {
    comment = tokenInfo.comment || null;
    // expiry_time is -1 if no expiry, otherwise Unix timestamp in ms
    if (tokenInfo.expiry_time > 0) {
      expiresAt = new Date(tokenInfo.expiry_time);
    }
    console.log(
      `Token info fetched - comment: "${comment}", expires: ${expiresAt?.toISOString() ?? 'never'}`
    );
  } else {
    console.log('Could not fetch token info from Databricks API');
  }

  // Store PAT (encryption handled by customType)
  await setPatInDb(user.id, pat, expiresAt);

  return { expiresAt, comment };
}

// Clear PAT
export async function clearDatabricksPat(userId: string): Promise<void> {
  await deleteDatabricksPat(userId);
}

/**
 * Get access token for Databricks API calls.
 * Uses PAT if available for the user, otherwise falls back to Service Principal.
 *
 * @param userId - User ID to check for PAT
 * @returns Access token (PAT or Service Principal)
 * @throws Error if no PAT and SP credentials not configured
 */
export async function getPersonalAccessToken(fastify: FastifyInstance, userId: string): Promise<string> {
  const userPat = await getUserPersonalAccessToken(userId);
  if (userPat) {
    return userPat;
  }

  // getServicePrincipalAccessToken() now throws if credentials not configured
  return await getServicePrincipalAccessToken(fastify);
}
