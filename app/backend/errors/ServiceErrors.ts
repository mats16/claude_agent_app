/**
 * Base class for all service-layer errors
 */
export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when a requested resource is not found
 */
export class ResourceNotFoundError extends ServiceError {
  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} ${resourceId} not found`);
  }
}

/**
 * Thrown when a user attempts to access a resource they don't own
 */
export class AccessDeniedError extends ServiceError {
  constructor(resourceType: string, resourceId: string) {
    super(`Access denied to ${resourceType} ${resourceId}`);
  }
}

/**
 * Thrown when session-related operations fail
 */
export class SessionNotFoundError extends ResourceNotFoundError {
  constructor(sessionId: string) {
    super('Session', sessionId);
  }
}

/**
 * Thrown when validation fails
 */
export class ValidationError extends ServiceError {
  constructor(message: string) {
    super(message);
  }
}
