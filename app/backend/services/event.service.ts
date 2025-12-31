import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import * as eventRepo from '../db/events.js';
import * as sessionService from './session.service.js';

/**
 * Save session message with validation.
 * Wraps repository's saveMessage with additional business logic.
 *
 * @param sdkMessage - SDK message to save
 */
export async function saveSessionMessage(sdkMessage: SDKMessage): Promise<void> {
  // Validation: Basic message structure
  if (!sdkMessage.session_id) {
    throw new Error('sdkMessage.session_id is required');
  }

  if (!sdkMessage.type) {
    throw new Error('sdkMessage.type is required');
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
 * @returns Array of SDK messages
 */
export async function getSessionMessages(
  sessionId: string,
  userId: string
): Promise<SDKMessage[]> {
  // Business logic: Verify session ownership
  const session = await sessionService.getSession(sessionId, userId);

  if (!session) {
    throw new Error(`Session ${sessionId} not found or access denied`);
  }

  // Repository call
  const messages = await eventRepo.getMessagesBySessionId(sessionId);

  return messages.map((m) => m.message);
}
