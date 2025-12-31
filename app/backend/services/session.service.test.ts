import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSessionFromDraft,
  getSession,
  listUserSessions,
  updateSessionSettings,
  archiveSessionWithCleanup,
} from './session.service.js';
import { Session, SessionDraft } from '../models/Session.js';
import type { SelectSession } from '../db/schema.js';
import * as sessionRepo from '../db/sessions.js';
import * as workspaceQueueService from './workspace-queue.service.js';
import { SessionNotFoundError, ValidationError } from '../errors/ServiceErrors.js';

// Mock database to avoid DATABASE_URL requirement
vi.mock('../db/index.js', () => ({
  db: {},
}));

// Mock dependencies
vi.mock('../db/sessions.js');
vi.mock('./workspace-queue.service.js');

describe('session.service', () => {
  const mockUserId = 'user-123';
  const mockClaudeCodeSessionId = 'claude-session-456';
  const mockSessionId = 'session_01h455vb4pex5vsknk084sn02q';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createSessionFromDraft', () => {
    it('should create session from draft with domain model conversion', async () => {
      // Arrange
      const draft = new SessionDraft({
        userId: mockUserId,
        title: 'Test Session',
        databricksWorkspacePath: '/Workspace/Users/test@example.com/sessions/test',
        databricksWorkspaceAutoPush: true,
      });

      vi.mocked(sessionRepo.createSession).mockResolvedValue(undefined);

      // Act
      const result = await createSessionFromDraft(
        draft,
        mockClaudeCodeSessionId,
        mockUserId
      );

      // Assert
      expect(result).toBeInstanceOf(Session);
      expect(result.claudeCodeSessionId).toBe(mockClaudeCodeSessionId);
      expect(result.userId).toBe(mockUserId);
      expect(result.title).toBe('Test Session');
      expect(result.databricksWorkspacePath).toBe('/Workspace/Users/test@example.com/sessions/test');
      expect(result.databricksWorkspaceAutoPush).toBe(true);
      expect(result.isArchived).toBe(false);
      expect(result.summary).toBe(null);

      // Verify repository was called with correct data
      expect(sessionRepo.createSession).toHaveBeenCalledWith(
        {
          id: result.toString(),
          claudeCodeSessionId: mockClaudeCodeSessionId,
          userId: mockUserId,
          title: 'Test Session',
          summary: null,
          databricksWorkspacePath: '/Workspace/Users/test@example.com/sessions/test',
          databricksWorkspaceAutoPush: true,
          isArchived: false,
        },
        mockUserId
      );
    });

    it('should handle draft with minimal fields', async () => {
      // Arrange
      const draft = new SessionDraft({
        userId: mockUserId,
      });

      vi.mocked(sessionRepo.createSession).mockResolvedValue(undefined);

      // Act
      const result = await createSessionFromDraft(
        draft,
        mockClaudeCodeSessionId,
        mockUserId
      );

      // Assert
      expect(result.title).toBe(null);
      expect(result.databricksWorkspacePath).toBe(null);
      expect(result.databricksWorkspaceAutoPush).toBe(false);
    });

    it('should throw error with context when repository fails', async () => {
      // Arrange
      const draft = new SessionDraft({
        userId: mockUserId,
      });

      const dbError = new Error('Database connection failed');
      vi.mocked(sessionRepo.createSession).mockRejectedValue(dbError);

      // Act & Assert
      await expect(
        createSessionFromDraft(draft, mockClaudeCodeSessionId, mockUserId)
      ).rejects.toThrow(/Failed to create session.*Database connection failed/);
    });
  });

  describe('getSession', () => {
    it('should return session with domain model conversion', async () => {
      // Arrange
      const mockSelectSession: SelectSession = {
        id: mockSessionId,
        claudeCodeSessionId: mockClaudeCodeSessionId,
        userId: mockUserId,
        title: 'Test Session',
        summary: 'A test session summary',
        databricksWorkspacePath: '/Workspace/Users/test@example.com/sessions/test',
        databricksWorkspaceAutoPush: true,
        isArchived: false,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T01:00:00Z'),
      };

      vi.mocked(sessionRepo.getSessionById).mockResolvedValue(mockSelectSession);

      // Act
      const result = await getSession(mockSessionId, mockUserId);

      // Assert
      expect(result).toBeInstanceOf(Session);
      expect(result?.toString()).toBe(mockSessionId);
      expect(result?.claudeCodeSessionId).toBe(mockClaudeCodeSessionId);
      expect(result?.userId).toBe(mockUserId);
      expect(result?.title).toBe('Test Session');
      expect(result?.summary).toBe('A test session summary');

      expect(sessionRepo.getSessionById).toHaveBeenCalledWith(mockSessionId, mockUserId);
    });

    it('should return null when session not found', async () => {
      // Arrange
      vi.mocked(sessionRepo.getSessionById).mockResolvedValue(null);

      // Act
      const result = await getSession('nonexistent-session', mockUserId);

      // Assert
      expect(result).toBe(null);
    });
  });

  describe('listUserSessions', () => {
    it('should return array of sessions with domain model conversion', async () => {
      // Arrange
      const mockSelectSessions: SelectSession[] = [
        {
          id: 'session_01h455vb4pex5vsknk084sn02q',
          claudeCodeSessionId: 'claude-1',
          userId: mockUserId,
          title: 'Session 1',
          summary: null,
          databricksWorkspacePath: null,
          databricksWorkspaceAutoPush: false,
          isArchived: false,
          createdAt: new Date('2025-01-01T00:00:00Z'),
          updatedAt: new Date('2025-01-01T00:00:00Z'),
        },
        {
          id: 'session_01h455vb4pex5vsknk084sn02r',
          claudeCodeSessionId: 'claude-2',
          userId: mockUserId,
          title: 'Session 2',
          summary: 'Summary 2',
          databricksWorkspacePath: '/Workspace/test',
          databricksWorkspaceAutoPush: true,
          isArchived: false,
          createdAt: new Date('2025-01-02T00:00:00Z'),
          updatedAt: new Date('2025-01-02T00:00:00Z'),
        },
      ];

      vi.mocked(sessionRepo.getSessionsByUserId).mockResolvedValue(mockSelectSessions);

      // Act
      const result = await listUserSessions(mockUserId, 'active');

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Session);
      expect(result[1]).toBeInstanceOf(Session);
      expect(result[0].title).toBe('Session 1');
      expect(result[1].title).toBe('Session 2');

      expect(sessionRepo.getSessionsByUserId).toHaveBeenCalledWith(mockUserId, 'active');
    });

    it('should return empty array when no sessions found', async () => {
      // Arrange
      vi.mocked(sessionRepo.getSessionsByUserId).mockResolvedValue([]);

      // Act
      const result = await listUserSessions(mockUserId, 'all');

      // Assert
      expect(result).toEqual([]);
    });

    it('should use default filter "active" when not specified', async () => {
      // Arrange
      vi.mocked(sessionRepo.getSessionsByUserId).mockResolvedValue([]);

      // Act
      await listUserSessions(mockUserId);

      // Assert
      expect(sessionRepo.getSessionsByUserId).toHaveBeenCalledWith(mockUserId, 'active');
    });
  });

  describe('updateSessionSettings', () => {
    const mockSelectSession: SelectSession = {
      id: mockSessionId,
      claudeCodeSessionId: mockClaudeCodeSessionId,
      userId: mockUserId,
      title: 'Test Session',
      summary: null,
      databricksWorkspacePath: '/Workspace/Users/test@example.com/sessions/test',
      databricksWorkspaceAutoPush: false,
      isArchived: false,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
    };

    it('should update session settings successfully', async () => {
      // Arrange
      vi.mocked(sessionRepo.getSessionById).mockResolvedValue(mockSelectSession);
      vi.mocked(sessionRepo.updateSession).mockResolvedValue(undefined);

      // Act
      await updateSessionSettings(mockSessionId, mockUserId, {
        title: 'Updated Title',
      });

      // Assert
      expect(sessionRepo.updateSession).toHaveBeenCalledWith(
        mockSessionId,
        { title: 'Updated Title' },
        mockUserId
      );
    });

    it('should throw SessionNotFoundError when session not found', async () => {
      // Arrange
      vi.mocked(sessionRepo.getSessionById).mockResolvedValue(null);

      // Act & Assert
      await expect(
        updateSessionSettings(mockSessionId, mockUserId, { title: 'New Title' })
      ).rejects.toThrow(SessionNotFoundError);
      await expect(
        updateSessionSettings(mockSessionId, mockUserId, { title: 'New Title' })
      ).rejects.toThrow('Session session_01h455vb4pex5vsknk084sn02q not found');
    });

    it('should throw ValidationError when enabling auto-push without workspace path', async () => {
      // Arrange - Session with NO workspace path
      const sessionWithoutPath: SelectSession = {
        ...mockSelectSession,
        databricksWorkspacePath: null,
        databricksWorkspaceAutoPush: false,
      };

      vi.mocked(sessionRepo.getSessionById).mockResolvedValue(sessionWithoutPath);

      // Act & Assert - Should fail when trying to enable auto-push without path
      await expect(
        updateSessionSettings(mockSessionId, mockUserId, {
          databricksWorkspaceAutoPush: true,
        })
      ).rejects.toThrow(ValidationError);
      await expect(
        updateSessionSettings(mockSessionId, mockUserId, {
          databricksWorkspaceAutoPush: true,
        })
      ).rejects.toThrow('databricksWorkspaceAutoPush requires databricksWorkspacePath to be set');
    });

    it('should allow enabling auto-push when workspace path exists in session', async () => {
      // Arrange - Session WITH workspace path
      const sessionWithPath: SelectSession = {
        ...mockSelectSession,
        databricksWorkspacePath: '/Workspace/Users/test@example.com/sessions/test',
        databricksWorkspaceAutoPush: false,
      };

      vi.mocked(sessionRepo.getSessionById).mockResolvedValue(sessionWithPath);
      vi.mocked(sessionRepo.updateSession).mockResolvedValue(undefined);

      // Act
      await updateSessionSettings(mockSessionId, mockUserId, {
        databricksWorkspaceAutoPush: true,
      });

      // Assert
      expect(sessionRepo.updateSession).toHaveBeenCalledWith(
        mockSessionId,
        { databricksWorkspaceAutoPush: true },
        mockUserId
      );
    });

    it('should allow enabling auto-push when workspace path provided in updates', async () => {
      // Arrange - Session without path, but path provided in updates
      const sessionWithoutPath: SelectSession = {
        ...mockSelectSession,
        databricksWorkspacePath: null,
        databricksWorkspaceAutoPush: false,
      };

      vi.mocked(sessionRepo.getSessionById).mockResolvedValue(sessionWithoutPath);
      vi.mocked(sessionRepo.updateSession).mockResolvedValue(undefined);

      // Act
      await updateSessionSettings(mockSessionId, mockUserId, {
        databricksWorkspacePath: '/Workspace/new/path',
        databricksWorkspaceAutoPush: true,
      });

      // Assert
      expect(sessionRepo.updateSession).toHaveBeenCalledWith(
        mockSessionId,
        {
          databricksWorkspacePath: '/Workspace/new/path',
          databricksWorkspaceAutoPush: true,
        },
        mockUserId
      );
    });

    it('should disable auto-push when clearing workspace path', async () => {
      // Arrange
      vi.mocked(sessionRepo.getSessionById).mockResolvedValue(mockSelectSession);
      vi.mocked(sessionRepo.updateSession).mockResolvedValue(undefined);

      // Act
      await updateSessionSettings(mockSessionId, mockUserId, {
        databricksWorkspacePath: null,
      });

      // Assert - Should automatically disable auto-push
      expect(sessionRepo.updateSession).toHaveBeenCalledWith(
        mockSessionId,
        {
          databricksWorkspacePath: null,
          databricksWorkspaceAutoPush: false, // Auto-added by service
        },
        mockUserId
      );
    });
  });

  describe('archiveSessionWithCleanup', () => {
    const mockSelectSession: SelectSession = {
      id: mockSessionId,
      claudeCodeSessionId: mockClaudeCodeSessionId,
      userId: mockUserId,
      title: 'Test Session',
      summary: null,
      databricksWorkspacePath: '/Workspace/Users/test@example.com/sessions/test',
      databricksWorkspaceAutoPush: true,
      isArchived: false,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
    };

    it('should archive session and enqueue cleanup when workspace path exists', async () => {
      // Arrange
      vi.mocked(sessionRepo.getSessionById).mockResolvedValue(mockSelectSession);
      vi.mocked(sessionRepo.archiveSession).mockResolvedValue(undefined);
      const enqueueDeleteSpy = vi.mocked(workspaceQueueService.enqueueDelete);

      // Act
      await archiveSessionWithCleanup(mockSessionId, mockUserId);

      // Assert
      expect(sessionRepo.archiveSession).toHaveBeenCalledWith(mockSessionId, mockUserId);
      expect(enqueueDeleteSpy).toHaveBeenCalledWith({
        userId: mockUserId,
        localPath: expect.stringMatching(/01h455vb4pex5vsknk084sn02q/), // Should contain TypeID suffix
      });
    });

    it('should archive session and always enqueue cleanup (even without workspace path)', async () => {
      // Arrange - Session without workspace path
      const sessionWithoutPath: SelectSession = {
        ...mockSelectSession,
        databricksWorkspacePath: null,
      };

      vi.mocked(sessionRepo.getSessionById).mockResolvedValue(sessionWithoutPath);
      vi.mocked(sessionRepo.archiveSession).mockResolvedValue(undefined);

      // Act
      await archiveSessionWithCleanup(mockSessionId, mockUserId);

      // Assert
      expect(sessionRepo.archiveSession).toHaveBeenCalledWith(mockSessionId, mockUserId);
      // Local directory cleanup should always be enqueued
      expect(workspaceQueueService.enqueueDelete).toHaveBeenCalledWith({
        userId: mockUserId,
        localPath: expect.stringMatching(/01h455vb4pex5vsknk084sn02q/),
      });
    });

    it('should throw SessionNotFoundError when session not found', async () => {
      // Arrange
      vi.mocked(sessionRepo.getSessionById).mockResolvedValue(null);

      // Act & Assert
      await expect(
        archiveSessionWithCleanup(mockSessionId, mockUserId)
      ).rejects.toThrow(SessionNotFoundError);
      await expect(
        archiveSessionWithCleanup(mockSessionId, mockUserId)
      ).rejects.toThrow('Session session_01h455vb4pex5vsknk084sn02q not found');

      // Should not attempt to archive or enqueue
      expect(sessionRepo.archiveSession).not.toHaveBeenCalled();
      expect(workspaceQueueService.enqueueDelete).not.toHaveBeenCalled();
    });
  });
});
