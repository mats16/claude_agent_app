import type { FastifyRequest } from 'fastify';
import path from 'path';
import { RequestUser } from '../models/RequestUser.js';
import { createUserFromHeaders, type User } from '../models/User.js';

export { RequestUser };

/**
 * Extracted request context from Databricks Apps headers
 * @deprecated Use UserRequestContext instead
 */
export interface RequestContext {
  /** User object with sub, email, preferredUsername, name, accessToken */
  user: RequestUser;
  /** UUID of the request (X-Request-Id) */
  requestId?: string;
}

/**
 * New request context using lightweight User interface
 */
export interface UserRequestContext {
  /** User object with id, name, email (no access token) */
  user: User;
  /** UUID of the request (X-Request-Id) */
  requestId?: string;
}

/**
 * Extract user from request headers (new User interface).
 *
 * @param headers - Request headers
 * @returns User object
 * @throws Error if required headers are missing
 */
export function extractUser(headers: {
  [key: string]: string | string[] | undefined;
}): User {
  return createUserFromHeaders(headers);
}

/**
 * Extract user request context (new User interface).
 *
 * @param request - Fastify request object
 * @returns UserRequestContext with User object and optional requestId
 * @throws Error if required headers are missing
 */
export function extractUserRequestContext(request: FastifyRequest): UserRequestContext {
  const user = createUserFromHeaders(request.headers);
  const requestId = request.headers['x-request-id'] as string | undefined;

  return {
    user,
    requestId,
  };
}

/**
 * Extract user context from Databricks Apps forwarded headers
 * @param request - Fastify request object
 * @returns RequestContext with user object and optional requestId
 * @throws Error if required headers are missing
 * @deprecated Use extractUserRequestContext instead
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
 * Extract user request context from headers (new User interface).
 * Used for WebSocket connections where full request object is not available.
 *
 * @param headers - Request headers
 * @returns UserRequestContext with User object and optional requestId
 * @throws Error if required headers are missing
 */
export function extractUserRequestContextFromHeaders(headers: {
  [key: string]: string | string[] | undefined;
}): UserRequestContext {
  const user = createUserFromHeaders(headers);
  const requestId = headers['x-request-id'] as string | undefined;

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
 * @deprecated Use extractUserRequestContextFromHeaders instead
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
