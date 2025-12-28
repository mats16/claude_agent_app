import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSkills, type PublicSkillDetail } from './useSkills';

export type ImportTab = 'databricks' | 'anthropic';

interface UseSkillImportReturn {
  // Modal state
  isImportModalOpen: boolean;
  activeImportTab: ImportTab;
  isSavingSkill: boolean;

  // Skills data from useSkills hook
  databricksSkillNames: string[];
  databricksLoading: boolean;
  databricksError: string | null;
  anthropicSkillNames: string[];
  anthropicLoading: boolean;
  anthropicError: string | null;

  // Actions
  openImportModal: () => void;
  closeImportModal: () => void;
  setActiveImportTab: (tab: ImportTab) => void;
  handleImportSkill: (detail: PublicSkillDetail) => Promise<boolean>;
  fetchSkillDetail: (
    source: 'databricks' | 'anthropic',
    skillName: string
  ) => Promise<PublicSkillDetail | null>;
}

/**
 * Custom hook to manage skill import modal state and logic
 * Encapsulates all skill import functionality used across multiple modals
 */
export function useSkillImport(): UseSkillImportReturn {
  // Local state for modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [activeImportTab, setActiveImportTab] = useState<ImportTab>('databricks');
  const [isSavingSkill, setIsSavingSkill] = useState(false);

  const { t } = useTranslation();

  // Delegate to useSkills for all skill operations
  const {
    fetchSkills,
    databricksSkillNames,
    databricksLoading,
    databricksError,
    anthropicSkillNames,
    anthropicLoading,
    anthropicError,
    fetchDatabricksSkillNames,
    fetchAnthropicSkillNames,
    fetchSkillDetail,
    importSkill,
  } = useSkills();

  // Fetch skill names when import modal opens based on active tab
  useEffect(() => {
    if (!isImportModalOpen) return;

    if (activeImportTab === 'databricks') {
      fetchDatabricksSkillNames();
    } else if (activeImportTab === 'anthropic') {
      fetchAnthropicSkillNames();
    }
  }, [
    isImportModalOpen,
    activeImportTab,
    fetchDatabricksSkillNames,
    fetchAnthropicSkillNames,
  ]);

  /**
   * Import handler with enhanced error logging
   *
   * Returns boolean to indicate success/failure:
   * - true: Import succeeded, PresetImportModal will close automatically
   * - false: Import failed, modal stays open to allow retry
   *
   * This design provides better UX by allowing users to retry failed imports
   * without having to reopen the modal and navigate back to the skill.
   */
  const handleImportSkill = useCallback(
    async (detail: PublicSkillDetail): Promise<boolean> => {
      setIsSavingSkill(true);
      try {
        const success = await importSkill(detail);

        if (success) {
          message.success(t('skillsModal.importSuccess'));
          await fetchSkills();
          return true;
        } else {
          message.error(t('skillsModal.importFailed'));
          // Enhanced error logging with skill details
          console.error('Skill import failed for:', {
            name: detail.name,
            repo: detail.repo,
            path: detail.path,
          });
          return false;
        }
      } catch (error) {
        message.error(t('skillsModal.importFailed'));
        // Log the actual error with full details for debugging
        console.error('Skill import exception:', error, {
          skillDetail: detail,
        });
        return false;
      } finally {
        setIsSavingSkill(false);
      }
    },
    [importSkill, fetchSkills, t]
  );

  const openImportModal = useCallback(() => {
    setIsImportModalOpen(true);
  }, []);

  const closeImportModal = useCallback(() => {
    setIsImportModalOpen(false);
  }, []);

  return {
    // State
    isImportModalOpen,
    activeImportTab,
    isSavingSkill,

    // Skills data
    databricksSkillNames,
    databricksLoading,
    databricksError,
    anthropicSkillNames,
    anthropicLoading,
    anthropicError,

    // Actions
    openImportModal,
    closeImportModal,
    setActiveImportTab,
    handleImportSkill,
    fetchSkillDetail,
  };
}
