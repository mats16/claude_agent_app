import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { Session, SessionDraft, type SessionData } from '../Session.js';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
  },
}));

// Mock config paths
vi.mock('../../config/index.js', () => ({
  paths: {
    sessionsBase: '/home/test/ws',
  },
}));

// Helper to create mock SessionData
function createMockSessionData(
  overrides: Partial<SessionData> = {}
): SessionData {
  return {
    id: 'session_01h455vb4pex5vsknk084sn02q',
    claudeCodeSessionId: 'claude-session-123',
    title: 'Test Session',
    summary: null,
    model: 'databricks-claude-sonnet-4-5',
    databricksWorkspacePath: '/Workspace/Users/test@example.com/project',
    userId: 'user-123',
    databricksWorkspaceAutoPush: false,
    isArchived: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('SessionDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should generate new TypeID', () => {
      const draft = new SessionDraft();

      expect(draft.id).toMatch(/^session_[0-9a-z]{26}$/);
    });
  });

  describe('id getter', () => {
    it('should return full TypeID string', () => {
      const draft = new SessionDraft();

      expect(draft.id).toMatch(/^session_[0-9a-z]{26}$/);
      expect(draft.id.startsWith('session_')).toBe(true);
    });
  });

  describe('suffix getter', () => {
    it('should return UUIDv7 Base32 without prefix', () => {
      const draft = new SessionDraft();

      expect(draft.suffix).toHaveLength(26);
      expect(draft.id).toBe(`session_${draft.suffix}`);
    });
  });

  describe('shortSuffix getter', () => {
    it('should return last 12 characters of suffix', () => {
      const draft = new SessionDraft();

      expect(draft.shortSuffix).toHaveLength(12);
      expect(draft.suffix.endsWith(draft.shortSuffix)).toBe(true);
    });
  });

  describe('localPath getter', () => {
    it('should use sessionsBase from config', () => {
      const draft = new SessionDraft();

      expect(draft.localPath.startsWith('/home/test/ws/')).toBe(true);
      expect(draft.localPath).toMatch(/\/home\/test\/ws\/[0-9a-z]{12}$/);
    });
  });

  describe('appName getter', () => {
    it('should return dev-{suffix} format', () => {
      const draft = new SessionDraft();

      expect(draft.appName).toMatch(/^dev-[0-9a-z]{26}$/);
    });

    it('should have max length of 30 characters', () => {
      const draft = new SessionDraft();

      // dev- (4 chars) + suffix (26 chars) = 30 chars
      expect(draft.appName.length).toBe(30);
    });
  });

  describe('gitBranch getter', () => {
    it('should return claude/session-{shortSuffix} format', () => {
      const draft = new SessionDraft();

      expect(draft.gitBranch).toMatch(/^claude\/session-[0-9a-z]{12}$/);
    });
  });

  describe('ensureLocalDir', () => {
    it('should create directory with recursive option', () => {
      const draft = new SessionDraft();

      draft.ensureLocalDir();

      expect(fs.mkdirSync).toHaveBeenCalledWith(draft.localPath, {
        recursive: true,
      });
    });
  });
});

