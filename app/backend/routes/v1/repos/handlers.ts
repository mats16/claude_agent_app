import type { FastifyRequest, FastifyReply } from 'fastify';
import { extractRequestContext } from '../../../utils/headers.js';
import { userService } from '../../../services/user.service.js';
import { databricks } from '../../../config/index.js';

interface CreateRepoBody {
  url: string;
  path: string;
  sparse_checkout?: {
    patterns: string[];
  };
}

interface CreateRepoResponse {
  id: number;
  path: string;
  url: string;
  provider: string;
  branch: string;
}

interface DatabricksReposResponse {
  id?: number;
  path?: string;
  url?: string;
  provider?: string;
  branch?: string;
  error_code?: string;
  message?: string;
}

// Determine Git provider from URL
function getProviderFromUrl(url: string): string {
  if (url.includes('github.com')) {
    return 'gitHub';
  } else if (url.includes('gitlab.com')) {
    return 'gitLab';
  } else if (url.includes('bitbucket.org')) {
    return 'bitbucketCloud';
  } else if (url.includes('dev.azure.com')) {
    return 'azureDevOpsServices';
  }
  // Default to GitHub
  return 'gitHub';
}

// Resolve 'me' in path to actual user email
function resolveUserPath(path: string, userEmail: string): string {
  return path.replace(/\/Users\/me(\/|$)/, `/Users/${userEmail}$1`);
}

// Create a Git folder (repo) in Databricks workspace
// POST /api/v1/repos
// Body: { url: string, path: string }
export async function createRepoHandler(
  request: FastifyRequest<{ Body: CreateRepoBody }>,
  reply: FastifyReply
) {
  const { url, path: rawPath, sparse_checkout } = request.body || {};

  // Validate required parameters
  if (!url) {
    return reply.status(400).send({
      error_code: 'INVALID_PARAMETER_VALUE',
      message: 'url is required',
    });
  }

  if (!rawPath) {
    return reply.status(400).send({
      error_code: 'INVALID_PARAMETER_VALUE',
      message: 'path is required',
    });
  }

  // Extract user context for 'me' resolution and PAT auth
  let userEmail: string;
  let userId: string;
  try {
    const context = extractRequestContext(request);
    userEmail = context.user.email;
    userId = context.user.sub;
  } catch (error: any) {
    return reply.status(401).send({
      error_code: 'UNAUTHENTICATED',
      message: error.message,
    });
  }

  // Resolve 'me' in path
  const path = resolveUserPath(rawPath, userEmail);

  // Determine provider from URL
  const provider = getProviderFromUrl(url);

  try {
    // Get access token (PAT if available, falls back to Service Principal)
    const accessToken = await userService.getPersonalAccessToken(userId);

    // Build request body
    const requestBody: Record<string, unknown> = {
      url,
      provider,
      path,
    };

    // Add sparse_checkout if provided
    if (sparse_checkout?.patterns && sparse_checkout.patterns.length > 0) {
      requestBody.sparse_checkout = sparse_checkout;
    }

    // Call Databricks Repos API
    const response = await fetch(`${databricks.hostUrl}/api/2.0/repos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseBody = (await response.json()) as DatabricksReposResponse;

    if (!response.ok) {
      // Map common error codes
      if (response.status === 400) {
        // Check if it's "already exists" error
        if (
          responseBody.error_code === 'RESOURCE_ALREADY_EXISTS' ||
          responseBody.message?.includes('already exists')
        ) {
          return reply.status(409).send({
            error_code: 'RESOURCE_ALREADY_EXISTS',
            message: 'A repository already exists at the specified path',
          });
        }
        return reply.status(400).send(responseBody);
      }
      if (response.status === 403) {
        return reply.status(403).send({
          error_code: 'PERMISSION_DENIED',
          message: 'Permission denied to create repository',
        });
      }
      return reply.status(response.status).send(responseBody);
    }

    // Return successful response
    const result: CreateRepoResponse = {
      id: responseBody.id!,
      path: responseBody.path!,
      url: responseBody.url!,
      provider: responseBody.provider!,
      branch: responseBody.branch!,
    };

    return reply.status(201).send(result);
  } catch (error: any) {
    request.log.error(error, 'Failed to create repository');
    return reply.status(500).send({
      error_code: 'INTERNAL_ERROR',
      message: error.message || 'Failed to create repository',
    });
  }
}
