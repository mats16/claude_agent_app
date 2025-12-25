import { z } from 'zod';

// Common validation patterns
export const skillNameSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9-]+$/, 'Invalid skill name format');

export const emailSchema = z.string().email();

export const workspacePathSchema = z
  .string()
  .min(1)
  .regex(/^\/Workspace\//, 'Path must start with /Workspace/');

// Session filter enum
export const sessionFilterSchema = z.enum(['active', 'archived', 'all']);

// Pagination schema
export const paginationSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});

// Message content schemas (for user messages)
export const textContentSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1),
});

export const imageContentSchema = z.object({
  type: z.literal('image'),
  source: z.object({
    type: z.literal('base64'),
    media_type: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
    data: z.string().min(1),
  }),
});

export const messageContentSchema = z.union([
  textContentSchema,
  imageContentSchema,
]);

export const messageContentArraySchema = z.array(messageContentSchema).min(1);

// Error response schema
export const errorResponseSchema = z.object({
  error: z.string(),
});

// Success response schema
export const successResponseSchema = z.object({
  success: z.literal(true),
});

// Type exports
export type SkillName = z.infer<typeof skillNameSchema>;
export type SessionFilter = z.infer<typeof sessionFilterSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type TextContent = z.infer<typeof textContentSchema>;
export type ImageContent = z.infer<typeof imageContentSchema>;
export type MessageContent = z.infer<typeof messageContentSchema>;