describe('Session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should require SessionData', () => {
      const data = createMockSessionData();
      const session = new Session(data);

      expect(session.id).toBe(data.id);
      expect(session.claudeCodeSessionId).toBe(data.claudeCodeSessionId);
      expect(session.title).toBe(data.title);
      expect(session.model).toBe(data.model);
      expect(session.databricksWorkspacePath).toBe(data.databricksWorkspacePath);
      expect(session.userId).toBe(data.userId);
      expect(session.databricksWorkspaceAutoPush).toBe(
        data.databricksWorkspaceAutoPush
      );
      expect(session.isArchived).toBe(data.isArchived);
    });

    it('should throw error for invalid TypeID format', () => {
      const data = createMockSessionData({ id: 'invalid-id' });
      expect(() => new Session(data)).toThrow();
    });

    it('should throw error for wrong TypeID prefix', () => {
      const data = createMockSessionData({
        id: 'user_01h455vb4pex5vsknk084sn02q',
      });
      expect(() => new Session(data)).toThrow(
        "Invalid session ID prefix: expected 'session', got 'user'"
      );
    });
  });

  describe('id getter', () => {
    it('should return full TypeID string', () => {
      const data = createMockSessionData();
      const session = new Session(data);

      expect(session.id).toBe(data.id);
    });
  });

  describe('suffix getter', () => {
    it('should return UUIDv7 Base32 without prefix', () => {
      const data = createMockSessionData();
      const session = new Session(data);

      expect(session.suffix).toBe('01h455vb4pex5vsknk084sn02q');
    });
  });

  describe('shortSuffix getter', () => {
    it('should return last 12 characters of suffix', () => {
      const data = createMockSessionData();
      const session = new Session(data);

      // suffix: 01h455vb4pex5vsknk084sn02q (26 chars)
      // slice(-12): sknk084sn02q (12 chars)
      expect(session.shortSuffix).toBe('sknk084sn02q');
    });

    it('should have 12 character length', () => {
      const data = createMockSessionData();
      const session = new Session(data);

      expect(session.shortSuffix).toHaveLength(12);
    });
  });

  describe('localPath getter', () => {
    it('should return path with shortSuffix', () => {
      const data = createMockSessionData();
      const session = new Session(data);

      expect(session.localPath).toBe('/home/test/ws/sknk084sn02q');
    });
  });

  describe('appName getter', () => {
    it('should return dev-{suffix} format', () => {
      const data = createMockSessionData();
      const session = new Session(data);

      expect(session.appName).toBe('dev-01h455vb4pex5vsknk084sn02q');
    });

    it('should have max length of 30 characters', () => {
      const data = createMockSessionData();
      const session = new Session(data);

      // dev- (4 chars) + suffix (26 chars) = 30 chars
      expect(session.appName.length).toBe(30);
    });
  });

  describe('gitBranch getter', () => {
    it('should return claude/session-{shortSuffix} format', () => {
      const data = createMockSessionData();
      const session = new Session(data);

      expect(session.gitBranch).toBe('claude/session-sknk084sn02q');
    });
  });

  describe('DB fields', () => {
    it('should store all DB fields', () => {
      const data = createMockSessionData({
        title: 'My Session',
        summary: 'Session summary',
        databricksWorkspacePath: '/Workspace/test',
        databricksWorkspaceAutoPush: true,
        isArchived: true,
      });
      const session = new Session(data);

      expect(session.title).toBe('My Session');
      expect(session.summary).toBe('Session summary');
      expect(session.databricksWorkspacePath).toBe('/Workspace/test');
      expect(session.databricksWorkspaceAutoPush).toBe(true);
      expect(session.isArchived).toBe(true);
      expect(session.createdAt).toEqual(data.createdAt);
      expect(session.updatedAt).toEqual(data.updatedAt);
    });

    it('should handle null fields', () => {
      const data = createMockSessionData({
        title: null,
        summary: null,
        databricksWorkspacePath: null,
      });
      const session = new Session(data);

      expect(session.title).toBeNull();
      expect(session.summary).toBeNull();
      expect(session.databricksWorkspacePath).toBeNull();
    });
  });

  describe('ensureLocalDir', () => {
    it('should create directory with recursive option', () => {
      const data = createMockSessionData();
      const session = new Session(data);

      session.ensureLocalDir();

      expect(fs.mkdirSync).toHaveBeenCalledWith('/home/test/ws/sknk084sn02q', {
        recursive: true,
      });
    });
  });

  describe('fromData static method', () => {
    it('should create Session from SessionData', () => {
      const data = createMockSessionData();
      const session = Session.fromData(data);

      expect(session.id).toBe(data.id);
      expect(session.claudeCodeSessionId).toBe(data.claudeCodeSessionId);
      expect(session.title).toBe(data.title);
    });

    it('should throw error for invalid data', () => {
      const data = createMockSessionData({ id: 'invalid' });
      expect(() => Session.fromData(data)).toThrow();
    });
  });

  describe('isValidId static method', () => {
    it('should return true for valid session TypeID', () => {
      const validId = 'session_01h455vb4pex5vsknk084sn02q';

      expect(Session.isValidId(validId)).toBe(true);
    });

    it('should return false for invalid format', () => {
      expect(Session.isValidId('invalid-id')).toBe(false);
    });

    it('should return false for wrong prefix', () => {
      expect(Session.isValidId('user_01h455vb4pex5vsknk084sn02q')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(Session.isValidId('')).toBe(false);
    });

    it('should return false for UUID format (not TypeID)', () => {
      expect(Session.isValidId('550e8400-e29b-41d4-a716-446655440000')).toBe(
        false
      );
    });
  });
});

describe('SessionDraft to Session flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should support draft → session creation flow', () => {
    // Create draft
    const draft = new SessionDraft();
    draft.ensureLocalDir();

    // Simulate SDK init returning claudeCodeSessionId and DB save
    const sessionData: SessionData = {
      id: draft.id,
      claudeCodeSessionId: 'claude-session-abc123',
      title: null,
      summary: null,
      model: 'databricks-claude-sonnet-4-5',
      databricksWorkspacePath: null,
      userId: 'user-123',
      databricksWorkspaceAutoPush: false,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Create session from data
    const session = Session.fromData(sessionData);

    // Verify same ID
    expect(session.id).toBe(draft.id);
    expect(session.suffix).toBe(draft.suffix);
    expect(session.shortSuffix).toBe(draft.shortSuffix);
    expect(session.localPath).toBe(draft.localPath);
    expect(session.appName).toBe(draft.appName);
    expect(session.gitBranch).toBe(draft.gitBranch);

    // Session has claudeCodeSessionId
    expect(session.claudeCodeSessionId).toBe('claude-session-abc123');
  });

  it('should generate unique IDs for multiple drafts', () => {
    const draft1 = new SessionDraft();
    const draft2 = new SessionDraft();
    const draft3 = new SessionDraft();

    const ids = [draft1.id, draft2.id, draft3.id];
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(3);
  });

  it('should be sortable by creation time (TypeID property)', () => {
    // TypeID uses UUIDv7 which is time-ordered
    const draft1 = new SessionDraft();
    const draft2 = new SessionDraft();
    const draft3 = new SessionDraft();

    const ids = [draft3.id, draft1.id, draft2.id];
    const sortedIds = [...ids].sort();

    // Sessions created in order should sort in creation order
    expect(sortedIds).toEqual([draft1.id, draft2.id, draft3.id]);
  });

  it('should have consistent suffix extraction', () => {
    const data = createMockSessionData();
    const session = new Session(data);

    // Verify suffix relationships
    expect(session.id).toBe(`session_${session.suffix}`);
    expect(session.suffix.endsWith(session.shortSuffix)).toBe(true);
    expect(session.shortSuffix).toHaveLength(12);
  });
});
