/**
 * User identity from IdP headers.
 * Lightweight interface for user identification (does not include access token).
 */
export interface User {
  /** User ID from IdP (X-Forwarded-User) */
  readonly id: string;
  /** User display name (X-Forwarded-Preferred-Username) */
  readonly name: string;
  /** User email (X-Forwarded-Email) */
  readonly email: string;
}

/**
 * Headers type for createUserFromHeaders factory
 */
export type HeadersLike = {
  [key: string]: string | string[] | undefined;
};

/**
 * Create User from request headers.
 *
 * @param headers - Request headers containing X-Forwarded-* values
 * @returns User instance
 * @throws Error if required headers are missing
 */
export function createUserFromHeaders(headers: HeadersLike): User {
  const id = headers['x-forwarded-user'] as string | undefined;
  const name = headers['x-forwarded-preferred-username'] as string | undefined;
  const email = headers['x-forwarded-email'] as string | undefined;

  if (!id || !name || !email) {
    throw new Error(
      'User authentication required. Missing x-forwarded-user, x-forwarded-preferred-username, or x-forwarded-email headers.'
    );
  }

  return {
    id,
    name,
    email,
  };
}

/**
 * Extract username from email (part before @).
 * Used for local directory naming.
 *
 * @param email - User email address
 * @returns Username portion of email
 */
export function getUsernameFromEmail(email: string): string {
  return email.split('@')[0];
}
