import { getAccessToken } from './agent.service.js';
import { databricks } from '../config/index.js';
import { getSettings, upsertSettings } from '../db/settings.js';
import {
  getDatabricksPat,
  hasDatabricksPat as hasPatInDb,
  setDatabricksPat as setPatInDb,
  deleteDatabricksPat,
} from '../db/oauthTokens.js';
import { upsertUser } from '../db/users.js';
import { isEncryptionAvailable } from '../utils/encryption.js';
import type { RequestUser } from '../models/RequestUser.js';

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

export interface UserSettings {
  userId: string;
  claudeConfigAutoPush: boolean;
}

// Ensure user exists in database
export async function ensureUser(user: RequestUser): Promise<void> {
  await upsertUser(user.sub, user.email);
}

// Check if user has workspace permission by attempting to create .claude directory
export async function checkWorkspacePermission(
  user: RequestUser
): Promise<boolean> {
  const claudeConfigPath = user.remote.claudeConfigDir;

  try {
    const token = await getAccessToken();
    const response = await fetch(
      `${databricks.hostUrl}/api/2.0/workspace/mkdirs`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
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

// Get user info including workspace permission check
export async function getUserInfo(user: RequestUser): Promise<UserInfo> {
  // Ensure user exists
  await ensureUser(user);

  // Workspace home from user object
  const workspaceHome = user.remote.homeDir;

  // Check workspace permission
  const hasWorkspacePermission = await checkWorkspacePermission(user);

  // Build Databricks app URL
  const databricksAppUrl =
    databricks.appName && databricks.host
      ? `https://${databricks.host}/apps/${databricks.appName}`
      : null;

  return {
    userId: user.sub,
    email: user.email,
    workspaceHome,
    hasWorkspacePermission,
    databricksAppUrl,
  };
}

// Get user settings
export async function getUserSettings(userId: string): Promise<UserSettings> {
  const userSettings = await getSettings(userId);

  if (!userSettings) {
    return { userId, claudeConfigAutoPush: true };
  }

  return {
    userId: userSettings.userId,
    claudeConfigAutoPush: userSettings.claudeConfigAutoPush,
  };
}

// Update user settings
export async function updateUserSettings(
  user: RequestUser,
  settings: { claudeConfigAutoPush?: boolean }
): Promise<void> {
  await ensureUser(user);
  await upsertSettings(user.sub, settings);
}

// Check if PAT is configured for user
export async function hasDatabricksPat(userId: string): Promise<boolean> {
  if (!isEncryptionAvailable()) return false;
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
  if (!isEncryptionAvailable()) return undefined;

  try {
    const pat = await getDatabricksPat(userId);
    return pat ?? undefined;
  } catch (error) {
    // Decryption failure - likely due to encryption key change
    // User will need to re-configure their PAT
    console.warn(
      `[PAT] Failed to decrypt PAT for user ${userId}. ` +
        'This may occur if the encryption key was changed. ' +
        'User should re-configure their PAT.',
      error instanceof Error ? error.message : error
    );
    return undefined;
  }
}

// Fetch token info from Databricks API using the PAT
// Returns the token with the latest creation time, or null if API call fails
async function fetchDatabricksTokenInfo(
  pat: string
): Promise<DatabricksTokenInfo | null> {
  try {
    const response = await fetch(`${databricks.hostUrl}/api/2.0/token/list`, {
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
 * Set PAT (fetches expiry from Databricks API, stores encrypted).
 *
 * Note: Encryption is handled automatically by the encryptedText custom type.
 */
export async function setDatabricksPat(
  user: RequestUser,
  pat: string
): Promise<{ expiresAt: Date | null; comment: string | null }> {
  if (!isEncryptionAvailable()) {
    throw new Error('Encryption not available. Cannot store PAT.');
  }

  await ensureUser(user);

  // Fetch token info from Databricks to get expiry time
  const tokenInfo = await fetchDatabricksTokenInfo(pat);

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
  await setPatInDb(user.sub, pat, expiresAt);

  return { expiresAt, comment };
}

// Clear PAT
export async function clearDatabricksPat(userId: string): Promise<void> {
  await deleteDatabricksPat(userId);
}
