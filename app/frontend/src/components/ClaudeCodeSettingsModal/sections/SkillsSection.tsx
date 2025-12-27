/**
 * Skills management section
 * Extracted from SkillsModal for use in unified Claude Code Settings
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Flex, Typography, message } from 'antd';
import { useSkills, type Skill } from '../../../hooks/useSkills';
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
    // Databricks skills
    databricksSkills,
    databricksLoading,
    databricksError,
    databricksCached,
    // Anthropic skills
    anthropicSkills,
    anthropicLoading,
    anthropicError,
    anthropicCached,
    // Actions
    fetchSkills,
    createSkill,
    updateSkill,
    deleteSkill,
    fetchDatabricksSkills,
    importDatabricksSkill,
    fetchAnthropicSkills,
    importAnthropicSkill,
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
  const [selectedDatabricksSkill, setSelectedDatabricksSkill] = useState<
    string | null
  >(null);
  const [selectedAnthropicSkill, setSelectedAnthropicSkill] = useState<
    string | null
  >(null);
  const [activeImportTab, setActiveImportTab] =
    useState<ImportTab>('databricks');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Fetch skills when section becomes visible
  useEffect(() => {
    if (isVisible) {
      fetchSkills();
    }
  }, [isVisible, fetchSkills]);

  // Fetch Databricks skills when import modal opens (databricks tab)
  useEffect(() => {
    if (isImportModalOpen && activeImportTab === 'databricks') {
      fetchDatabricksSkills();
    }
  }, [isImportModalOpen, activeImportTab, fetchDatabricksSkills]);

  // Fetch Anthropic skills when import modal opens (anthropic tab)
  useEffect(() => {
    if (isImportModalOpen && activeImportTab === 'anthropic') {
      fetchAnthropicSkills();
    }
  }, [isImportModalOpen, activeImportTab, fetchAnthropicSkills]);

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

  const handleImportDatabricksSkill = useCallback(async () => {
    if (!selectedDatabricksSkill) return;

    setIsSaving(true);
    const success = await importDatabricksSkill(selectedDatabricksSkill);
    setIsSaving(false);

    if (success) {
      message.success(t('skillsModal.importSuccess'));
      setIsImportModalOpen(false);
      setSelectedDatabricksSkill(null);
      await fetchSkills();
    } else {
      message.error(t('skillsModal.importFailed'));
    }
  }, [selectedDatabricksSkill, importDatabricksSkill, fetchSkills, t]);

  const handleImportAnthropicSkill = useCallback(async () => {
    if (!selectedAnthropicSkill) return;

    setIsSaving(true);
    const success = await importAnthropicSkill(selectedAnthropicSkill);
    setIsSaving(false);

    if (success) {
      message.success(t('skillsModal.importSuccess'));
      setIsImportModalOpen(false);
      setSelectedAnthropicSkill(null);
      await fetchSkills();
    } else {
      message.error(t('skillsModal.importFailed'));
    }
  }, [selectedAnthropicSkill, importAnthropicSkill, fetchSkills, t]);

  const handleCloseImportModal = useCallback(() => {
    setIsImportModalOpen(false);
    setSelectedDatabricksSkill(null);
    setSelectedAnthropicSkill(null);
  }, []);

  const handleTabChange = useCallback((tab: ImportTab) => {
    setActiveImportTab(tab);
    // Clear selections when switching tabs
    setSelectedDatabricksSkill(null);
    setSelectedAnthropicSkill(null);
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
        databricksSkills={databricksSkills}
        selectedDatabricksSkill={selectedDatabricksSkill}
        databricksLoading={databricksLoading}
        databricksError={databricksError}
        databricksCached={databricksCached}
        anthropicSkills={anthropicSkills}
        selectedAnthropicSkill={selectedAnthropicSkill}
        anthropicLoading={anthropicLoading}
        anthropicError={anthropicError}
        anthropicCached={anthropicCached}
        isSaving={isSaving}
        activeTab={activeImportTab}
        onClose={handleCloseImportModal}
        onSelectDatabricksSkill={setSelectedDatabricksSkill}
        onSelectAnthropicSkill={setSelectedAnthropicSkill}
        onImportDatabricksSkill={handleImportDatabricksSkill}
        onImportAnthropicSkill={handleImportAnthropicSkill}
        onTabChange={handleTabChange}
      />
    </>
  );
}
