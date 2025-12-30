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
const { SessionDraft, Session } = await import('../Session.js');

describe('SessionDraft', () => {
  describe('constructor', () => {
    it('should generate TypeID with session prefix', () => {
      const draft = new SessionDraft();
      expect(draft.id).toMatch(/^session_[a-z0-9]{26}$/);
    });

    it('should generate unique IDs for multiple instances', () => {
      const draft1 = new SessionDraft();
      const draft2 = new SessionDraft();
      expect(draft1.id).not.toBe(draft2.id);
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
      const draft = new SessionDraft();
      const workDir = draft.createWorkingDirectory();

      expect(fs.existsSync(workDir)).toBe(true);
      expect(fs.statSync(workDir).isDirectory()).toBe(true);
    });

    it('should create .claude subdirectory', () => {
      const draft = new SessionDraft();
      const workDir = draft.createWorkingDirectory();
      const claudeDir = path.join(workDir, '.claude');

      expect(fs.existsSync(claudeDir)).toBe(true);
      expect(fs.statSync(claudeDir).isDirectory()).toBe(true);
    });

    it('should return the created directory path', () => {
      const draft = new SessionDraft();
      const workDir = draft.createWorkingDirectory();

      // Extract suffix from draft.id (remove 'session_' prefix)
      const suffix = draft.id.replace(/^session_/, '');
      expect(workDir).toBe(path.join(testSessionsBase, suffix));
    });

    it('should succeed when directory already exists (recursive: true)', () => {
      const draft = new SessionDraft();

      // Create directory first time
      const workDir1 = draft.createWorkingDirectory();

      // Create same directory again - should not throw
      const workDir2 = draft.createWorkingDirectory();

      expect(workDir1).toBe(workDir2);
      expect(fs.existsSync(workDir1)).toBe(true);
    });

    it('should throw descriptive error when directory creation fails', () => {
      const draft = new SessionDraft();

      // Mock fs.mkdirSync to throw error
      const originalMkdirSync = fs.mkdirSync;
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => draft.createWorkingDirectory()).toThrow(
        /Failed to create working directory for session session_.*: Permission denied/
      );

      // Restore original
      fs.mkdirSync = originalMkdirSync;
    });

    it('should create directory at expected path based on config', () => {
      const draft = new SessionDraft();
      const workDir = draft.createWorkingDirectory();

      const suffix = draft.id.replace(/^session_/, '');
      expect(workDir).toContain(testSessionsBase);
      expect(workDir).toContain(suffix);
    });
  });
});

describe('Session', () => {
  describe('constructor', () => {
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

      const session = new Session(dbSession);

      // All properties should match DB session
      expect(session.id).toBe(dbSession.id);
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
      const suffix = dbSession.id.replace(/^session_/, '');
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

      const session = new Session(dbSession);

      expect(session.title).toBeNull();
      expect(session.summary).toBeNull();
      expect(session.databricksWorkspacePath).toBeNull();
    });

    it('should provide helper methods', () => {
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

      const session = new Session(dbSession);

      expect(session.getAppName()).toBe('app-01h455vb4pex5vsknk084sn02q');
      expect(session.getBranchName()).toBe(
        'claude/session_01h455vb4pex5vsknk084sn02q'
      );
    });
  });
});
