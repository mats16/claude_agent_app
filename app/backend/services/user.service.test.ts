import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ensureUserWithDefaults,
  ensureUser,
  checkWorkspacePermission,
  getUserInfo,
  hasDatabricksPat,
  getUserPersonalAccessToken,
  setDatabricksPat,
  clearDatabricksPat,
} from './user.service.js';
import type { RequestUser } from '../models/RequestUser.js';
import type { SelectUser } from '../db/schema.js';
import * as usersRepo from '../db/users.js';
import * as oauthTokensRepo from '../db/oauthTokens.js';
import * as authUtil from '../utils/auth.js';
import * as encryptionUtil from '../utils/encryption.js';
import { databricks } from '../config/index.js';

// Mock database to avoid DATABASE_URL requirement
vi.mock('../db/index.js', () => ({
  db: {},
}));

// Mock dependencies
vi.mock('../db/users.js');
vi.mock('../db/oauthTokens.js');
vi.mock('../utils/auth.js');
vi.mock('../utils/encryption.js');
vi.mock('../config/index.js', () => ({
  databricks: {
    hostUrl: 'https://test.databricks.com',
    host: 'test.databricks.com',
    appName: 'claude-agent-test',
  },
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('user.service', () => {
  const mockUserId = 'user-123';
  const mockEmail = 'test@example.com';
  const mockPat = 'dapi1234567890abcdef';

  const mockRequestUser: RequestUser = {
    sub: mockUserId,
    email: mockEmail,
    remote: {
      homeDir: '/Workspace/Users/test@example.com',
      claudeConfigDir: '/Workspace/Users/test@example.com/.claude',
    },
  } as RequestUser;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ensureUserWithDefaults', () => {
    it('should return existing user when user exists with same email', async () => {
      // Arrange
      const existingUser: SelectUser = {
        id: mockUserId,
        email: mockEmail,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
      };

      vi.mocked(usersRepo.getUserById).mockResolvedValue(existingUser);

      // Act
      const result = await ensureUserWithDefaults(mockUserId, mockEmail);

      // Assert
      expect(result).toEqual(existingUser);
      expect(usersRepo.getUserById).toHaveBeenCalledWith(mockUserId);
      expect(usersRepo.updateUserEmail).not.toHaveBeenCalled();
      expect(usersRepo.createUserWithDefaultSettings).not.toHaveBeenCalled();
    });

    it('should update email when user exists with different email', async () => {
      // Arrange
      const oldEmail = 'old@example.com';
      const newEmail = 'new@example.com';

      const existingUser: SelectUser = {
        id: mockUserId,
        email: oldEmail,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
      };

      vi.mocked(usersRepo.getUserById).mockResolvedValue(existingUser);
      vi.mocked(usersRepo.updateUserEmail).mockResolvedValue(undefined);

      // Act
      const result = await ensureUserWithDefaults(mockUserId, newEmail);

      // Assert
      expect(result.email).toBe(newEmail);
      expect(usersRepo.updateUserEmail).toHaveBeenCalledWith(mockUserId, newEmail);
      expect(usersRepo.createUserWithDefaultSettings).not.toHaveBeenCalled();
    });

    it('should create new user with default settings when user does not exist', async () => {
      // Arrange
      const newUser: SelectUser = {
        id: mockUserId,
        email: mockEmail,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
      };

      vi.mocked(usersRepo.getUserById).mockResolvedValue(null);
      vi.mocked(usersRepo.createUserWithDefaultSettings).mockResolvedValue(newUser);

      // Act
      const result = await ensureUserWithDefaults(mockUserId, mockEmail);

      // Assert
      expect(result).toEqual(newUser);
      expect(usersRepo.createUserWithDefaultSettings).toHaveBeenCalledWith(
        mockUserId,
        mockEmail,
        { claudeConfigAutoPush: true }
      );
    });

    it('should propagate transaction errors from createUserWithDefaultSettings', async () => {
      // Arrange
      vi.mocked(usersRepo.getUserById).mockResolvedValue(null);

      const transactionError = new Error('Transaction failed');
      vi.mocked(usersRepo.createUserWithDefaultSettings).mockRejectedValue(transactionError);

      // Act & Assert
      await expect(
        ensureUserWithDefaults(mockUserId, mockEmail)
      ).rejects.toThrow('Transaction failed');
    });
  });

  describe('ensureUser', () => {
    it('should call ensureUserWithDefaults with user info', async () => {
      // Arrange
      const mockUser: SelectUser = {
        id: mockUserId,
        email: mockEmail,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(usersRepo.getUserById).mockResolvedValue(mockUser);

      // Act
      await ensureUser(mockRequestUser);

      // Assert
      expect(usersRepo.getUserById).toHaveBeenCalledWith(mockUserId);
    });
  });

  describe('checkWorkspacePermission', () => {
    it('should return true when workspace directory creation succeeds', async () => {
      // Arrange
      vi.mocked(authUtil.getAccessToken).mockResolvedValue('mock-token');

      mockFetch.mockResolvedValue({
        json: async () => ({}),
      });

      // Act
      const result = await checkWorkspacePermission(mockRequestUser);

      // Assert
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.databricks.com/api/2.0/workspace/mkdirs',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer mock-token',
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should return false when workspace directory creation fails with error_code', async () => {
      // Arrange
      vi.mocked(authUtil.getAccessToken).mockResolvedValue('mock-token');

      mockFetch.mockResolvedValue({
        json: async () => ({
          error_code: 'PERMISSION_DENIED',
          message: 'User does not have permission',
        }),
      });

      // Act
      const result = await checkWorkspacePermission(mockRequestUser);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when API call throws error', async () => {
      // Arrange
      vi.mocked(authUtil.getAccessToken).mockResolvedValue('mock-token');

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Act
      const result = await checkWorkspacePermission(mockRequestUser);

      // Assert
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getUserInfo', () => {
    it('should return complete user info when all checks pass', async () => {
      // Arrange
      const mockUser: SelectUser = {
        id: mockUserId,
        email: mockEmail,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(usersRepo.getUserById).mockResolvedValue(mockUser);
      vi.mocked(authUtil.getAccessToken).mockResolvedValue('mock-token');

      mockFetch.mockResolvedValue({
        json: async () => ({}),
      });

      // Act
      const result = await getUserInfo(mockRequestUser);

      // Assert
      expect(result).toEqual({
        userId: mockUserId,
        email: mockEmail,
        workspaceHome: '/Workspace/Users/test@example.com',
        hasWorkspacePermission: true,
        databricksAppUrl: 'https://test.databricks.com/apps/claude-agent-test',
      });
    });

    it('should return null databricksAppUrl when config not set', async () => {
      // Arrange
      const mockUser: SelectUser = {
        id: mockUserId,
        email: mockEmail,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(usersRepo.getUserById).mockResolvedValue(mockUser);
      vi.mocked(authUtil.getAccessToken).mockResolvedValue('mock-token');

      mockFetch.mockResolvedValue({
        json: async () => ({}),
      });

      // Temporarily override config
      const originalAppName = databricks.appName;
      (databricks as any).appName = null;

      // Act
      const result = await getUserInfo(mockRequestUser);

      // Assert
      expect(result.databricksAppUrl).toBe(null);

      // Restore
      (databricks as any).appName = originalAppName;
    });

    it('should return hasWorkspacePermission false when permission check fails', async () => {
      // Arrange
      const mockUser: SelectUser = {
        id: mockUserId,
        email: mockEmail,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(usersRepo.getUserById).mockResolvedValue(mockUser);
      vi.mocked(authUtil.getAccessToken).mockResolvedValue('mock-token');

      mockFetch.mockResolvedValue({
        json: async () => ({
          error_code: 'PERMISSION_DENIED',
        }),
      });

      // Act
      const result = await getUserInfo(mockRequestUser);

      // Assert
      expect(result.hasWorkspacePermission).toBe(false);
    });
  });

  describe('hasDatabricksPat', () => {
    it('should return false when encryption not available', async () => {
      // Arrange
      vi.mocked(encryptionUtil.isEncryptionAvailable).mockReturnValue(false);

      // Act
      const result = await hasDatabricksPat(mockUserId);

      // Assert
      expect(result).toBe(false);
      expect(oauthTokensRepo.hasDatabricksPat).not.toHaveBeenCalled();
    });

    it('should return true when encryption available and PAT exists', async () => {
      // Arrange
      vi.mocked(encryptionUtil.isEncryptionAvailable).mockReturnValue(true);
      vi.mocked(oauthTokensRepo.hasDatabricksPat).mockResolvedValue(true);

      // Act
      const result = await hasDatabricksPat(mockUserId);

      // Assert
      expect(result).toBe(true);
      expect(oauthTokensRepo.hasDatabricksPat).toHaveBeenCalledWith(mockUserId);
    });

    it('should return false when encryption available but PAT does not exist', async () => {
      // Arrange
      vi.mocked(encryptionUtil.isEncryptionAvailable).mockReturnValue(true);
      vi.mocked(oauthTokensRepo.hasDatabricksPat).mockResolvedValue(false);

      // Act
      const result = await hasDatabricksPat(mockUserId);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getUserPersonalAccessToken', () => {
    it('should return undefined when encryption not available', async () => {
      // Arrange
      vi.mocked(encryptionUtil.isEncryptionAvailable).mockReturnValue(false);

      // Act
      const result = await getUserPersonalAccessToken(mockUserId);

      // Assert
      expect(result).toBe(undefined);
      expect(oauthTokensRepo.getDatabricksPat).not.toHaveBeenCalled();
    });

    it('should return PAT when encryption available and PAT exists', async () => {
      // Arrange
      vi.mocked(encryptionUtil.isEncryptionAvailable).mockReturnValue(true);
      vi.mocked(oauthTokensRepo.getDatabricksPat).mockResolvedValue(mockPat);

      // Act
      const result = await getUserPersonalAccessToken(mockUserId);

      // Assert
      expect(result).toBe(mockPat);
      expect(oauthTokensRepo.getDatabricksPat).toHaveBeenCalledWith(mockUserId);
    });

    it('should return undefined when PAT is null', async () => {
      // Arrange
      vi.mocked(encryptionUtil.isEncryptionAvailable).mockReturnValue(true);
      vi.mocked(oauthTokensRepo.getDatabricksPat).mockResolvedValue(null);

      // Act
      const result = await getUserPersonalAccessToken(mockUserId);

      // Assert
      expect(result).toBe(undefined);
    });

    it('should handle decryption errors gracefully and return undefined', async () => {
      // Arrange
      vi.mocked(encryptionUtil.isEncryptionAvailable).mockReturnValue(true);
      vi.mocked(oauthTokensRepo.getDatabricksPat).mockRejectedValue(
        new Error('Decryption failed - key mismatch')
      );

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Act
      const result = await getUserPersonalAccessToken(mockUserId);

      // Assert
      expect(result).toBe(undefined);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PAT] Failed to decrypt PAT'),
        'Decryption failed - key mismatch'
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('setDatabricksPat', () => {
    it('should throw error when encryption not available', async () => {
      // Arrange
      vi.mocked(encryptionUtil.isEncryptionAvailable).mockReturnValue(false);

      // Act & Assert
      await expect(
        setDatabricksPat(mockRequestUser, mockPat)
      ).rejects.toThrow('Encryption not available. Cannot store PAT.');

      expect(oauthTokensRepo.setDatabricksPat).not.toHaveBeenCalled();
    });

    it('should store PAT with expiry when token info is available', async () => {
      // Arrange
      vi.mocked(encryptionUtil.isEncryptionAvailable).mockReturnValue(true);

      const mockUser: SelectUser = {
        id: mockUserId,
        email: mockEmail,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(usersRepo.getUserById).mockResolvedValue(mockUser);

      const expiryTime = new Date('2026-01-01T00:00:00Z').getTime();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          token_infos: [
            {
              token_id: 'token-123',
              creation_time: Date.now(),
              expiry_time: expiryTime,
              comment: 'Test token',
            },
          ],
        }),
      });

      vi.mocked(oauthTokensRepo.setDatabricksPat).mockResolvedValue(undefined);

      // Act
      const result = await setDatabricksPat(mockRequestUser, mockPat);

      // Assert
      expect(result.expiresAt).toEqual(new Date(expiryTime));
      expect(result.comment).toBe('Test token');
      expect(oauthTokensRepo.setDatabricksPat).toHaveBeenCalledWith(
        mockUserId,
        mockPat,
        new Date(expiryTime)
      );
    });

    it('should store PAT with null expiry when token has no expiry (-1)', async () => {
      // Arrange
      vi.mocked(encryptionUtil.isEncryptionAvailable).mockReturnValue(true);

      const mockUser: SelectUser = {
        id: mockUserId,
        email: mockEmail,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(usersRepo.getUserById).mockResolvedValue(mockUser);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          token_infos: [
            {
              token_id: 'token-123',
              creation_time: Date.now(),
              expiry_time: -1, // No expiry
              comment: 'Permanent token',
            },
          ],
        }),
      });

      vi.mocked(oauthTokensRepo.setDatabricksPat).mockResolvedValue(undefined);

      // Act
      const result = await setDatabricksPat(mockRequestUser, mockPat);

      // Assert
      expect(result.expiresAt).toBe(null);
      expect(result.comment).toBe('Permanent token');
      expect(oauthTokensRepo.setDatabricksPat).toHaveBeenCalledWith(
        mockUserId,
        mockPat,
        null
      );
    });

    it('should store PAT even when token info fetch fails', async () => {
      // Arrange
      vi.mocked(encryptionUtil.isEncryptionAvailable).mockReturnValue(true);

      const mockUser: SelectUser = {
        id: mockUserId,
        email: mockEmail,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(usersRepo.getUserById).mockResolvedValue(mockUser);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({}),
      });

      vi.mocked(oauthTokensRepo.setDatabricksPat).mockResolvedValue(undefined);

      // Act
      const result = await setDatabricksPat(mockRequestUser, mockPat);

      // Assert
      expect(result.expiresAt).toBe(null);
      expect(result.comment).toBe(null);
      expect(oauthTokensRepo.setDatabricksPat).toHaveBeenCalledWith(
        mockUserId,
        mockPat,
        null
      );

      consoleErrorSpy.mockRestore();
    });

    it('should ensure user exists before storing PAT', async () => {
      // Arrange
      vi.mocked(encryptionUtil.isEncryptionAvailable).mockReturnValue(true);

      const newUser: SelectUser = {
        id: mockUserId,
        email: mockEmail,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // User doesn't exist yet
      vi.mocked(usersRepo.getUserById).mockResolvedValue(null);
      vi.mocked(usersRepo.createUserWithDefaultSettings).mockResolvedValue(newUser);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ token_infos: [] }),
      });

      vi.mocked(oauthTokensRepo.setDatabricksPat).mockResolvedValue(undefined);

      // Act
      await setDatabricksPat(mockRequestUser, mockPat);

      // Assert - User should be created
      expect(usersRepo.createUserWithDefaultSettings).toHaveBeenCalled();
    });
  });

  describe('clearDatabricksPat', () => {
    it('should call deleteDatabricksPat with userId', async () => {
      // Arrange
      vi.mocked(oauthTokensRepo.deleteDatabricksPat).mockResolvedValue(undefined);

      // Act
      await clearDatabricksPat(mockUserId);

      // Assert
      expect(oauthTokensRepo.deleteDatabricksPat).toHaveBeenCalledWith(mockUserId);
    });

    it('should propagate repository errors', async () => {
      // Arrange
      const dbError = new Error('Database delete failed');
      vi.mocked(oauthTokensRepo.deleteDatabricksPat).mockRejectedValue(dbError);

      // Act & Assert
      await expect(clearDatabricksPat(mockUserId)).rejects.toThrow('Database delete failed');
    });
  });
});
