import { eq, desc, sql } from 'drizzle-orm';
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
export async function createSession(
  session: NewSession,
  userId: string
): Promise<void> {
  return withUserContext(userId, async () => {
    await db.insert(sessions).values(session);
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
export async function getSessionByIdDirect(id: string): Promise<Session | null> {
  const result = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);

  return result[0] ?? null;
}

// Get all sessions for a user (with RLS)
export async function getSessionsByUserId(userId: string): Promise<Session[]> {
  return withUserContext(userId, async () => {
    return db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt));
  });
}

// Update session title (with RLS)
export async function updateSessionTitle(
  id: string,
  title: string,
  userId: string
): Promise<void> {
  return withUserContext(userId, async () => {
    await db
      .update(sessions)
      .set({ title, updatedAt: new Date() })
      .where(eq(sessions.id, id));
  });
}

// Update session settings (title and autoSync) with RLS
export async function updateSession(
  id: string,
  updates: { title?: string; autoSync?: boolean },
  userId: string
): Promise<void> {
  return withUserContext(userId, async () => {
    await db
      .update(sessions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(sessions.id, id));
  });
}
