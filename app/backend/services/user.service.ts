import { databricks } from '../config/index.js';
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
import type { RequestUser } from '../models/RequestUser.js';
import type { SelectUser } from '../db/schema.js';
import { DEFAULT_USER_SETTINGS } from './user-settings.service.js';

// ==========================================
// Types & Interfaces
// ==========================================

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

// ==========================================
// UserService Class
// ==========================================

export class UserService {
  constructor(
    private databricksConfig: typeof databricks,
    private getSpToken: typeof getServicePrincipalAccessToken
  ) {}

  // ------------------------------------------
  // ユーザー管理系
  // ------------------------------------------

  /**
   * Ensure user exists in database with default settings.
   * Uses a transaction to atomically create both user and settings.
   *
   * @param id - User ID
   * @param email - User email
   * @returns Created or existing user
   * @throws Error if user creation transaction fails
   */
  async ensureUserWithDefaults(id: string, email: string): Promise<SelectUser> {
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
   * Ensure user exists in database (convenience wrapper).
   *
   * @param user - Request user object
   */
  async ensureUser(user: RequestUser): Promise<void> {
    await this.ensureUserWithDefaults(user.sub, user.email);
  }

  /**
   * Check if user has workspace permission by attempting to create .claude directory.
   */
  async checkWorkspacePermission(user: RequestUser): Promise<boolean> {
    const claudeConfigPath = user.remote.claudeConfigDir;

    try {
      const spToken = await this.getSpToken();
      const response = await fetch(
        `${this.databricksConfig.hostUrl}/api/2.0/workspace/mkdirs`,
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

  /**
   * Get user info including workspace permission check.
   */
  async getUserInfo(user: RequestUser): Promise<UserInfo> {
    // Ensure user exists
    await this.ensureUser(user);

    // Workspace home from user object
    const workspaceHome = user.remote.homeDir;

    // Check workspace permission
    const hasWorkspacePermission = await this.checkWorkspacePermission(user);

    // Build Databricks app URL
    const databricksAppUrl =
      this.databricksConfig.appName && this.databricksConfig.host
        ? `https://${this.databricksConfig.host}/apps/${this.databricksConfig.appName}`
        : null;

    return {
      userId: user.sub,
      email: user.email,
      workspaceHome,
      hasWorkspacePermission,
      databricksAppUrl,
    };
  }

  // ------------------------------------------
  // PAT管理系
  // ------------------------------------------

  /**
   * Check if PAT is configured for user.
   */
  async hasDatabricksPat(userId: string): Promise<boolean> {
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
  async getUserPersonalAccessToken(
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

  /**
   * Set PAT (fetches expiry from Databricks API, stores encrypted).
   *
   * Note: Encryption is handled automatically by the encryptedText custom type.
   */
  async setDatabricksPat(
    user: RequestUser,
    pat: string
  ): Promise<{ expiresAt: Date | null; comment: string | null }> {
    if (!isEncryptionAvailable()) {
      throw new Error('Encryption not available. Cannot store PAT.');
    }

    await this.ensureUser(user);

    // Fetch token info from Databricks to get expiry time
    const tokenInfo = await this.fetchDatabricksTokenInfo(pat);

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

  /**
   * Clear PAT.
   */
  async clearDatabricksPat(userId: string): Promise<void> {
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
  async getPersonalAccessToken(userId: string): Promise<string> {
    const userPat = await this.getUserPersonalAccessToken(userId);
    if (userPat) {
      return userPat;
    }

    // getServicePrincipalAccessToken() now throws if credentials not configured
    return await this.getSpToken();
  }

  // ------------------------------------------
  // Private methods
  // ------------------------------------------

  /**
   * Fetch token info from Databricks API using the PAT.
   * Returns the token with the latest creation time, or null if API call fails.
   */
  private async fetchDatabricksTokenInfo(
    pat: string
  ): Promise<DatabricksTokenInfo | null> {
    try {
      const response = await fetch(
        `${this.databricksConfig.hostUrl}/api/2.0/token/list`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${pat}`,
            'Content-Type': 'application/json',
          },
        }
      );

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
}

// ==========================================
// Default Instance & Factory
// ==========================================

/**
 * Default UserService instance for production use.
 */
export const userService = new UserService(
  databricks,
  getServicePrincipalAccessToken
);

/**
 * Factory function for creating custom UserService instances (mainly for testing).
 */
export function createUserService(
  config?: typeof databricks,
  spTokenFn?: typeof getServicePrincipalAccessToken
): UserService {
  return new UserService(
    config ?? databricks,
    spTokenFn ?? getServicePrincipalAccessToken
  );
}
