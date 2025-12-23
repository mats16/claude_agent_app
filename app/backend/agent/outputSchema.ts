import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { OutputFormat } from '@anthropic-ai/claude-agent-sdk';

export const sessionOutputSchema = z.object({
  session_title: z
    .string()
    .describe(
      'A concise, descriptive title (max 50 chars) capturing the main topic or action of this session. Use sentence case without trailing punctuation. Use the same language as the user message.'
    ),
  summary: z
    .string()
    .describe(
      'A brief summary (2-3 sentences) of what was accomplished in this session, including key actions taken, tools used, and outcomes achieved.'
    ),
  response: z
    .string()
    .describe(
      "The complete response text to display to the user. This should be the full, natural language answer addressing the user's request, formatted with appropriate markdown when needed."
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
