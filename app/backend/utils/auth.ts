import { getAccessToken } from '../agent/index.js';
import { getUserPersonalAccessToken } from '../services/userService.js';

/**
 * Get access token for Databricks API calls.
 * Uses PAT if available for the user, otherwise falls back to Service Principal.
 *
 * @param userId - User ID to check for PAT
 * @returns Access token (PAT or Service Principal)
 */
export async function getAccessTokenForUser(userId: string): Promise<string> {
  const userPat = await getUserPersonalAccessToken(userId);
  if (userPat) {
    return userPat;
  }
  return getAccessToken();
}
