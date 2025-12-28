import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSkillImport } from './useSkillImport';
import * as useSkillsModule from './useSkills';
import { message } from 'antd';

// Mock dependencies
vi.mock('antd', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./useSkills');

describe('useSkillImport', () => {
  const mockFetchSkills = vi.fn();
  const mockFetchDatabricksSkillNames = vi.fn();
  const mockFetchAnthropicSkillNames = vi.fn();
  const mockFetchSkillDetail = vi.fn();
  const mockImportSkill = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup useSkills mock
    vi.spyOn(useSkillsModule, 'useSkills').mockReturnValue({
      skills: [],
      loading: false,
      error: null,
      databricksSkillNames: ['skill1', 'skill2'],
      databricksLoading: false,
      databricksError: null,
      anthropicSkillNames: ['skill3'],
      anthropicLoading: false,
      anthropicError: null,
      fetchSkills: mockFetchSkills,
      fetchDatabricksSkillNames: mockFetchDatabricksSkillNames,
      fetchAnthropicSkillNames: mockFetchAnthropicSkillNames,
      fetchSkillDetail: mockFetchSkillDetail,
      importSkill: mockImportSkill,
      createSkill: vi.fn(),
      updateSkill: vi.fn(),
      deleteSkill: vi.fn(),
    });
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useSkillImport());

    expect(result.current.isImportModalOpen).toBe(false);
    expect(result.current.activeImportTab).toBe('databricks');
    expect(result.current.isSavingSkill).toBe(false);
  });

  it('should open and close import modal', () => {
    const { result } = renderHook(() => useSkillImport());

    // Open modal
    act(() => {
      result.current.openImportModal();
    });
    expect(result.current.isImportModalOpen).toBe(true);

    // Close modal
    act(() => {
      result.current.closeImportModal();
    });
    expect(result.current.isImportModalOpen).toBe(false);
  });

  it('should fetch databricks skills when modal opens with databricks tab', async () => {
    const { result } = renderHook(() => useSkillImport());

    act(() => {
      result.current.openImportModal();
    });

    await waitFor(() => {
      expect(mockFetchDatabricksSkillNames).toHaveBeenCalledTimes(1);
    });
  });

  it('should fetch anthropic skills when switching to anthropic tab', async () => {
    const { result } = renderHook(() => useSkillImport());

    act(() => {
      result.current.openImportModal();
    });

    act(() => {
      result.current.setActiveImportTab('anthropic');
    });

    await waitFor(() => {
      expect(mockFetchAnthropicSkillNames).toHaveBeenCalled();
    });
  });

  it('should handle successful skill import', async () => {
    mockImportSkill.mockResolvedValue(true);

    const { result } = renderHook(() => useSkillImport());

    const skillDetail = {
      name: 'test-skill',
      repo: 'test/repo',
      path: 'skills/test.md',
      description: 'Test skill',
      version: '1.0.0',
    };

    let importResult: boolean | undefined;
    await act(async () => {
      importResult = await result.current.handleImportSkill(skillDetail);
    });

    expect(importResult).toBe(true);
    expect(mockImportSkill).toHaveBeenCalledWith(skillDetail);
    expect(mockFetchSkills).toHaveBeenCalled();
    expect(message.success).toHaveBeenCalledWith('skillsModal.importSuccess');
  });

  it('should handle failed skill import with error logging', async () => {
    mockImportSkill.mockResolvedValue(false);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useSkillImport());

    const skillDetail = {
      name: 'test-skill',
      repo: 'test/repo',
      path: 'skills/test.md',
      description: 'Test skill',
      version: '1.0.0',
    };

    let importResult: boolean | undefined;
    await act(async () => {
      importResult = await result.current.handleImportSkill(skillDetail);
    });

    expect(importResult).toBe(false);
    expect(message.error).toHaveBeenCalledWith('skillsModal.importFailed');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Skill import failed for:', {
      name: 'test-skill',
      repo: 'test/repo',
      path: 'skills/test.md',
    });

    consoleErrorSpy.mockRestore();
  });

  it('should handle import exception with detailed logging', async () => {
    const testError = new Error('Network error');
    mockImportSkill.mockRejectedValue(testError);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useSkillImport());

    const skillDetail = {
      name: 'test-skill',
      repo: 'test/repo',
      path: 'skills/test.md',
      description: 'Test skill',
      version: '1.0.0',
    };

    let importResult: boolean | undefined;
    await act(async () => {
      importResult = await result.current.handleImportSkill(skillDetail);
    });

    expect(importResult).toBe(false);
    expect(message.error).toHaveBeenCalledWith('skillsModal.importFailed');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Skill import exception:',
      testError,
      { skillDetail }
    );

    consoleErrorSpy.mockRestore();
  });

  it('should expose skills data from useSkills', () => {
    const { result } = renderHook(() => useSkillImport());

    expect(result.current.databricksSkillNames).toEqual(['skill1', 'skill2']);
    expect(result.current.anthropicSkillNames).toEqual(['skill3']);
    expect(result.current.databricksLoading).toBe(false);
    expect(result.current.anthropicLoading).toBe(false);
  });
});
