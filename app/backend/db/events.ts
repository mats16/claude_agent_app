import { eq, asc, sql } from 'drizzle-orm';
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

  // Extract message field if present
  const messageField =
    'message' in sdkMessage ? (sdkMessage.message as object) : null;

  // Extract parent_tool_use_id if present and not null/undefined
  const rawParentToolUseId =
    'parent_tool_use_id' in sdkMessage
      ? (sdkMessage as Record<string, unknown>).parent_tool_use_id
      : null;
  const parentToolUseId =
    rawParentToolUseId != null ? String(rawParentToolUseId) : null;

  // Build data object (everything except standard fields)
  // If message exists, data is null; otherwise store relevant data
  let data: object | null = null;
  if (!messageField) {
    // For events without 'message' field, store other relevant data
    const {
      type,
      session_id,
      uuid: _uuid,
      subtype: _subtype,
      ...rest
    } = sdkMessage as Record<string, unknown>;
    if (Object.keys(rest).length > 0) {
      data = rest;
    }
  }

  try {
    await db
      .insert(events)
      .values({
        uuid,
        sessionId: sdkMessage.session_id,
        seq,
        type: sdkMessage.type,
        subtype,
        message: messageField,
        data,
        parentToolUseId,
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
): Promise<SDKMessage[]> {
  const result = await db
    .select()
    .from(events)
    .where(eq(events.sessionId, sessionId))
    .orderBy(asc(events.seq));

  // Reconstruct SDKMessage from stored columns
  return result.map((row) => {
    const base: Record<string, unknown> = {
      type: row.type,
      session_id: row.sessionId,
      uuid: row.uuid,
    };

    if (row.subtype) {
      base.subtype = row.subtype;
    }

    if (row.message) {
      base.message = row.message;
    }

    if (row.data) {
      Object.assign(base, row.data);
    }

    if (row.parentToolUseId) {
      base.parent_tool_use_id = row.parentToolUseId;
    }

    return base as SDKMessage;
  });
}
