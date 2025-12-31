import { sql } from 'drizzle-orm';
import { db } from './index.js';

/**
 * Helper to execute database queries with RLS (Row Level Security) user context.
 * Sets the PostgreSQL session variable 'app.current_user_id' to enable RLS policies.
 *
 * @param userId - The user ID to set in the RLS context
 * @param fn - The database operation to execute within the user context
 * @returns The result of the database operation
 *
 * @example
 * ```typescript
 * const sessions = await withUserContext(userId, async () => {
 *   return db.select().from(sessions).where(eq(sessions.userId, userId));
 * });
 * ```
 */
export async function withUserContext<T>(
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  // Set the user context for RLS policy
  // Using set_config() instead of SET LOCAL because it supports parameterized queries
  // The third parameter (true) makes it local to the current transaction
  await db.execute(
    sql`SELECT set_config('app.current_user_id', ${userId}, true)`
  );
  return fn();
}
