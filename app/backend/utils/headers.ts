import type { FastifyRequest } from 'fastify';
import { createUserFromHeaders, type User } from '../models/User.js';

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
