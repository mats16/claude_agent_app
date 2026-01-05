import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import type { User } from '../models/User.js';
import { RequestUser } from '../models/RequestUser.js';
import {
  getLocalHomeDir,
  getLocalClaudeConfigDir,
  getLocalSkillsPath,
  getLocalAgentsPath,
  getRemoteHomeDir,
  getRemoteClaudeConfigDir,
  getRemoteSkillsPath,
  getRemoteAgentsPath,
  ensureUserLocalDirectories,
} from './userPaths.js';

describe('userPaths', () => {
  const testUser: User = {
    id: 'user123',
    name: 'Test User',
    email: 'test@example.com',
  };

  const home = '/home/app';
  const userDirBase = 'users';

  describe('getLocalHomeDir', () => {
    it('should return correct local home directory', () => {
      const result = getLocalHomeDir(testUser, home, userDirBase);
      expect(result).toBe('/home/app/users/test');
    });

    it('should extract username from email correctly', () => {
      const user: User = {
        ...testUser,
        email: 'john.doe@example.com',
      };
      const result = getLocalHomeDir(user, home, userDirBase);
      expect(result).toBe('/home/app/users/john.doe');
    });

    it('should handle email with plus addressing', () => {
      const user: User = {
        ...testUser,
        email: 'user+tag@example.com',
      };
      const result = getLocalHomeDir(user, home, userDirBase);
      expect(result).toBe('/home/app/users/user+tag');
    });
  });

  describe('getLocalClaudeConfigDir', () => {
    it('should return correct Claude config directory', () => {
      const result = getLocalClaudeConfigDir(testUser, home, userDirBase);
      expect(result).toBe('/home/app/users/test/.claude');
    });
  });

  describe('getLocalSkillsPath', () => {
    it('should return correct skills directory', () => {
      const result = getLocalSkillsPath(testUser, home, userDirBase);
      expect(result).toBe('/home/app/users/test/.claude/skills');
    });
  });

  describe('getLocalAgentsPath', () => {
    it('should return correct agents directory', () => {
      const result = getLocalAgentsPath(testUser, home, userDirBase);
      expect(result).toBe('/home/app/users/test/.claude/agents');
    });
  });

  describe('getRemoteHomeDir', () => {
    it('should return correct remote home directory', () => {
      const result = getRemoteHomeDir(testUser);
      expect(result).toBe('/Workspace/Users/test@example.com');
    });
  });

  describe('getRemoteClaudeConfigDir', () => {
    it('should return correct remote Claude config directory', () => {
      const result = getRemoteClaudeConfigDir(testUser);
      expect(result).toBe('/Workspace/Users/test@example.com/.claude');
    });
  });

  describe('getRemoteSkillsPath', () => {
    it('should return correct remote skills directory', () => {
      const result = getRemoteSkillsPath(testUser);
      expect(result).toBe('/Workspace/Users/test@example.com/.claude/skills');
    });
  });

  describe('getRemoteAgentsPath', () => {
    it('should return correct remote agents directory', () => {
      const result = getRemoteAgentsPath(testUser);
      expect(result).toBe('/Workspace/Users/test@example.com/.claude/agents');
    });
  });

  describe('ensureUserLocalDirectories', () => {
    let tempDir: string;

    beforeEach(() => {
      // Create temporary directory for testing
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'userPaths-test-'));
    });

    afterEach(() => {
      // Clean up temporary directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should create skills and agents directories', () => {
      ensureUserLocalDirectories(testUser, tempDir, userDirBase);

      const skillsPath = getLocalSkillsPath(testUser, tempDir, userDirBase);
      const agentsPath = getLocalAgentsPath(testUser, tempDir, userDirBase);

      expect(fs.existsSync(skillsPath)).toBe(true);
      expect(fs.existsSync(agentsPath)).toBe(true);
      expect(fs.statSync(skillsPath).isDirectory()).toBe(true);
      expect(fs.statSync(agentsPath).isDirectory()).toBe(true);
    });

    it('should not fail if directories already exist', () => {
      // Create directories first time
      ensureUserLocalDirectories(testUser, tempDir, userDirBase);

      // Should not throw when called again
      expect(() => {
        ensureUserLocalDirectories(testUser, tempDir, userDirBase);
      }).not.toThrow();
    });
  });

  describe('Migration validation: compare with RequestUser', () => {
    const headers = {
      'x-forwarded-user': 'user123',
      'x-forwarded-email': 'test@example.com',
      'x-forwarded-preferred-username': 'Test User',
      'x-forwarded-access-token': 'token123',
    };
    const usersBase = '/home/app/users';

    it('should produce same local home directory as RequestUser', () => {
      const requestUser = RequestUser.fromHeaders(headers, usersBase);
      const newLocalHome = getLocalHomeDir(testUser, '/home/app', 'users');

      expect(newLocalHome).toBe(requestUser.local.homeDir);
    });

    it('should produce same local Claude config directory as RequestUser', () => {
      const requestUser = RequestUser.fromHeaders(headers, usersBase);
      const newLocalClaudeConfig = getLocalClaudeConfigDir(testUser, '/home/app', 'users');

      expect(newLocalClaudeConfig).toBe(requestUser.local.claudeConfigDir);
    });

    it('should produce same local skills path as RequestUser', () => {
      const requestUser = RequestUser.fromHeaders(headers, usersBase);
      const newSkillsPath = getLocalSkillsPath(testUser, '/home/app', 'users');

      expect(newSkillsPath).toBe(requestUser.skillsPath);
    });

    it('should produce same local agents path as RequestUser', () => {
      const requestUser = RequestUser.fromHeaders(headers, usersBase);
      const newAgentsPath = getLocalAgentsPath(testUser, '/home/app', 'users');

      expect(newAgentsPath).toBe(requestUser.agentsPath);
    });

    it('should produce same remote home directory as RequestUser', () => {
      const requestUser = RequestUser.fromHeaders(headers, usersBase);
      const newRemoteHome = getRemoteHomeDir(testUser);

      expect(newRemoteHome).toBe(requestUser.remote.homeDir);
    });

    it('should produce same remote Claude config directory as RequestUser', () => {
      const requestUser = RequestUser.fromHeaders(headers, usersBase);
      const newRemoteClaudeConfig = getRemoteClaudeConfigDir(testUser);

      expect(newRemoteClaudeConfig).toBe(requestUser.remote.claudeConfigDir);
    });

    it('should produce same remote skills path as RequestUser', () => {
      const requestUser = RequestUser.fromHeaders(headers, usersBase);
      const newRemoteSkillsPath = getRemoteSkillsPath(testUser);

      expect(newRemoteSkillsPath).toBe(requestUser.remoteSkillsPath);
    });

    it('should produce same remote agents path as RequestUser', () => {
      const requestUser = RequestUser.fromHeaders(headers, usersBase);
      const newRemoteAgentsPath = getRemoteAgentsPath(testUser);

      expect(newRemoteAgentsPath).toBe(requestUser.remoteAgentsPath);
    });
  });
});
