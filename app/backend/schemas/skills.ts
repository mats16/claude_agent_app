import { z } from 'zod';
import { skillNameSchema } from './common.js';

// Skill params schema
export const skillParamsSchema = z.object({
  skillName: skillNameSchema,
});

// Preset skill params schema
export const presetSkillParamsSchema = z.object({
  presetName: skillNameSchema,
});

// Create skill body schema
export const createSkillBodySchema = z.object({
  name: skillNameSchema,
  description: z.string().min(1).max(500),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .optional()
    .default('1.0.0'),
  content: z.string().min(1),
});

// Update skill body schema
export const updateSkillBodySchema = z.object({
  description: z.string().min(1).max(500),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .optional()
    .default('1.0.0'),
  content: z.string().min(1),
});

// Skill response schema
export const skillResponseSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string(),
  content: z.string(),
});

// Skill list response schema
export const skillListResponseSchema = z.object({
  skills: z.array(skillResponseSchema),
});

// Preset list response schema
export const presetListResponseSchema = z.object({
  presets: z.array(skillResponseSchema),
});

// Type exports
export type SkillParams = z.infer<typeof skillParamsSchema>;
export type PresetSkillParams = z.infer<typeof presetSkillParamsSchema>;
export type CreateSkillBody = z.infer<typeof createSkillBodySchema>;
export type UpdateSkillBody = z.infer<typeof updateSkillBodySchema>;
export type SkillResponse = z.infer<typeof skillResponseSchema>;
export type SkillListResponse = z.infer<typeof skillListResponseSchema>;
export type PresetListResponse = z.infer<typeof presetListResponseSchema>;
