import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock database before importing the module
vi.mock('../index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

// Import after mocking
import { getLastUsedModel } from '../events.js';
import { db } from '../index.js';

describe('events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getLastUsedModel', () => {
    const mockSessionId = 'session_01h455vb4pex5vsknk084sn02q';

    it('should return model from the most recent init event', async () => {
      // Arrange
      const mockInitMessage = {
        type: 'system',
        subtype: 'init',
        session_id: mockSessionId,
        model: 'claude-sonnet-4-5-20250514',
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ message: mockInitMessage }]),
            }),
          }),
        }),
      });

      vi.mocked(db.select).mockImplementation(mockSelect);

      // Act
      const result = await getLastUsedModel(mockSessionId);

      // Assert
      expect(result).toBe('claude-sonnet-4-5-20250514');
    });

    it('should return null when no init events exist', async () => {
      // Arrange
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      vi.mocked(db.select).mockImplementation(mockSelect);

      // Act
      const result = await getLastUsedModel(mockSessionId);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when init event has no model field', async () => {
      // Arrange
      const mockInitMessageWithoutModel = {
        type: 'system',
        subtype: 'init',
        session_id: mockSessionId,
        // no model field
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi
                .fn()
                .mockResolvedValue([{ message: mockInitMessageWithoutModel }]),
            }),
          }),
        }),
      });

      vi.mocked(db.select).mockImplementation(mockSelect);
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Act
      const result = await getLastUsedModel(mockSessionId);

      // Assert
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Init event found but no model field')
      );
    });

    it('should return null when model field is not a string', async () => {
      // Arrange
      const mockInitMessageWithNonStringModel = {
        type: 'system',
        subtype: 'init',
        session_id: mockSessionId,
        model: 123, // not a string
      };

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { message: mockInitMessageWithNonStringModel },
              ]),
            }),
          }),
        }),
      });

      vi.mocked(db.select).mockImplementation(mockSelect);
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Act
      const result = await getLastUsedModel(mockSessionId);

      // Assert
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});
