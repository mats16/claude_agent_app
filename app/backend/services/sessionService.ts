/**
 * Session Service
 *
 * Service layer for session operations. Returns Session models instead of DB records.
 * Handles Drizzle ORM operations internally, keeping the handlers clean.
 */

import { eq, desc, sql, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, type NewSession } from '../db/schema.js';
import { Session } from '../models/Session.js';

// Helper to execute queries with RLS user context
async function withUserContext<T>(
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  await db.execute(
    sql`SELECT set_config('app.current_user_id', ${userId}, true)`
  );
  return fn();
}

/**
 * Create a new session and return Session model
 * Uses ON CONFLICT DO NOTHING to handle retries with the same session ID
 */
export async function createSession(
  session: NewSession,
  userId: string
): Promise<Session> {
  return withUserContext(userId, async () => {
    const result = await db
      .insert(sessions)
      .values(session)
      .onConflictDoNothing()
      .returning();

    // Use the returned record if available, otherwise fetch it
    const record = result[0] ?? (await getSessionRecordById(session.id));
    if (!record) {
      throw new Error('Failed to create session');
    }
    return Session.fromData(record);
  });
}

/**
 * Get session by ID - returns Session model
 */
export async function getSessionById(
  id: string,
  userId: string
): Promise<Session | null> {
  return withUserContext(userId, async () => {
    const result = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);

    return result[0] ? Session.fromData(result[0]) : null;
  });
}

/**
 * Get session record by ID without RLS (for internal use)
 */
async function getSessionRecordById(id: string) {
  const result = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);

  return result[0] ?? null;
}

/**
 * Get all sessions for a user - returns Session models
 */
export async function getSessionsByUserId(
  userId: string,
  filter: 'active' | 'archived' | 'all' = 'active'
): Promise<Session[]> {
  return withUserContext(userId, async () => {
    let whereClause;
    if (filter === 'active') {
      whereClause = and(
        eq(sessions.userId, userId),
        eq(sessions.isArchived, false)
      );
    } else if (filter === 'archived') {
      whereClause = and(
        eq(sessions.userId, userId),
        eq(sessions.isArchived, true)
      );
    } else {
      // 'all' - no isArchived filter
      whereClause = eq(sessions.userId, userId);
    }

    const result = await db
      .select()
      .from(sessions)
      .where(whereClause)
      .orderBy(desc(sessions.createdAt));

    return result.map(Session.fromData);
  });
}

/**
 * Update session title only if currently null
 * Returns true if title was updated, false if title already exists
 */
export async function updateSessionTitle(
  id: string,
  title: string,
  userId: string
): Promise<boolean> {
  return withUserContext(userId, async () => {
    const result = await db
      .update(sessions)
      .set({ title, updatedAt: new Date() })
      .where(and(eq(sessions.id, id), sql`${sessions.title} IS NULL`));

    // Check if any row was updated
    return (result as { rowCount?: number }).rowCount !== 0;
  });
}

/**
 * Update session settings
 */
export async function updateSession(
  id: string,
  updates: {
    title?: string;
    databricksWorkspaceAutoPush?: boolean;
    databricksWorkspacePath?: string | null;
    model?: string;
  },
  userId: string
): Promise<void> {
  return withUserContext(userId, async () => {
    await db
      .update(sessions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(sessions.id, id));
  });
}

/**
 * Archive session
 */
export async function archiveSession(
  id: string,
  userId: string
): Promise<void> {
  return withUserContext(userId, async () => {
    await db
      .update(sessions)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(eq(sessions.id, id));
  });
}
