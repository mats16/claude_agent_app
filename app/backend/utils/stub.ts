/**
 * Session stub generator utility
 * Generates 8-character hex identifiers for session directories
 */

import { randomBytes } from 'node:crypto';

/**
 * Generate a unique session stub
 * @returns 8-character hex string (e.g., "a1b2c3d4")
 */
export function generateSessionStub(): string {
  return randomBytes(4).toString('hex');
}
