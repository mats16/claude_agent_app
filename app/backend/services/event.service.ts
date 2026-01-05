import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { FastifyInstance } from 'fastify';
import * as eventRepo from '../db/events.js';
import * as sessionService from './session.service.js';
import { SessionNotFoundError, ValidationError } from '../errors/ServiceErrors.js';

/**
 * Response type for getSessionMessages
 */
export interface SessionMessagesResponse {
  messages: SDKMessage[];
  first_id: string | null;
  last_id: string | null;
}

/**
 * Save session message with validation.
 * Wraps repository's saveMessage with additional business logic.
 *
 * Note: This function does NOT verify session ownership because it is used
 * exclusively to store messages from the Agent SDK. The SDK-generated messages
 * are trusted and do not require ownership validation.
 *
 * @param sdkMessage - SDK message to save
 */
export async function saveSessionMessage(sdkMessage: SDKMessage): Promise<void> {
  // Validation: Basic message structure
  if (!sdkMessage.session_id) {
    throw new ValidationError('sdkMessage.session_id is required');
  }

  if (!sdkMessage.type) {
    throw new ValidationError('sdkMessage.type is required');
  }

  // Repository call: UUID generation and seq numbering handled by repository
  await eventRepo.saveMessage(sdkMessage);
}

/**
 * Get messages for session with ownership verification.
 * Ensures the requesting user owns the session before returning messages.
 *
 * @param sessionId - Session ID (TypeID)
 * @param userId - User ID for ownership verification
 * @returns Session messages with pagination metadata
 */
export async function getSessionMessages(
  fastify: FastifyInstance,
  sessionId: string,
  userId: string
): Promise<SessionMessagesResponse> {
  // Business logic: Verify session ownership
  const session = await sessionService.getSession(fastify, sessionId, userId);

  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }

  // Repository call
  const events = await eventRepo.getMessagesBySessionId(sessionId);

  return {
    messages: events.map((e) => e.message),
    first_id: events.length > 0 ? events[0].uuid : null,
    last_id: events.length > 0 ? events[events.length - 1].uuid : null,
  };
}
