import { z } from 'zod';

// User settings body schema
export const updateSettingsBodySchema = z.object({
  claudeConfigAutoPush: z.boolean(),
});

// User info response schema
export const userInfoResponseSchema = z.object({
  userId: z.string(),
  email: z.string().email().nullable(),
  workspaceHome: z.string().nullable(),
  hasWorkspacePermission: z.boolean(),
  databricksAppUrl: z.string().url().nullable(),
});

// User settings response schema
export const userSettingsResponseSchema = z.object({
  userId: z.string(),
  claudeConfigAutoPush: z.boolean(),
});

// Claude backup settings response schema
export const claudeBackupSettingsResponseSchema = z.object({
  claudeConfigAutoPush: z.boolean(),
});

// Update settings success response
export const updateSettingsSuccessResponseSchema = z.object({
  success: z.literal(true),
});

// Update backup settings success response
export const updateBackupSettingsSuccessResponseSchema = z.object({
  success: z.literal(true),
  claudeConfigAutoPush: z.boolean(),
});

// Type exports
export type UpdateSettingsBody = z.infer<typeof updateSettingsBodySchema>;
export type UserInfoResponse = z.infer<typeof userInfoResponseSchema>;
export type UserSettingsResponse = z.infer<typeof userSettingsResponseSchema>;
export type ClaudeBackupSettingsResponse = z.infer<
  typeof claudeBackupSettingsResponseSchema
>;
