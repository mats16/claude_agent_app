import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import type { SelectSession } from '../../db/schema.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock config to use temp directory for tests
const testSessionsBase = path.join(os.tmpdir(), 'claude-test-sessions');
const testUsersBase = path.join(os.tmpdir(), 'claude-test-users');

vi.mock('../../config/index.js', () => ({
  paths: {
    sessionsBase: testSessionsBase,
    usersBase: testUsersBase,
  },
}));

// Import Session classes after mocking config
const { SessionId, Session } = await import('../Session.js');

describe('SessionId', () => {
  describe('generate', () => {
    it('should generate TypeID with session prefix', () => {
      const sessionId = SessionId.generate();
      expect(sessionId.toString()).toMatch(/^session_[a-z0-9]{26}$/);
    });

    it('should generate unique IDs for multiple instances', () => {
      const id1 = SessionId.generate();
      const id2 = SessionId.generate();
      expect(id1.toString()).not.toBe(id2.toString());
    });
  });

  describe('fromString', () => {
    it('should restore SessionId from string', () => {
      const original = SessionId.generate();
      const restored = SessionId.fromString(original.toString());
      expect(restored.toString()).toBe(original.toString());
    });

    it('should restore specific TypeID string', () => {
      const idString = 'session_01h455vb4pex5vsknk084sn02q';
      const sessionId = SessionId.fromString(idString);
      expect(sessionId.toString()).toBe(idString);
      expect(sessionId.getSuffix()).toBe('01h455vb4pex5vsknk084sn02q');
    });
  });

  describe('path methods', () => {
    it('should return correct cwd path', () => {
      const sessionId = SessionId.generate();
      const cwdPath = sessionId.cwd();
      expect(cwdPath).toContain(testSessionsBase);
      expect(cwdPath).toContain(sessionId.getSuffix());
    });

    it('should compute app name (30 chars max)', () => {
      const sessionId = SessionId.fromString('session_01h455vb4pex5vsknk084sn02q');
      expect(sessionId.getAppName()).toBe('app-01h455vb4pex5vsknk084sn02q');
      expect(sessionId.getAppName().length).toBe(30);
    });

    it('should compute branch name', () => {
      const sessionId = SessionId.fromString('session_01h455vb4pex5vsknk084sn02q');
      expect(sessionId.getBranchName()).toBe('claude/session_01h455vb4pex5vsknk084sn02q');
    });
  });

  describe('createWorkingDirectory', () => {
    beforeEach(() => {
      // Clean up any existing test directories
      if (fs.existsSync(testSessionsBase)) {
        fs.rmSync(testSessionsBase, { recursive: true, force: true });
      }
    });

    afterEach(() => {
      // Clean up test directories after each test
      if (fs.existsSync(testSessionsBase)) {
        fs.rmSync(testSessionsBase, { recursive: true, force: true });
      }
    });

    it('should create working directory successfully', () => {
      const sessionId = SessionId.generate();
      const workDir = sessionId.createWorkingDirectory();

      expect(fs.existsSync(workDir)).toBe(true);
      expect(fs.statSync(workDir).isDirectory()).toBe(true);
    });

    it('should create .claude subdirectory', () => {
      const sessionId = SessionId.generate();
      const workDir = sessionId.createWorkingDirectory();
      const claudeDir = path.join(workDir, '.claude');

      expect(fs.existsSync(claudeDir)).toBe(true);
      expect(fs.statSync(claudeDir).isDirectory()).toBe(true);
    });

    it('should return the created directory path', () => {
      const sessionId = SessionId.generate();
      const workDir = sessionId.createWorkingDirectory();

      // Extract suffix from TypeID
      const suffix = sessionId.getSuffix();
      expect(workDir).toBe(path.join(testSessionsBase, suffix));
    });

    it('should succeed when directory already exists (recursive: true)', () => {
      const sessionId = SessionId.generate();

      // Create directory first time
      const workDir1 = sessionId.createWorkingDirectory();

      // Create same directory again - should not throw
      const workDir2 = sessionId.createWorkingDirectory();

      expect(workDir1).toBe(workDir2);
      expect(fs.existsSync(workDir1)).toBe(true);
    });

    it('should throw descriptive error when directory creation fails', () => {
      const sessionId = SessionId.generate();

      // Mock fs.mkdirSync to throw error
      const originalMkdirSync = fs.mkdirSync;
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => sessionId.createWorkingDirectory()).toThrow(
        /Failed to create working directory for session session_.*: Permission denied/
      );

      // Restore original
      fs.mkdirSync = originalMkdirSync;
    });

    it('should create directory at expected path based on config', () => {
      const sessionId = SessionId.generate();
      const workDir = sessionId.createWorkingDirectory();

      const suffix = sessionId.getSuffix();
      expect(workDir).toContain(testSessionsBase);
      expect(workDir).toContain(suffix);
    });
  });
});

