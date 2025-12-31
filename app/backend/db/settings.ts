import { eq } from 'drizzle-orm';
import { db } from './index.js';
import {
  settings,
  type SelectSettings,
  type InsertSettings,
} from './schema.js';
import { withUserContext } from './rls.util.js';

// Get settings by user ID (with RLS)
export async function getSettings(
  userId: string
): Promise<SelectSettings | null> {
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
): Promise<SelectSettings | null> {
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
  updates: { claudeConfigAutoPush?: boolean }
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
      const newSettings: InsertSettings = {
        userId,
        claudeConfigAutoPush: updates.claudeConfigAutoPush ?? true,
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
