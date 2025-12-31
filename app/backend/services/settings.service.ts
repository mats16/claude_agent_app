import * as settingsRepo from '../db/settings.js';

export interface UserSettings {
  userId: string;
  claudeConfigAutoPush: boolean;
}

/**
 * Get user settings with default fallback.
 * Returns default settings if user settings don't exist.
 *
 * @param userId - User ID
 * @returns User settings
 */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  const settings = await settingsRepo.getSettings(userId);

  if (!settings) {
    // Return default settings
    return {
      userId,
      claudeConfigAutoPush: true,
    };
  }

  return {
    userId: settings.userId,
    claudeConfigAutoPush: settings.claudeConfigAutoPush,
  };
}

/**
 * Update user settings with validation.
 *
 * @param userId - User ID
 * @param updates - Settings to update
 */
export async function updateUserSettings(
  userId: string,
  updates: { claudeConfigAutoPush?: boolean }
): Promise<void> {
  // Validation: claudeConfigAutoPush must be a boolean if provided
  if (
    updates.claudeConfigAutoPush !== undefined &&
    typeof updates.claudeConfigAutoPush !== 'boolean'
  ) {
    throw new Error('claudeConfigAutoPush must be a boolean');
  }

  // Repository call
  await settingsRepo.upsertSettings(userId, updates);
}
