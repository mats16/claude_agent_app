import type { FastifyRequest } from 'fastify';
import path from 'path';
import { RequestUser } from '../models/RequestUser.js';

export { RequestUser };

/**
 * Extracted request context from Databricks Apps headers
 */
export interface RequestContext {
  /** User object with sub, email, preferredUsername, name, accessToken */
  user: RequestUser;
  /** UUID of the request (X-Request-Id) */
  requestId?: string;
}

/**
 * Extract user context from Databricks Apps forwarded headers
 * @param request - Fastify request object
 * @returns RequestContext with user object and optional requestId
 * @throws Error if required headers are missing
 */
export function extractRequestContext(request: FastifyRequest): RequestContext {
  const { config } = request.server;
  const usersBase = path.join(config.HOME, config.USER_DIR_BASE);
  const user = RequestUser.fromHeaders(request.headers, usersBase);
  const requestId = request.headers['x-request-id'] as string | undefined;

  return {
    user,
    requestId,
  };
}

/**
 * Extract user context from WebSocket request
 * WebSocket requests use the same header format as HTTP requests
 * @param headers - WebSocket request headers
 * @param usersBase - Base directory for user files (from config)
 * @returns RequestContext with user object and optional requestId
 * @throws Error if required headers are missing
 */
export function extractRequestContextFromHeaders(
  headers: {
    [key: string]: string | string[] | undefined;
  },
  usersBase: string
): RequestContext {
  const user = RequestUser.fromHeaders(headers, usersBase);
  const requestId = headers['x-request-id'] as string | undefined;

  return {
    user,
    requestId,
  };
}
