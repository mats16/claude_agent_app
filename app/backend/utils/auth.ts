import { databricks } from '../config/index.js';

// Token cache for service principal
let cachedToken: { token: string; expiresAt: number } | null = null;

// Token expiry buffer (5 minutes) to prevent using tokens about to expire
const TOKEN_EXPIRY_BUFFER_SECONDS = 300;

/**
 * Get service principal access token from Databricks OAuth2.
 * Implements token caching with 5-minute expiry buffer.
 *
 * @returns Access token
 * @throws Error if credentials not configured
 */
export async function getServicePrincipalAccessToken(): Promise<string> {
  // Check if cached token is still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  if (!databricks.clientId || !databricks.clientSecret) {
    throw new Error(
      'Service Principal credentials not configured. Set DATABRICKS_CLIENT_ID and DATABRICKS_CLIENT_SECRET.'
    );
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
