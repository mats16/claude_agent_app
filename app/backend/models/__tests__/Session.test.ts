import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SelectSession } from '../../db/schema.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Test data
const testSessionsBase = path.join(os.tmpdir(), 'claude-test-sessions');
const testUsersBase = path.join(os.tmpdir(), 'claude-test-users');

// Import Session classes
const { SessionDraft, Session } = await import('../Session.js');

describe('SessionDraft', () => {
  describe('constructor', () => {
    it('should auto-generate TypeID with session prefix', () => {
      const draft = new SessionDraft({
        userId: 'user123',
        model: 'claude-sonnet-4-5',
        sessionsBase: testSessionsBase,
      });
      expect(draft.id).toMatch(/^session_[a-z0-9]{26}$/);
      expect(draft.toString()).toMatch(/^session_[a-z0-9]{26}$/);
    });

    it('should generate unique IDs for multiple instances', () => {
      const draft1 = new SessionDraft({
        userId: 'user123',
        model: 'claude-sonnet-4-5',
        sessionsBase: testSessionsBase,
      });
      const draft2 = new SessionDraft({
        userId: 'user123',
        model: 'claude-sonnet-4-5',
        sessionsBase: testSessionsBase,
      });
      expect(draft1.id).not.toBe(draft2.id);
      expect(draft1.toString()).not.toBe(draft2.toString());
    });

    it('should set claudeCodeSessionId to undefined', () => {
      const draft = new SessionDraft({
        userId: 'user123',
        model: 'claude-sonnet-4-5',
        sessionsBase: testSessionsBase,
      });
      expect(draft.claudeCodeSessionId).toBeUndefined();
    });

    it('should initialize with provided fields', () => {
      const draft = new SessionDraft({
        userId: 'user123',
        model: 'claude-sonnet-4-5',
        title: 'Test Draft',
        databricksWorkspacePath: '/Workspace/test',
        databricksWorkspaceAutoPush: true,
        sessionsBase: testSessionsBase,
      });

      expect(draft.userId).toBe('user123');
      expect(draft.model).toBe('claude-sonnet-4-5');
      expect(draft.title).toBe('Test Draft');
      expect(draft.databricksWorkspacePath).toBe('/Workspace/test');
      expect(draft.databricksWorkspaceAutoPush).toBe(true);
    });

    it('should set default values for optional fields', () => {
      const draft = new SessionDraft({
        userId: 'user123',
        model: 'claude-sonnet-4-5',
        sessionsBase: testSessionsBase,
      });

      expect(draft.title).toBeNull();
      expect(draft.databricksWorkspacePath).toBeNull();
      expect(draft.databricksWorkspaceAutoPush).toBe(false);
    });
  });

  describe('path methods', () => {
    it('should return correct cwd path', () => {
      const draft = new SessionDraft({
        userId: 'user123',
        model: 'claude-sonnet-4-5',
        sessionsBase: testSessionsBase,
      });
      const cwdPath = draft.cwd;
      expect(cwdPath).toContain(testSessionsBase);
      expect(cwdPath).toContain(draft.getIdSuffix());
    });

    it('should compute app name (30 chars max)', () => {
      const draft = new SessionDraft({
        userId: 'user123',
        model: 'claude-sonnet-4-5',
        sessionsBase: testSessionsBase,
      });
      const appName = draft.appName;
      expect(appName).toMatch(/^app-[a-z0-9]{26}$/);
      expect(appName.length).toBe(30);
    });

    it('should compute branch name', () => {
      const draft = new SessionDraft({
        userId: 'user123',
        model: 'claude-sonnet-4-5',
        sessionsBase: testSessionsBase,
      });
      const branchName = draft.branchName;
      expect(branchName).toMatch(/^claude\/session_[a-z0-9]{26}$/);
    });
  });

  describe('createWorkingDirectory', () => {
    beforeEach(() => {
      if (fs.existsSync(testSessionsBase)) {
        fs.rmSync(testSessionsBase, { recursive: true, force: true });
      }
    });

    afterEach(() => {
      if (fs.existsSync(testSessionsBase)) {
        fs.rmSync(testSessionsBase, { recursive: true, force: true });
      }
    });

    it('should create working directory successfully', () => {
      const draft = new SessionDraft({
        userId: 'user123',
        model: 'claude-sonnet-4-5',
        sessionsBase: testSessionsBase,
      });
      const workDir = draft.createWorkingDirectory();

      expect(fs.existsSync(workDir)).toBe(true);
      expect(fs.statSync(workDir).isDirectory()).toBe(true);
    });

    it('should create .claude subdirectory', () => {
      const draft = new SessionDraft({
        userId: 'user123',
        model: 'claude-sonnet-4-5',
        sessionsBase: testSessionsBase,
      });
      const workDir = draft.createWorkingDirectory();
      const claudeDir = path.join(workDir, '.claude');

      expect(fs.existsSync(claudeDir)).toBe(true);
      expect(fs.statSync(claudeDir).isDirectory()).toBe(true);
    });

    it('should return the created directory path', () => {
      const draft = new SessionDraft({
        userId: 'user123',
        model: 'claude-sonnet-4-5',
        sessionsBase: testSessionsBase,
      });
      const workDir = draft.createWorkingDirectory();

      const suffix = draft.getIdSuffix();
      expect(workDir).toBe(path.join(testSessionsBase, suffix));
    });
  });

  describe('type guards', () => {
    it('should return true for isDraft()', () => {
      const draft = new SessionDraft({
        userId: 'user123',
        model: 'claude-sonnet-4-5',
        sessionsBase: testSessionsBase,
      });
      expect(draft.isDraft()).toBe(true);
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

      const session = Session.fromSelectSession(dbSession, testSessionsBase);

      // All properties should match DB session
      expect(session.id).toBe(dbSession.id);
      expect(session.toString()).toBe(dbSession.id);
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
      const suffix = session.getIdSuffix();
      expect(session.cwd).toBe(path.join(testSessionsBase, suffix));
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

      const session = Session.fromSelectSession(dbSession, testSessionsBase);

      expect(session.title).toBeNull();
      expect(session.summary).toBeNull();
      expect(session.databricksWorkspacePath).toBeNull();
    });

    it('should validate TypeID prefix', () => {
      const invalidSession: SelectSession = {
        id: 'user_01h455vb4pex5vsknk084sn02q', // Wrong prefix
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

      expect(() => Session.fromSelectSession(invalidSession, testSessionsBase)).toThrow(
        "Invalid session ID type: expected 'session', got 'user'"
      );
    });
  });

  describe('fromSessionDraft', () => {
    it('should convert draft to session with SDK session ID', () => {
      const draft = new SessionDraft({
        userId: 'user123',
        model: 'claude-sonnet-4-5',
        title: 'Test Draft',
        databricksWorkspacePath: '/Workspace/test',
        databricksWorkspaceAutoPush: true,
        sessionsBase: testSessionsBase,
      });

      const session = Session.fromSessionDraft(draft, 'sdk-session-456', testSessionsBase);

      // TypeID should be preserved
      expect(session.id).toBe(draft.id);
      expect(session.toString()).toBe(draft.toString());
      expect(session.getIdSuffix()).toBe(draft.getIdSuffix());

      // SDK session ID should be set
      expect(session.claudeCodeSessionId).toBe('sdk-session-456');

      // Fields from draft should be preserved
      expect(session.userId).toBe(draft.userId);
      expect(session.model).toBe(draft.model);
      expect(session.title).toBe(draft.title);
      expect(session.databricksWorkspacePath).toBe(
        draft.databricksWorkspacePath
      );
      expect(session.databricksWorkspaceAutoPush).toBe(
        draft.databricksWorkspaceAutoPush
      );

      // New session fields should have default values
      expect(session.summary).toBeNull();
      expect(session.isArchived).toBe(false);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.updatedAt).toBeInstanceOf(Date);
    });

    it('should preserve working directory path', () => {
      const draft = new SessionDraft({
        userId: 'user123',
        model: 'claude-sonnet-4-5',
        sessionsBase: testSessionsBase,
      });

      const draftCwd = draft.cwd;
      const session = Session.fromSessionDraft(draft, 'sdk-123', testSessionsBase);

      expect(session.cwd).toBe(draftCwd);
    });
  });

  describe('path methods', () => {
    it('should return correct paths', () => {
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

      const session = Session.fromSelectSession(dbSession, testSessionsBase);

      expect(session.appName).toBe('app-01h455vb4pex5vsknk084sn02q');
      expect(session.branchName).toBe(
        'claude/session_01h455vb4pex5vsknk084sn02q'
      );
      expect(session.cwd).toBe(
        path.join(testSessionsBase, '01h455vb4pex5vsknk084sn02q')
      );
    });
  });

  describe('type guards', () => {
    it('should return false for isDraft()', () => {
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

      const session = Session.fromSelectSession(dbSession, testSessionsBase);

      expect(session.isDraft()).toBe(false);
    });
  });
});
