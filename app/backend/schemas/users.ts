import { z } from 'zod';

// User settings body schema
export const updateSettingsBodySchema = z.object({
  claude_config_auto_push: z.boolean(),
});

// User info response schema
export const userInfoResponseSchema = z.object({
  user_id: z.string(),
  email: z.string().email().nullable(),
  workspace_home: z.string().nullable(),
  has_workspace_permission: z.boolean(),
  databricks_app_url: z.string().url().nullable(),
});

// User settings response schema
export const userSettingsResponseSchema = z.object({
  user_id: z.string(),
  claude_config_auto_push: z.boolean(),
});

// Claude backup settings response schema
export const claudeBackupSettingsResponseSchema = z.object({
  claude_config_auto_push: z.boolean(),
});

// Update settings success response
export const updateSettingsSuccessResponseSchema = z.object({
  success: z.literal(true),
});

// Update backup settings success response
export const updateBackupSettingsSuccessResponseSchema = z.object({
  success: z.literal(true),
  claude_config_auto_push: z.boolean(),
});

// Type exports
export type UpdateSettingsBody = z.infer<typeof updateSettingsBodySchema>;
export type UserInfoResponse = z.infer<typeof userInfoResponseSchema>;
export type UserSettingsResponse = z.infer<typeof userSettingsResponseSchema>;
export type ClaudeBackupSettingsResponse = z.infer<
  typeof claudeBackupSettingsResponseSchema
>;
