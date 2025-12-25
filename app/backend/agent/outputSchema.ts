import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { OutputFormat } from '@anthropic-ai/claude-agent-sdk';

export const sessionOutputSchema = z.object({
  session_title: z
    .string()
    .describe(
      'A concise, descriptive title (max 50 chars) summarizing the overall goal or theme of the entire session across all conversation turns. Use sentence case without trailing punctuation. Use the same language as the user message.'
    ),
  summary: z
    .string()
    .describe(
      'A comprehensive summary (2-4 sentences) covering everything accomplished throughout the entire session from start to finish. Include all key actions taken, tools used, files created or modified, and final outcomes. This should capture the full scope of work done across all turns, not just the last response.'
    ),
});

export type SessionOutput = z.infer<typeof sessionOutputSchema>;

// Convert Zod schema to JSON Schema for SDK
// Don't use 'name' option to ensure 'type: object' is at root level
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const outputFormat: OutputFormat = {
  type: 'json_schema',
  schema: zodToJsonSchema(sessionOutputSchema as any) as Record<
    string,
    unknown
  >,
};