describe('Session', () => {
  describe('fromSelectSession', () => {
    it('should initialize with all DB fields', () => {
      const dbSession: SelectSession = {
        id: 'session_01h455vb4pex5vsknk084sn02q',
        claudeCodeSessionId: 'sdk-session-123',
        title: 'Test Session',
        summary: 'A test session summary',
        model: 'claude-sonnet-4-5',
        databricksWorkspacePath: '/Workspace/Users/test@example.com/project',
        userId: 'user123',
        databricksWorkspaceAutoPush: true,
        isArchived: false,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-02T00:00:00Z'),
      };

      const session = Session.fromSelectSession(dbSession);

      // All properties should match DB session
      expect(session.id.toString()).toBe(dbSession.id);
      expect(session.claudeCodeSessionId).toBe(dbSession.claudeCodeSessionId);
      expect(session.title).toBe(dbSession.title);
      expect(session.summary).toBe(dbSession.summary);
      expect(session.model).toBe(dbSession.model);
      expect(session.databricksWorkspacePath).toBe(
        dbSession.databricksWorkspacePath
      );
      expect(session.userId).toBe(dbSession.userId);
      expect(session.databricksWorkspaceAutoPush).toBe(
        dbSession.databricksWorkspaceAutoPush
      );
      expect(session.isArchived).toBe(dbSession.isArchived);
      expect(session.createdAt).toEqual(dbSession.createdAt);
      expect(session.updatedAt).toEqual(dbSession.updatedAt);

      // cwd() should be computed from session ID suffix
      const suffix = session.id.getSuffix();
      expect(session.cwd()).toBe(path.join(testSessionsBase, suffix));
    });

    it('should handle null values correctly', () => {
      const dbSession: SelectSession = {
        id: 'session_01h455vb4pex5vsknk084sn02q',
        claudeCodeSessionId: 'sdk-123',
        title: null,
        summary: null,
        model: 'claude-sonnet-4-5',
        databricksWorkspacePath: null,
        userId: 'user123',
        databricksWorkspaceAutoPush: false,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const session = Session.fromSelectSession(dbSession);

      expect(session.title).toBeNull();
      expect(session.summary).toBeNull();
      expect(session.databricksWorkspacePath).toBeNull();
    });
  });

  describe('delegation methods', () => {
    it('should delegate path methods to SessionId', () => {
      const dbSession: SelectSession = {
        id: 'session_01h455vb4pex5vsknk084sn02q',
        claudeCodeSessionId: 'sdk-123',
        title: 'Test',
        summary: null,
        model: 'claude-sonnet-4-5',
        databricksWorkspacePath: null,
        userId: 'user123',
        databricksWorkspaceAutoPush: false,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const session = Session.fromSelectSession(dbSession);

      expect(session.getAppName()).toBe('app-01h455vb4pex5vsknk084sn02q');
      expect(session.getBranchName()).toBe(
        'claude/session_01h455vb4pex5vsknk084sn02q'
      );
      expect(session.cwd()).toBe(
        path.join(testSessionsBase, '01h455vb4pex5vsknk084sn02q')
      );
    });
  });
});
