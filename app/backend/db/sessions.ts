import { eq, desc, sql, and } from 'drizzle-orm';
import { db } from './index.js';
import { sessions, type InsertSession, type SelectSession } from './schema.js';
import { Session, SessionDraft } from '../models/Session.js';
import { withUserContext } from './rls.util.js';

// Create a new session (with RLS)
// Uses ON CONFLICT DO NOTHING to handle retries with the same session ID
export async function createSession(
  session: InsertSession,
  userId: string
): Promise<void> {
  return withUserContext(userId, async () => {
    await db.insert(sessions).values(session).onConflictDoNothing();
  });
}

// Create session from SessionDraft after receiving SDK session ID
// Converts draft to Session and persists to database
export async function createSessionFromDraft(
  draft: SessionDraft,
  claudeCodeSessionId: string,
  userId: string
): Promise<Session> {
  // Convert draft to session with SDK session ID
  const session = Session.fromSessionDraft(draft, claudeCodeSessionId);

  // Persist to database
  await withUserContext(userId, async () => {
    await db
      .insert(sessions)
      .values({
        id: session.toString(),
        claudeCodeSessionId: session.claudeCodeSessionId,
        userId: session.userId,
        model: session.model,
        title: session.title,
        summary: session.summary,
        databricksWorkspacePath: session.databricksWorkspacePath,
        databricksWorkspaceAutoPush: session.databricksWorkspaceAutoPush,
        isArchived: session.isArchived,
      })
      .onConflictDoNothing();
  });

  return session;
}

// Get session by ID (with RLS)
export async function getSessionById(
  id: string,
  userId: string
): Promise<SelectSession | null> {
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
): Promise<SelectSession | null> {
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
): Promise<SelectSession[]> {
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

// Update session settings (title, databricksWorkspaceAutoPush, databricksWorkspacePath, model) with RLS
export async function updateSession(
  id: string,
  updates: {
    title?: string;
    databricksWorkspaceAutoPush?: boolean;
    databricksWorkspacePath?: string | null;
    model?: string;
    claudeCodeSessionId?: string; // Allow updating SDK session ID after init
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
