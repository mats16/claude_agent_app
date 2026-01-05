import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
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

// Test data
const testSessionsBase = '/test/sessions';

// Mock Fastify instance
const mockFastify = {
  config: {
    HOME: '/test/home',
    SESSION_BASE_DIR: '/test/home/sessions',
  },
} as unknown as FastifyInstance;

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
      const mockSdkMessage = {
        session_id: mockSessionId,
        type: 'user',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        message: { role: 'user', content: 'Hello' },
      } as unknown as SDKMessage;

      vi.mocked(eventRepo.saveMessage).mockResolvedValue(undefined);

      // Act
      await saveSessionMessage(mockSdkMessage);

      // Assert
      expect(eventRepo.saveMessage).toHaveBeenCalledWith(mockSdkMessage);
    });

    it('should save SDK message with all fields', async () => {
      // Arrange
      const mockSdkMessage = {
        session_id: mockSessionId,
        type: 'result',
        uuid: '650e8400-e29b-41d4-a716-446655440000',
        subtype: 'success',
        is_error: false,
        result: 'Task completed successfully',
      } as unknown as SDKMessage;

      vi.mocked(eventRepo.saveMessage).mockResolvedValue(undefined);

      // Act
      await saveSessionMessage(mockSdkMessage);

      // Assert
      expect(eventRepo.saveMessage).toHaveBeenCalledWith(mockSdkMessage);
    });

    it('should throw ValidationError when session_id is missing', async () => {
      // Arrange
      const invalidMessage = {
        type: 'user',
        uuid: '750e8400-e29b-41d4-a716-446655440000',
        message: { role: 'user', content: 'Hello' },
      } as unknown as SDKMessage;

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
      const invalidMessage = {
        session_id: '',
        type: 'user',
        uuid: '850e8400-e29b-41d4-a716-446655440000',
        message: { role: 'user', content: 'Hello' },
      } as unknown as SDKMessage;

      // Act & Assert
      await expect(saveSessionMessage(invalidMessage)).rejects.toThrow(
        'sdkMessage.session_id is required'
      );
    });

    it('should propagate repository errors', async () => {
      // Arrange
      const mockSdkMessage = {
        session_id: mockSessionId,
        type: 'user',
        uuid: '950e8400-e29b-41d4-a716-446655440000',
        message: { role: 'user', content: 'Hello' },
      } as unknown as SDKMessage;

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
      const mockSession = Session.fromSelectSession(mockSelectSession, testSessionsBase);

      const mockMessages = [
        {
          uuid: 'msg-1',
          message: {
            session_id: mockSessionId,
            type: 'user',
            uuid: 'a50e8400-e29b-41d4-a716-446655440000',
            message: { role: 'user', content: 'Hello' },
          } as unknown as SDKMessage,
        },
        {
          uuid: 'msg-2',
          message: {
            session_id: mockSessionId,
            type: 'assistant',
            uuid: 'b50e8400-e29b-41d4-a716-446655440000',
            message: { role: 'assistant', content: 'Hi there!' },
          } as unknown as SDKMessage,
        },
      ];

      vi.mocked(sessionService.getSession).mockResolvedValue(mockSession);
      vi.mocked(eventRepo.getMessagesBySessionId).mockResolvedValue(mockMessages);

      // Act
      const result = await getSessionMessages(mockFastify, mockSessionId, mockUserId);

      // Assert
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual(mockMessages[0].message);
      expect(result.messages[1]).toEqual(mockMessages[1].message);
      expect(result.first_id).toBe('msg-1');
      expect(result.last_id).toBe('msg-2');

      expect(sessionService.getSession).toHaveBeenCalledWith(mockFastify, mockSessionId, mockUserId);
      expect(eventRepo.getMessagesBySessionId).toHaveBeenCalledWith(mockSessionId);
    });

    it('should return empty array when no messages exist', async () => {
      // Arrange
      const mockSession = Session.fromSelectSession(mockSelectSession, testSessionsBase);

      vi.mocked(sessionService.getSession).mockResolvedValue(mockSession);
      vi.mocked(eventRepo.getMessagesBySessionId).mockResolvedValue([]);

      // Act
      const result = await getSessionMessages(mockFastify, mockSessionId, mockUserId);

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
        getSessionMessages(mockFastify, mockSessionId, mockUserId)
      ).rejects.toThrow(SessionNotFoundError);
      await expect(
        getSessionMessages(mockFastify, mockSessionId, mockUserId)
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
        getSessionMessages(mockFastify, mockSessionId, differentUserId)
      ).rejects.toThrow(SessionNotFoundError);
      await expect(
        getSessionMessages(mockFastify, mockSessionId, differentUserId)
      ).rejects.toThrow('Session session_01h455vb4pex5vsknk084sn02q not found');
    });

    it('should extract messages from repository response correctly', async () => {
      // Arrange
      const mockSession = Session.fromSelectSession(mockSelectSession, testSessionsBase);

      const mockSdkMessage1 = {
        session_id: mockSessionId,
        type: 'user',
        uuid: 'c50e8400-e29b-41d4-a716-446655440000',
        message: { role: 'user', content: 'Test message 1' },
      } as unknown as SDKMessage;

      const mockSdkMessage2 = {
        session_id: mockSessionId,
        type: 'result',
        uuid: 'd50e8400-e29b-41d4-a716-446655440000',
        subtype: 'success',
        is_error: false,
        result: 'Task completed',
      } as unknown as SDKMessage;

      const mockMessages = [
        {
          uuid: 'msg-1',
          message: mockSdkMessage1,
        },
        {
          uuid: 'msg-2',
          message: mockSdkMessage2,
        },
      ];

      vi.mocked(sessionService.getSession).mockResolvedValue(mockSession);
      vi.mocked(eventRepo.getMessagesBySessionId).mockResolvedValue(mockMessages);

      // Act
      const result = await getSessionMessages(mockFastify, mockSessionId, mockUserId);

      // Assert
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual(mockSdkMessage1);
      expect(result.messages[1]).toEqual(mockSdkMessage2);
      expect(result.messages[0].type).toBe('user');
      expect(result.messages[1].type).toBe('result');
      expect((result.messages[1] as any).subtype).toBe('success');
      expect(result.first_id).toBe('msg-1');
      expect(result.last_id).toBe('msg-2');
    });
  });
});
