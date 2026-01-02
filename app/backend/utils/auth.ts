import { databricks } from '../config/index.js';
import { getUserPersonalAccessToken } from '../services/user.service.js';

// Token cache for service principal
let cachedToken: { token: string; expiresAt: number } | null = null;

// Token expiry buffer (5 minutes) to prevent using tokens about to expire
const TOKEN_EXPIRY_BUFFER_SECONDS = 300;

/**
 * Get service principal access token from Databricks OAuth2.
 * Implements token caching with 5-minute expiry buffer.
 *
 * @returns Access token or undefined if credentials not configured
 */
export async function getServicePrincipalAccessToken(): Promise<
  string | undefined
> {
  // Check if cached token is still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  if (!databricks.clientId || !databricks.clientSecret) {
    return undefined;
  }

  // Request token from Databricks OAuth2 endpoint
  const tokenUrl = `https://${databricks.host}/oidc/v1/token`;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: databricks.clientId,
      client_secret: databricks.clientSecret,
      scope: 'all-apis',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get service principal token: ${response.status} ${errorText}`
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in?: number;
  };
  const expiresIn = data.expires_in || 3600; // Default to 1 hour

  // Cache token with buffer before expiration
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (expiresIn - TOKEN_EXPIRY_BUFFER_SECONDS) * 1000,
  };

  return data.access_token;
}

/**
 * Get service principal access token, throwing error if unavailable.
 * Use this when SP token is required (not optional).
 *
 * @throws Error if DATABRICKS_CLIENT_ID/DATABRICKS_CLIENT_SECRET not set
 * @returns Access token
 */
export async function getAccessToken(): Promise<string> {
  const spToken = await getServicePrincipalAccessToken();
  if (!spToken) {
    throw new Error(
      'No access token available. Set DATABRICKS_CLIENT_ID/DATABRICKS_CLIENT_SECRET.'
    );
  }
  return spToken;
}

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
