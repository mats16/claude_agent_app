import { z } from 'zod';

// Workspace object schema
export const workspaceObjectSchema = z.object({
  path: z.string(),
  object_type: z.string(),
});

// Workspace list response schema
export const workspaceListResponseSchema = z.object({
  objects: z.array(workspaceObjectSchema),
});

// Workspace status body schema
export const workspaceStatusBodySchema = z.object({
  path: z.string().min(1),
});

// Workspace status response schema
export const workspaceStatusResponseSchema = z.object({
  path: z.string(),
  object_type: z.string(),
  object_id: z.number().nullable(),
  browse_url: z.string().url().nullable(),
});

// User workspace params schema
export const userWorkspaceParamsSchema = z.object({
  email: z.string().min(1),
});

// Wildcard workspace params schema
export const wildcardWorkspaceParamsSchema = z.object({
  '*': z.string(),
});

// Type exports
export type WorkspaceObject = z.infer<typeof workspaceObjectSchema>;
export type WorkspaceListResponse = z.infer<typeof workspaceListResponseSchema>;
export type WorkspaceStatusBody = z.infer<typeof workspaceStatusBodySchema>;
export type WorkspaceStatusResponse = z.infer<
  typeof workspaceStatusResponseSchema
>;
export type UserWorkspaceParams = z.infer<typeof userWorkspaceParamsSchema>;
