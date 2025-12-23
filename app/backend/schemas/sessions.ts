import { z } from 'zod';
import {
  sessionFilterSchema,
  messageContentArraySchema,
  workspacePathSchema,
} from './common.js';

// Session ID schema
export const sessionIdSchema = z.string().uuid();

// Session params schema
export const sessionParamsSchema = z.object({
  sessionId: sessionIdSchema,
});

// List sessions query schema
export const listSessionsQuerySchema = z.object({
  filter: sessionFilterSchema.optional().default('active'),
});

// Create session body schema
export const createSessionBodySchema = z.object({
  events: z.array(
    z.object({
      uuid: z.string().uuid(),
      session_id: z.string(),
      type: z.string(),
      message: z.object({
        role: z.string(),
        content: z.union([z.string(), messageContentArraySchema]),
      }),
    })
  ),
  session_context: z.object({
    model: z.string().min(1),
    workspacePath: z.string().optional(),
    workspaceAutoPush: z.boolean().optional(),
    appAutoDeploy: z.boolean().optional(),
  }),
});

// Update session body schema
export const updateSessionBodySchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    workspaceAutoPush: z.boolean().optional(),
    workspacePath: z.string().nullable().optional(),
    appAutoDeploy: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.workspaceAutoPush !== undefined ||
      data.workspacePath !== undefined ||
      data.appAutoDeploy !== undefined,
    {
      message:
        'At least one field (title, workspaceAutoPush, workspacePath, or appAutoDeploy) is required',
    }
  );

// Session response schema
export const sessionResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  model: z.string().optional(),
  workspacePath: z.string().nullable(),
  workspaceAutoPush: z.boolean(),
  appAutoDeploy: z.boolean(),
  updatedAt: z.string().datetime(),
  cwd: z.string().optional(),
  isArchived: z.boolean(),
});

// Session list response schema
export const sessionListResponseSchema = z.object({
  sessions: z.array(sessionResponseSchema),
});

// Create session response schema
export const createSessionResponseSchema = z.object({
  session_id: z.string().uuid(),
});

// Type exports
export type SessionParams = z.infer<typeof sessionParamsSchema>;
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;
export type CreateSessionBody = z.infer<typeof createSessionBodySchema>;
export type UpdateSessionBody = z.infer<typeof updateSessionBodySchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type SessionListResponse = z.infer<typeof sessionListResponseSchema>;
