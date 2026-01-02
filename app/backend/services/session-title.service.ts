import type { MessageContent } from '@app/shared';
import { databricks, agentEnv } from '../config/index.js';
import { getServicePrincipalAccessToken } from '../utils/auth.js';
import { updateSessionTitle } from '../db/sessions.js';
import { notifySessionUpdated } from './session-state.service.js';

const HAIKU_MODEL = agentEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL;
const MAX_TITLE_LENGTH = 50;

interface GenerateTitleOptions {
  sessionId: string;
  messageContent: MessageContent[];
  userId: string;
  userAccessToken?: string;
}

/**
 * Generate session title asynchronously using Haiku model.
 * Fire-and-forget: errors are logged but don't affect session processing.
 */
export async function generateTitleAsync(
  options: GenerateTitleOptions
): Promise<void> {
  const { sessionId, messageContent, userId, userAccessToken } = options;

  try {
    const title = await callHaikuForTitle(messageContent, userAccessToken);
    if (title) {
      // Update session title in database (only if currently null)
      const updated = await updateSessionTitle(sessionId, title, userId);
      if (updated) {
        // Notify frontend via WebSocket
        notifySessionUpdated(userId, { id: sessionId, title });
        console.log(
          `[TitleService] Generated title for session ${sessionId}: "${title}"`
        );
      }
    }
  } catch (error) {
    console.error('[TitleService] Failed to generate title:', error);
  }
}

/**
 * Call Haiku API to generate a title from message content.
 */
async function callHaikuForTitle(
  messageContent: MessageContent[],
  userAccessToken?: string
): Promise<string | null> {
  const accessToken = userAccessToken ?? (await getServicePrincipalAccessToken());
  if (!accessToken) {
    console.warn('[TitleService] No access token available');
    return null;
  }

  // Convert MessageContent[] to Anthropic API content format
  const apiContent = messageContent.map((c) => {
    if (c.type === 'text') {
      return { type: 'text' as const, text: c.text };
    } else {
      return {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: c.source.media_type,
          data: c.source.data,
        },
      };
    }
  });

  const systemPrompt = `Generate a concise title (max ${MAX_TITLE_LENGTH} chars) for this conversation.
Rules:
- Return ONLY the title, no quotes, no explanation
- Use the same language as the user message
- Use sentence case without trailing punctuation
- Summarize the overall goal or theme`;

  const url = `${databricks.hostUrl}/serving-endpoints/${HAIKU_MODEL}/invocations`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      anthropic_version: '2023-06-01',
      max_tokens: 100,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: apiContent,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Haiku API error: ${response.status} - ${errorText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await response.json()) as any;

  // Try different response formats
  // Databricks format: { choices: [{ message: { content: "..." } }] }
  // Anthropic format: { content: [{ text: "..." }] }
  let title: string | undefined;

  if (data.choices?.[0]?.message?.content) {
    // OpenAI/Databricks format
    title = data.choices[0].message.content.trim();
  } else if (data.content?.[0]?.text) {
    // Anthropic format
    title = data.content[0].text.trim();
  }
  if (!title) {
    return null;
  }

  // Truncate to max length
  return title.slice(0, MAX_TITLE_LENGTH);
}
