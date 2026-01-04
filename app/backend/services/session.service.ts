import type { FastifyInstance } from 'fastify';
import path from 'path';
import { Session, SessionDraft } from '../models/Session.js';
import type { SelectSession } from '../db/schema.js';
import * as sessionRepo from '../db/sessions.js';
import { enqueueDelete } from './workspace-queue.service.js';
import { SessionNotFoundError, ValidationError } from '../errors/ServiceErrors.js';

/**
 * Create session from SessionDraft after receiving SDK session ID.
 * This function orchestrates domain model conversion and database persistence.
 *
 * @param fastify - Fastify instance for config access
 * @param draft - SessionDraft containing session initialization data
 * @param claudeCodeSessionId - SDK session ID from init message
 * @param userId - User ID for RLS context
 * @returns Session domain model instance
 * @throws Error if session creation fails
 */
export async function createSessionFromDraft(
  fastify: FastifyInstance,
  draft: SessionDraft,
  claudeCodeSessionId: string,
  userId: string
): Promise<Session> {
  // Compute sessionsBase from config
  const sessionsBase = path.join(fastify.config.HOME, fastify.config.WORKING_DIR_BASE);

  // Domain model conversion (business logic)
  const session = Session.fromSessionDraft(draft, claudeCodeSessionId, sessionsBase);

  try {
    // Repository call (data access)
    // Uses ON CONFLICT DO NOTHING to handle retries with the same session ID
    await sessionRepo.createSession(
      {
        id: session.toString(),
        claudeCodeSessionId: session.claudeCodeSessionId,
        userId: session.userId,
        model: session.model,
        title: session.title,
        summary: session.summary,
        databricksWorkspacePath: session.databricksWorkspacePath,
        databricksWorkspaceAutoPush: session.databricksWorkspaceAutoPush,
        isArchived: session.isArchived,
      },
      userId
    );

    return session;
  } catch (error) {
    // Provide better error context for session creation failures
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to create session ${session.toString()}: ${errorMessage}`
    );
  }
}

/**
 * Get session by ID with domain model conversion.
 *
 * @param fastify - Fastify instance for config access
 * @param sessionId - Session ID (TypeID)
 * @param userId - User ID for RLS context
 * @returns Session domain model or null if not found
 */
export async function getSession(
  fastify: FastifyInstance,
  sessionId: string,
  userId: string
): Promise<Session | null> {
  const selectSession = await sessionRepo.getSessionById(sessionId, userId);

  if (!selectSession) {
    return null;
  }

  const sessionsBase = path.join(fastify.config.HOME, fastify.config.WORKING_DIR_BASE);
  return Session.fromSelectSession(selectSession, sessionsBase);
}

/**
 * List user sessions with filtering and domain model conversion.
 *
 * @param fastify - Fastify instance for config access
 * @param userId - User ID for RLS context
 * @param filter - Filter type: 'active', 'archived', or 'all'
 * @returns Array of Session domain models
 */
export async function listUserSessions(
  fastify: FastifyInstance,
  userId: string,
  filter: 'active' | 'archived' | 'all' = 'active'
): Promise<Session[]> {
  const selectSessions = await sessionRepo.getSessionsByUserId(userId, filter);
  const sessionsBase = path.join(fastify.config.HOME, fastify.config.WORKING_DIR_BASE);

  return selectSessions.map((s) => Session.fromSelectSession(s, sessionsBase));
}

/**
 * Update session settings with workspace path validation.
 * Validates that databricksWorkspaceAutoPush requires databricksWorkspacePath.
 * Always fetches current session first to perform validation and ensure consistency.
 *
 * @param fastify - Fastify instance for config access
 * @param sessionId - Session ID (TypeID)
 * @param userId - User ID for RLS context
 * @param updates - Fields to update
 */
export async function updateSessionSettings(
  fastify: FastifyInstance,
  sessionId: string,
  userId: string,
  updates: {
    title?: string;
    databricksWorkspaceAutoPush?: boolean;
    databricksWorkspacePath?: string | null;
    model?: string;
  }
): Promise<void> {
  // Always fetch current session for validation
  const currentSession = await getSession(fastify, sessionId, userId);

  if (!currentSession) {
    throw new SessionNotFoundError(sessionId);
  }

  // Business logic: Validate workspace path rules
  if (updates.databricksWorkspaceAutoPush === true) {
    // If enabling auto-push, ensure workspace path is set (either in updates or current session)
    const finalWorkspacePath = updates.databricksWorkspacePath !== undefined
      ? updates.databricksWorkspacePath
      : currentSession.databricksWorkspacePath;

    if (!finalWorkspacePath) {
      throw new ValidationError(
        'databricksWorkspaceAutoPush requires databricksWorkspacePath to be set'
      );
    }
  }

  // If clearing workspace path, also disable auto-push
  if (updates.databricksWorkspacePath === null) {
    updates.databricksWorkspaceAutoPush = false;
  }

  // Repository call
  await sessionRepo.updateSession(sessionId, updates, userId);
}

/**
 * Archive session and enqueue workspace cleanup.
 * This orchestrates the archival process with cleanup scheduling.
 *
 * @param fastify - Fastify instance for config access
 * @param sessionId - Session ID (TypeID)
 * @param userId - User ID for RLS context
 */
export async function archiveSessionWithCleanup(
  fastify: FastifyInstance,
  sessionId: string,
  userId: string
): Promise<void> {
  // Get session to determine if cleanup is needed
  const session = await getSession(fastify, sessionId, userId);

  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }

  // Archive in database
  await sessionRepo.archiveSession(sessionId, userId);

  // Enqueue local directory cleanup (always needed)
  enqueueDelete({
    userId: session.userId,
    localPath: session.cwd,
  });
}
