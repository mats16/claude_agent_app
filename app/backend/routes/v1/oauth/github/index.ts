import type { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { extractRequestContext } from '../../../../utils/headers.js';
import * as githubService from '../../../../services/githubService.js';
import { isEncryptionAvailable } from '../../../../utils/encryption.js';
import { jwtSecret } from '../../../../config/index.js';

// State token expiration time (10 minutes)
const STATE_EXPIRATION_SECONDS = 10 * 60;

interface StatePayload {
  sub: string; // User ID
  nonce: string; // Random nonce for uniqueness
}

/**
 * Generate a JWT-based state token for CSRF protection.
 * This is stateless and works across multiple server instances.
 */
function generateStateToken(userId: string): string {
  const payload: StatePayload = {
    sub: userId,
    nonce: crypto.randomBytes(16).toString('hex'),
  };
  return jwt.sign(payload, jwtSecret, { expiresIn: STATE_EXPIRATION_SECONDS });
}

/**
 * Verify and decode the state token.
 * Returns the user ID if valid, throws if invalid or expired.
 */
function verifyStateToken(token: string): string {
  const decoded = jwt.verify(token, jwtSecret) as StatePayload;
  return decoded.sub;
}

function getCallbackUrl(request: {
  protocol: string;
  host: string;
  headers: Record<string, string | string[] | undefined>;
}): string {
  // Use X-Forwarded-Host if behind a proxy (e.g., Vite dev server)
  // Otherwise fall back to request.host
  const forwardedHost = request.headers['x-forwarded-host'];
  const forwardedProto = request.headers['x-forwarded-proto'];
  const host = (typeof forwardedHost === 'string' ? forwardedHost : undefined) || request.host;
  const protocol = (typeof forwardedProto === 'string' ? forwardedProto : undefined) || request.protocol || 'https';
  return `${protocol}://${host}/api/v1/oauth/github/callback`;
}

const githubRoutes: FastifyPluginAsync = async (fastify) => {
  // Check GitHub connection status
  // GET /api/v1/oauth/github/status
  fastify.get('/status', async (request, reply) => {
    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }

    const oauthConfigured = githubService.isGitHubOAuthConfigured();

    if (!oauthConfigured) {
      return {
        connected: false,
        oauthConfigured: false,
        encryptionAvailable: isEncryptionAvailable(),
      };
    }

    if (!isEncryptionAvailable()) {
      return {
        connected: false,
        oauthConfigured: true,
        encryptionAvailable: false,
      };
    }

    try {
      const connected = await githubService.hasGitHubToken(context.user.sub);
      return {
        connected,
        oauthConfigured: true,
        encryptionAvailable: true,
      };
    } catch (error: any) {
      console.error('Failed to check GitHub status:', error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // Start GitHub OAuth flow (redirect to GitHub)
  // GET /api/v1/oauth/github
  fastify.get('/', async (request, reply) => {
    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }

    if (!githubService.isGitHubOAuthConfigured()) {
      return reply.status(503).send({
        error: 'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.',
      });
    }

    // Generate JWT-based state token for CSRF protection
    const state = generateStateToken(context.user.sub);

    const callbackUrl = getCallbackUrl(request);
    const authUrl = githubService.getAuthorizationUrl(state, callbackUrl);

    return reply.redirect(authUrl);
  });

  // GitHub OAuth callback
  // GET /api/v1/oauth/github/callback
  fastify.get<{
    Querystring: { code?: string; state?: string; error?: string; error_description?: string };
  }>('/callback', async (request, reply) => {
    const { code, state, error, error_description } = request.query;

    // Handle OAuth errors from GitHub
    if (error) {
      console.error('GitHub OAuth error:', error, error_description);
      return reply.redirect('/?github_error=' + encodeURIComponent(error_description || error));
    }

    if (!code || !state) {
      return reply.redirect('/?github_error=' + encodeURIComponent('Missing code or state'));
    }

    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.redirect('/?github_error=' + encodeURIComponent('Authentication required'));
    }

    // Verify JWT state token for CSRF protection
    let stateUserId: string;
    try {
      stateUserId = verifyStateToken(state);
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return reply.redirect('/?github_error=' + encodeURIComponent('Session expired. Please try again.'));
      }
      return reply.redirect('/?github_error=' + encodeURIComponent('Invalid state. Please try again.'));
    }

    // Ensure the state token was issued for this user
    if (stateUserId !== context.user.sub) {
      return reply.redirect('/?github_error=' + encodeURIComponent('Invalid state. Please try again.'));
    }

    try {
      const callbackUrl = getCallbackUrl(request);

      // Exchange code for access token
      const accessToken = await githubService.exchangeCodeForToken(code, callbackUrl);

      // Save token and get user info
      const githubUser = await githubService.saveGitHubToken(
        context.user.sub,
        context.user.email,
        accessToken
      );

      // Redirect to frontend with success
      return reply.redirect('/?github_connected=' + encodeURIComponent(githubUser.login));
    } catch (error: any) {
      console.error('GitHub OAuth callback error:', error);
      return reply.redirect('/?github_error=' + encodeURIComponent(error.message || 'Failed to connect GitHub'));
    }
  });

  // Disconnect GitHub
  // DELETE /api/v1/oauth/github
  fastify.delete('/', async (request, reply) => {
    let context;
    try {
      context = extractRequestContext(request);
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }

    try {
      await githubService.clearGitHubToken(context.user.sub);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to disconnect GitHub:', error);
      return reply.status(500).send({ error: error.message });
    }
  });
};

export default githubRoutes;
