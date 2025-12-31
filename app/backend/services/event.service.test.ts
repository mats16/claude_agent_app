import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveSessionMessage,
  getSessionMessages,
} from './event.service.js';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import * as eventRepo from '../db/events.js';
import * as sessionService from './session.service.js';
import { Session } from '../models/Session.js';
import type { SelectSession } from '../db/schema.js';
import { SessionNotFoundError, ValidationError } from '../errors/ServiceErrors.js';

// Mock database to avoid DATABASE_URL requirement
vi.mock('../db/index.js', () => ({
  db: {},
}));

// Mock dependencies
vi.mock('../db/events.js');
vi.mock('./session.service.js');

describe('event.service', () => {
  const mockSessionId = 'session_01h455vb4pex5vsknk084sn02q';
  const mockUserId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('saveSessionMessage', () => {
    it('should save valid SDK message', async () => {
      // Arrange
      const mockSdkMessage: SDKMessage = {
        session_id: mockSessionId,
        type: 'input',
        created_at: '2025-01-01T00:00:00Z',
        message: { role: 'user', content: 'Hello' },
      };

      vi.mocked(eventRepo.saveMessage).mockResolvedValue(undefined);

      // Act
      await saveSessionMessage(mockSdkMessage);

      // Assert
      expect(eventRepo.saveMessage).toHaveBeenCalledWith(mockSdkMessage);
    });

    it('should save SDK message with all fields', async () => {
      // Arrange
      const mockSdkMessage: SDKMessage = {
        session_id: mockSessionId,
        type: 'result',
        subtype: 'completed',
        created_at: '2025-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: 'Response',
        },
        result: {
          status: 'success',
        },
      };

      vi.mocked(eventRepo.saveMessage).mockResolvedValue(undefined);

      // Act
      await saveSessionMessage(mockSdkMessage);

      // Assert
      expect(eventRepo.saveMessage).toHaveBeenCalledWith(mockSdkMessage);
    });

    it('should throw ValidationError when session_id is missing', async () => {
      // Arrange
      const invalidMessage = {
        type: 'input',
        created_at: '2025-01-01T00:00:00Z',
        message: { role: 'user', content: 'Hello' },
      } as SDKMessage;

      // Act & Assert
      await expect(saveSessionMessage(invalidMessage)).rejects.toThrow(ValidationError);
      await expect(saveSessionMessage(invalidMessage)).rejects.toThrow(
        'sdkMessage.session_id is required'
      );

      // Should not call repository
      expect(eventRepo.saveMessage).not.toHaveBeenCalled();
    });

    it('should throw ValidationError when type is missing', async () => {
      // Arrange
      const invalidMessage = {
        session_id: mockSessionId,
        created_at: '2025-01-01T00:00:00Z',
        message: { role: 'user', content: 'Hello' },
      } as any as SDKMessage;

      // Act & Assert
      await expect(saveSessionMessage(invalidMessage)).rejects.toThrow(ValidationError);
      await expect(saveSessionMessage(invalidMessage)).rejects.toThrow(
        'sdkMessage.type is required'
      );

      // Should not call repository
      expect(eventRepo.saveMessage).not.toHaveBeenCalled();
    });

    it('should throw error when session_id is empty string', async () => {
      // Arrange
      const invalidMessage: SDKMessage = {
        session_id: '',
        type: 'input',
        created_at: '2025-01-01T00:00:00Z',
        message: { role: 'user', content: 'Hello' },
      };

      // Act & Assert
      await expect(saveSessionMessage(invalidMessage)).rejects.toThrow(
        'sdkMessage.session_id is required'
      );
    });

    it('should propagate repository errors', async () => {
      // Arrange
      const mockSdkMessage: SDKMessage = {
        session_id: mockSessionId,
        type: 'input',
        created_at: '2025-01-01T00:00:00Z',
        message: { role: 'user', content: 'Hello' },
      };

      const dbError = new Error('Database write failed');
      vi.mocked(eventRepo.saveMessage).mockRejectedValue(dbError);

      // Act & Assert
      await expect(saveSessionMessage(mockSdkMessage)).rejects.toThrow('Database write failed');
    });
  });

  describe('getSessionMessages', () => {
    const mockSelectSession: SelectSession = {
      id: mockSessionId,
      claudeCodeSessionId: 'claude-session-456',
      userId: mockUserId,
      model: 'claude-sonnet-4.5',
      title: 'Test Session',
      summary: null,
      databricksWorkspacePath: null,
      databricksWorkspaceAutoPush: false,
      isArchived: false,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
    };

    it('should return messages when session exists and user has access', async () => {
      // Arrange
      const mockSession = Session.fromSelectSession(mockSelectSession);

      const mockMessages = [
        {
          id: 'msg-1',
          sessionId: mockSessionId,
          seq: 1,
          message: {
            session_id: mockSessionId,
            type: 'input',
            created_at: '2025-01-01T00:00:00Z',
            message: { role: 'user', content: 'Hello' },
          } as SDKMessage,
          createdAt: new Date('2025-01-01T00:00:00Z'),
        },
        {
          id: 'msg-2',
          sessionId: mockSessionId,
          seq: 2,
          message: {
            session_id: mockSessionId,
            type: 'output',
            created_at: '2025-01-01T00:00:01Z',
            message: { role: 'assistant', content: 'Hi there!' },
          } as SDKMessage,
          createdAt: new Date('2025-01-01T00:00:01Z'),
        },
      ];

      vi.mocked(sessionService.getSession).mockResolvedValue(mockSession);
      vi.mocked(eventRepo.getMessagesBySessionId).mockResolvedValue(mockMessages);

      // Act
      const result = await getSessionMessages(mockSessionId, mockUserId);

      // Assert
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual(mockMessages[0].message);
      expect(result.messages[1]).toEqual(mockMessages[1].message);
      expect(result.first_id).toBe('msg-1');
      expect(result.last_id).toBe('msg-2');

      expect(sessionService.getSession).toHaveBeenCalledWith(mockSessionId, mockUserId);
      expect(eventRepo.getMessagesBySessionId).toHaveBeenCalledWith(mockSessionId);
    });

    it('should return empty array when no messages exist', async () => {
      // Arrange
      const mockSession = Session.fromSelectSession(mockSelectSession);

      vi.mocked(sessionService.getSession).mockResolvedValue(mockSession);
      vi.mocked(eventRepo.getMessagesBySessionId).mockResolvedValue([]);

      // Act
      const result = await getSessionMessages(mockSessionId, mockUserId);

      // Assert
      expect(result.messages).toEqual([]);
      expect(result.first_id).toBeNull();
      expect(result.last_id).toBeNull();
    });

    it('should throw SessionNotFoundError when session not found', async () => {
      // Arrange
      vi.mocked(sessionService.getSession).mockResolvedValue(null);

      // Act & Assert
      await expect(
        getSessionMessages(mockSessionId, mockUserId)
      ).rejects.toThrow(SessionNotFoundError);
      await expect(
        getSessionMessages(mockSessionId, mockUserId)
      ).rejects.toThrow('Session session_01h455vb4pex5vsknk084sn02q not found');

      // Should not attempt to fetch messages
      expect(eventRepo.getMessagesBySessionId).not.toHaveBeenCalled();
    });

    it('should throw SessionNotFoundError when user lacks access to session', async () => {
      // Arrange - Session exists but belongs to different user
      const differentUserId = 'different-user-456';

      // getSession will return null due to RLS when user doesn't own the session
      vi.mocked(sessionService.getSession).mockResolvedValue(null);

      // Act & Assert
      await expect(
        getSessionMessages(mockSessionId, differentUserId)
      ).rejects.toThrow(SessionNotFoundError);
      await expect(
        getSessionMessages(mockSessionId, differentUserId)
      ).rejects.toThrow('Session session_01h455vb4pex5vsknk084sn02q not found');
    });

    it('should extract messages from repository response correctly', async () => {
      // Arrange
      const mockSession = Session.fromSelectSession(mockSelectSession);

      const mockSdkMessage1: SDKMessage = {
        session_id: mockSessionId,
        type: 'input',
        created_at: '2025-01-01T00:00:00Z',
        message: { role: 'user', content: 'Test message 1' },
      };

      const mockSdkMessage2: SDKMessage = {
        session_id: mockSessionId,
        type: 'result',
        subtype: 'completed',
        created_at: '2025-01-01T00:00:01Z',
        message: { role: 'assistant', content: 'Test message 2' },
        result: { status: 'success' },
      };

      const mockMessages = [
        {
          id: 'msg-1',
          sessionId: mockSessionId,
          seq: 1,
          message: mockSdkMessage1,
          createdAt: new Date('2025-01-01T00:00:00Z'),
        },
        {
          id: 'msg-2',
          sessionId: mockSessionId,
          seq: 2,
          message: mockSdkMessage2,
          createdAt: new Date('2025-01-01T00:00:01Z'),
        },
      ];

      vi.mocked(sessionService.getSession).mockResolvedValue(mockSession);
      vi.mocked(eventRepo.getMessagesBySessionId).mockResolvedValue(mockMessages);

      // Act
      const result = await getSessionMessages(mockSessionId, mockUserId);

      // Assert
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual(mockSdkMessage1);
      expect(result.messages[1]).toEqual(mockSdkMessage2);
      expect(result.messages[0].type).toBe('input');
      expect(result.messages[1].type).toBe('result');
      expect(result.messages[1].subtype).toBe('completed');
      expect(result.first_id).toBe('msg-1');
      expect(result.last_id).toBe('msg-2');
    });
  });
});
