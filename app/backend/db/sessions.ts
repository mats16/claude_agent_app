import { eq, desc, sql, and } from 'drizzle-orm';
import { db } from './index.js';
import { sessions, type NewSession, type Session } from './schema.js';

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

// Create a new session (with RLS)
// Uses ON CONFLICT DO NOTHING to handle retries with the same session ID
export async function createSession(
  session: NewSession,
  userId: string
): Promise<void> {
  return withUserContext(userId, async () => {
    await db.insert(sessions).values(session).onConflictDoNothing();
  });
}

// Get session by ID (with RLS)
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

    return result[0] ?? null;
  });
}

// Get session by ID without RLS (for internal use when user context is already verified)
export async function getSessionByIdDirect(
  id: string
): Promise<Session | null> {
  const result = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);

  return result[0] ?? null;
}

// Get all sessions for a user (with RLS)
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

    return db
      .select()
      .from(sessions)
      .where(whereClause)
      .orderBy(desc(sessions.createdAt));
  });
}

// Update session title only if currently null (with RLS)
// Returns true if title was updated, false if title already exists
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

// Update session from structured output (with RLS)
// - title: only updated if currently null (using COALESCE)
// - summary: always overwritten
// Returns true if title was updated (for notification purposes)
export async function updateSessionFromStructuredOutput(
  id: string,
  data: { title?: string; summary?: string },
  userId: string
): Promise<boolean> {
  return withUserContext(userId, async () => {
    // Build set clause dynamically
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setClause: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (data.summary !== undefined) {
      setClause.summary = data.summary;
    }

    // Use COALESCE to keep existing title if not NULL
    if (data.title !== undefined) {
      setClause.title = sql`COALESCE(${sessions.title}, ${data.title})`;
    }

    const result = await db
      .update(sessions)
      .set(setClause)
      .where(eq(sessions.id, id))
      .returning({ title: sessions.title });

    // Title was updated if it now equals our new title (was NULL before)
    return data.title !== undefined && result[0]?.title === data.title;
  });
}

// Update session settings (title, workspaceAutoPush, workspacePath, appAutoDeploy) with RLS
export async function updateSession(
  id: string,
  updates: {
    title?: string;
    workspaceAutoPush?: boolean;
    workspacePath?: string | null;
    appAutoDeploy?: boolean;
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

// Archive session (with RLS)
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
