import { z } from 'zod';
import { skillNameSchema } from './common.js';

// Subagent name schema (reuse same pattern as skills)
export const subagentNameSchema = skillNameSchema;

// Model enum schema
export const modelSchema = z.enum(['sonnet', 'opus']).optional();

// Tools schema (comma-separated string, optional)
export const toolsSchema = z.string().max(500).optional();

// Subagent params schema
export const subagentParamsSchema = z.object({
  subagentName: subagentNameSchema,
});

// Preset subagent params schema
export const presetSubagentParamsSchema = z.object({
  presetName: subagentNameSchema,
});

// Create subagent body schema
export const createSubagentBodySchema = z.object({
  name: subagentNameSchema,
  description: z.string().min(1).max(500),
  tools: toolsSchema,
  model: modelSchema,
  content: z.string().min(1),
});

// Update subagent body schema
export const updateSubagentBodySchema = z.object({
  description: z.string().min(1).max(500),
  tools: toolsSchema,
  model: modelSchema,
  content: z.string().min(1),
});

// Subagent response schema
export const subagentResponseSchema = z.object({
  name: z.string(),
  description: z.string(),
  tools: z.string().optional(),
  model: z.enum(['sonnet', 'opus']).optional(),
  content: z.string(),
});

// Subagent list response schema
export const subagentListResponseSchema = z.object({
  subagents: z.array(subagentResponseSchema),
});

// Preset subagent list response schema
export const presetSubagentListResponseSchema = z.object({
  presets: z.array(subagentResponseSchema),
});

// Type exports
export type SubagentParams = z.infer<typeof subagentParamsSchema>;
export type PresetSubagentParams = z.infer<typeof presetSubagentParamsSchema>;
export type CreateSubagentBody = z.infer<typeof createSubagentBodySchema>;
export type UpdateSubagentBody = z.infer<typeof updateSubagentBodySchema>;
export type SubagentResponse = z.infer<typeof subagentResponseSchema>;
export type SubagentListResponse = z.infer<typeof subagentListResponseSchema>;
export type PresetSubagentListResponse = z.infer<
  typeof presetSubagentListResponseSchema
>;
