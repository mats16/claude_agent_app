import {
  getGithubPat,
  hasGithubPat as hasGithubPatInDb,
  setGithubPat as setGithubPatInDb,
  deleteGithubPat,
} from '../db/oauthTokens.js';
import { upsertUser } from '../db/users.js';
import { isEncryptionAvailable } from '../utils/encryption.js';
import { github } from '../config/index.js';

// GitHub user info from /user API
interface GitHubUserInfo {
  login: string;
  name: string | null;
  avatar_url: string;
}

// GitHub OAuth token response
interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

/**
 * Check if GitHub OAuth is configured (client ID and secret are set).
 */
export function isGitHubOAuthConfigured(): boolean {
  return !!(github.clientId && github.clientSecret);
}

/**
 * Generate GitHub OAuth authorization URL.
 * @param state - CSRF protection state parameter
 * @param redirectUri - Callback URL
 */
export function getAuthorizationUrl(state: string, redirectUri: string): string {
  if (!github.clientId) {
    throw new Error('GitHub OAuth is not configured. Set GITHUB_CLIENT_ID.');
  }

  const params = new URLSearchParams({
    client_id: github.clientId,
    redirect_uri: redirectUri,
    scope: 'repo user:email',
    state,
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token.
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<string> {
  if (!github.clientId || !github.clientSecret) {
    throw new Error(
      'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.'
    );
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: github.clientId,
      client_secret: github.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed: ${response.statusText}`);
  }

  const data = (await response.json()) as GitHubTokenResponse;

  if (data.error) {
    throw new Error(
      data.error_description || data.error || 'Failed to exchange code for token'
    );
  }

  if (!data.access_token) {
    throw new Error('No access token in response');
  }

  return data.access_token;
}

/**
 * Fetch GitHub user info using access token.
 */
export async function fetchGitHubUser(
  accessToken: string
): Promise<GitHubUserInfo> {
  const response = await fetch('https://api.github.com/user', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Claude-Agent-Databricks',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub user: ${response.statusText}`);
  }

  return (await response.json()) as GitHubUserInfo;
}

/**
 * Check if GitHub token is configured for user.
 */
export async function hasGitHubToken(userId: string): Promise<boolean> {
  if (!isEncryptionAvailable()) return false;
  return hasGithubPatInDb(userId);
}

/**
 * Get decrypted GitHub token for agent use (internal only).
 * Returns undefined when not set.
 */
export async function getGitHubToken(
  userId: string
): Promise<string | undefined> {
  if (!isEncryptionAvailable()) return undefined;

  try {
    const token = await getGithubPat(userId);
    return token ?? undefined;
  } catch (error) {
    console.warn(
      `[GitHub] Failed to decrypt token for user ${userId}. ` +
        'User should re-authenticate with GitHub.',
      error instanceof Error ? error.message : error
    );
    return undefined;
  }
}

/**
 * Save GitHub access token (encrypted).
 */
export async function saveGitHubToken(
  userId: string,
  email: string | null,
  accessToken: string
): Promise<GitHubUserInfo> {
  if (!isEncryptionAvailable()) {
    throw new Error('Encryption not available. Cannot store GitHub token.');
  }

  // Verify token and get user info
  const githubUser = await fetchGitHubUser(accessToken);

  // Ensure user exists in database
  await upsertUser(userId, email ?? '');

  // Store token (encryption handled by customType)
  await setGithubPatInDb(userId, accessToken);

  console.log(
    `GitHub OAuth completed for user ${userId} (GitHub: @${githubUser.login})`
  );

  return githubUser;
}

/**
 * Clear GitHub token.
 */
export async function clearGitHubToken(userId: string): Promise<void> {
  await deleteGithubPat(userId);
}
