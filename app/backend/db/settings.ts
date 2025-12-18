import { eq, sql } from 'drizzle-orm';
import { db } from './index.js';
import { settings, type Settings, type NewSettings } from './schema.js';

// Helper to execute queries with RLS user context
async function withUserContext<T>(
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

// Get settings by user ID (with RLS)
export async function getSettings(userId: string): Promise<Settings | null> {
  return withUserContext(userId, async () => {
    const result = await db
      .select()
      .from(settings)
      .where(eq(settings.userId, userId))
      .limit(1);

    return result[0] ?? null;
  });
}

// Get settings without RLS (for internal use when user context is already verified)
export async function getSettingsDirect(
  userId: string
): Promise<Settings | null> {
  const result = await db
    .select()
    .from(settings)
    .where(eq(settings.userId, userId))
    .limit(1);

  return result[0] ?? null;
}

// Upsert settings (create or update) with RLS
export async function upsertSettings(
  userId: string,
  updates: { claudeConfigSync?: boolean }
): Promise<void> {
  return withUserContext(userId, async () => {
    const existing = await db
      .select()
      .from(settings)
      .where(eq(settings.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      // Update existing settings
      await db
        .update(settings)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(settings.userId, userId));
    } else {
      // Create new settings
      const newSettings: NewSettings = {
        userId,
        claudeConfigSync: updates.claudeConfigSync ?? true,
      };
      await db.insert(settings).values(newSettings);
    }
  });
}

// Delete settings (with RLS)
export async function deleteSettings(userId: string): Promise<void> {
  return withUserContext(userId, async () => {
    await db.delete(settings).where(eq(settings.userId, userId));
  });
}
