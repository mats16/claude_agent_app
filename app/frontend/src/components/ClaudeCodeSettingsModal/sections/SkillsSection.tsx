/**
 * Skills management section
 * Extracted from SkillsModal for use in unified Claude Code Settings
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Flex, Typography, message } from 'antd';
import {
  useSkills,
  type Skill,
  type PublicSkillDetail,
} from '../../../hooks/useSkills';
import SkillsList from '../../skills/SkillsList';
import SkillEditor from '../../skills/SkillEditor';
import PresetImportModal, {
  type ImportTab,
} from '../../skills/PresetImportModal';
import { spacing } from '../../../styles/theme';

const { Text } = Typography;

interface SkillsSectionProps {
  isVisible: boolean;
}

export default function SkillsSection({ isVisible }: SkillsSectionProps) {
  const { t } = useTranslation();
  const {
    skills,
    loading,
    error,
    // Databricks skill names
    databricksSkillNames,
    databricksLoading,
    databricksError,
    databricksCached,
    // Anthropic skill names
    anthropicSkillNames,
    anthropicLoading,
    anthropicError,
    anthropicCached,
    // Actions
    fetchSkills,
    createSkill,
    updateSkill,
    deleteSkill,
    fetchDatabricksSkillNames,
    fetchAnthropicSkillNames,
    fetchSkillDetail,
    importSkill,
  } = useSkills();

  // Selection state
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form state
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedVersion, setEditedVersion] = useState('1.0.0');
  const [editedContent, setEditedContent] = useState('');

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [activeImportTab, setActiveImportTab] =
    useState<ImportTab>('databricks');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Fetch skills when section becomes visible
  useEffect(() => {
    if (isVisible) {
      fetchSkills();
    }
  }, [isVisible, fetchSkills]);

  // Fetch Databricks skill names when import modal opens (databricks tab)
  useEffect(() => {
    if (isImportModalOpen && activeImportTab === 'databricks') {
      fetchDatabricksSkillNames();
    }
  }, [isImportModalOpen, activeImportTab, fetchDatabricksSkillNames]);

  // Fetch Anthropic skill names when import modal opens (anthropic tab)
  useEffect(() => {
    if (isImportModalOpen && activeImportTab === 'anthropic') {
      fetchAnthropicSkillNames();
    }
  }, [isImportModalOpen, activeImportTab, fetchAnthropicSkillNames]);

  // Update edited fields when selected skill changes
  useEffect(() => {
    if (selectedSkill) {
      setEditedName(selectedSkill.name);
      setEditedDescription(selectedSkill.description);
      setEditedVersion(selectedSkill.version);
      setEditedContent(selectedSkill.content);
      setIsCreating(false);
      setIsEditing(false);
    }
  }, [selectedSkill]);

  const handleNewSkill = useCallback(() => {
    setIsCreating(true);
    setIsEditing(true);
    setSelectedSkill(null);
    setEditedName('');
    setEditedDescription('');
    setEditedVersion('1.0.0');
    setEditedContent('');
  }, []);

  const handleSelectSkill = useCallback(
    (skill: Skill) => {
      if (!isSaving) {
        setSelectedSkill(skill);
      }
    },
    [isSaving]
  );

  const handleSave = useCallback(async () => {
    // Validate
    if (!editedName.trim()) {
      message.error(t('skillsModal.nameRequired'));
      return;
    }

    if (!editedDescription.trim()) {
      message.error(t('skillsModal.descriptionRequired'));
      return;
    }

    if (!editedContent.trim()) {
      message.error(t('skillsModal.contentRequired'));
      return;
    }

    // Validate name format
    if (!/^[a-zA-Z0-9-]+$/.test(editedName)) {
      message.error(t('skillsModal.invalidName'));
      return;
    }

    // Validate version format (semantic versioning: major.minor.patch)
    if (!/^\d+\.\d+\.\d+$/.test(editedVersion.trim())) {
      message.error(t('skillsModal.invalidVersion'));
      return;
    }

    setIsSaving(true);
    let success = false;

    if (isCreating) {
      // Check for duplicate names
      if (skills.some((s) => s.name === editedName)) {
        message.error(t('skillsModal.nameExists'));
        setIsSaving(false);
        return;
      }
      success = await createSkill(
        editedName,
        editedDescription,
        editedVersion,
        editedContent
      );
    } else if (selectedSkill) {
      success = await updateSkill(
        selectedSkill.name,
        editedDescription,
        editedVersion,
        editedContent
      );
    }

    setIsSaving(false);

    if (success) {
      message.success(t('skillsModal.saved'));
      setIsCreating(false);
      setIsEditing(false);
      // Select the newly created/updated skill
      if (isCreating) {
        const newSkill = {
          name: editedName,
          description: editedDescription,
          version: editedVersion,
          content: editedContent,
        };
        setSelectedSkill(newSkill);
      }
    } else {
      message.error(t('skillsModal.saveFailed'));
    }
  }, [
    editedName,
    editedDescription,
    editedVersion,
    editedContent,
    isCreating,
    selectedSkill,
    skills,
    createSkill,
    updateSkill,
    t,
  ]);

  const handleDelete = useCallback(
    async (skillName: string) => {
      setIsSaving(true);
      const success = await deleteSkill(skillName);
      setIsSaving(false);

      if (success) {
        message.success(t('skillsModal.deleted'));
        // Clear selection if deleted skill was selected
        if (selectedSkill?.name === skillName) {
          setSelectedSkill(null);
          setIsCreating(false);
        }
      } else {
        message.error(t('skillsModal.deleteFailed'));
      }
    },
    [deleteSkill, selectedSkill, t]
  );

  const handleEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleCancel = useCallback(() => {
    if (isCreating) {
      setIsCreating(false);
      setIsEditing(false);
      setEditedName('');
      setEditedDescription('');
      setEditedVersion('1.0.0');
      setEditedContent('');
    } else if (selectedSkill) {
      // Exit edit mode and reset to original values
      setIsEditing(false);
      setEditedName(selectedSkill.name);
      setEditedDescription(selectedSkill.description);
      setEditedVersion(selectedSkill.version);
      setEditedContent(selectedSkill.content);
    }
  }, [isCreating, selectedSkill]);

  const handleImportSkill = useCallback(
    async (detail: PublicSkillDetail): Promise<boolean> => {
      setIsSaving(true);
      const success = await importSkill(detail);
      setIsSaving(false);

      if (success) {
        message.success(t('skillsModal.importSuccess'));
        await fetchSkills();
        return true;
      } else {
        message.error(t('skillsModal.importFailed'));
        return false;
      }
    },
    [importSkill, fetchSkills, t]
  );

  const handleCloseImportModal = useCallback(() => {
    setIsImportModalOpen(false);
  }, []);

  const handleTabChange = useCallback((tab: ImportTab) => {
    setActiveImportTab(tab);
  }, []);

  const hasChanges = isCreating
    ? editedName.trim() !== '' || editedContent.trim() !== ''
    : selectedSkill && editedContent !== selectedSkill.content;

  return (
    <>
      {error && (
        <div style={{ padding: spacing.lg }}>
          <Text type="danger">{error}</Text>
        </div>
      )}

      <Flex style={{ height: '100%', overflow: 'hidden', minHeight: 0 }}>
        <SkillsList
          skills={skills}
          selectedSkill={selectedSkill}
          isCreating={isCreating}
          loading={loading}
          isSaving={isSaving}
          dropdownOpen={dropdownOpen}
          onDropdownOpenChange={setDropdownOpen}
          onNewSkill={handleNewSkill}
          onImportClick={() => setIsImportModalOpen(true)}
          onSelectSkill={handleSelectSkill}
          onDeleteSkill={handleDelete}
        />

        <SkillEditor
          isCreating={isCreating}
          isEditing={isEditing}
          isSaving={isSaving}
          hasChanges={!!hasChanges}
          editedName={editedName}
          editedDescription={editedDescription}
          editedVersion={editedVersion}
          editedContent={editedContent}
          onNameChange={setEditedName}
          onDescriptionChange={setEditedDescription}
          onVersionChange={setEditedVersion}
          onContentChange={setEditedContent}
          onEdit={handleEdit}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      </Flex>

      <PresetImportModal
        isOpen={isImportModalOpen}
        databricksSkillNames={databricksSkillNames}
        databricksLoading={databricksLoading}
        databricksError={databricksError}
        databricksCached={databricksCached}
        anthropicSkillNames={anthropicSkillNames}
        anthropicLoading={anthropicLoading}
        anthropicError={anthropicError}
        anthropicCached={anthropicCached}
        isSaving={isSaving}
        activeTab={activeImportTab}
        onClose={handleCloseImportModal}
        onTabChange={handleTabChange}
        onFetchDetail={fetchSkillDetail}
        onImport={handleImportSkill}
      />
    </>
  );
}
