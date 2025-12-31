import { eq, asc, desc, sql, or, and } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from './index.js';
import { events } from './schema.js';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

// Get next sequence number for a session
async function getNextSeq(sessionId: string): Promise<number> {
  const result = await db
    .select({ maxSeq: sql<number>`COALESCE(MAX(${events.seq}), 0)` })
    .from(events)
    .where(eq(events.sessionId, sessionId));

  return (result[0]?.maxSeq ?? 0) + 1;
}

// Save a message to the database
export async function saveMessage(sdkMessage: SDKMessage): Promise<void> {
  const uuid =
    'uuid' in sdkMessage && sdkMessage.uuid
      ? String(sdkMessage.uuid)
      : crypto.randomUUID();
  const subtype = 'subtype' in sdkMessage ? String(sdkMessage.subtype) : null;
  const seq = await getNextSeq(sdkMessage.session_id);

  try {
    await db
      .insert(events)
      .values({
        uuid,
        sessionId: sdkMessage.session_id,
        seq,
        type: sdkMessage.type,
        subtype,
        message: sdkMessage, // SDKMessage全体を保存
      })
      .onConflictDoNothing({ target: events.uuid });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to save event:', {
      uuid,
      sessionId: sdkMessage.session_id,
      type: sdkMessage.type,
      subtype,
      error: err.message,
      cause: (err as { cause?: unknown }).cause,
    });
    throw error;
  }
}

// Get all events for a session
export async function getMessagesBySessionId(
  sessionId: string
): Promise<{ uuid: string; message: SDKMessage }[]> {
  const result = await db
    .select({ uuid: events.uuid, message: events.message })
    .from(events)
    .where(eq(events.sessionId, sessionId))
    .orderBy(asc(events.seq));

  return result.map((row) => ({
    uuid: row.uuid,
    message: row.message as SDKMessage,
  }));
}

/**
 * Get the last used model for a session from init or result events.
 * The model is stored in the SDK message payload.
 *
 * @param sessionId - Session ID
 * @returns The model string or null if not found
 */
export async function getLastUsedModel(
  sessionId: string
): Promise<string | null> {
  // Query for init (type='system', subtype='init') or result events
  // Order by seq DESC to get the most recent
  const result = await db
    .select({ message: events.message })
    .from(events)
    .where(
      and(
        eq(events.sessionId, sessionId),
        or(
          and(eq(events.type, 'system'), eq(events.subtype, 'init')),
          eq(events.type, 'result')
        )
      )
    )
    .orderBy(desc(events.seq))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  // Extract model from message
  // SDK init message structure: { type: 'system', subtype: 'init', model: '...', ... }
  // SDK result message structure may also contain model info
  const message = result[0].message as Record<string, unknown>;
  if (typeof message.model === 'string') {
    return message.model;
  }

  return null;
}
