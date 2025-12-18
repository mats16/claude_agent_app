/**
 * Skills management modal
 * Container component that orchestrates skill list, editor, and import
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Flex, Typography, message } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { useSkills, type Skill } from '../hooks/useSkills';
import SkillsList from './skills/SkillsList';
import SkillEditor from './skills/SkillEditor';
import PresetImportModal from './skills/PresetImportModal';
import { colors, spacing } from '../styles/theme';

const { Text } = Typography;

interface SkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SkillsModal({ isOpen, onClose }: SkillsModalProps) {
  const { t } = useTranslation();
  const {
    skills,
    presetSkills,
    loading,
    error,
    fetchSkills,
    createSkill,
    updateSkill,
    deleteSkill,
    fetchPresetSkills,
    importPresetSkill,
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
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Fetch skills when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchSkills();
    }
  }, [isOpen, fetchSkills]);

  // Fetch preset skills when import modal opens
  useEffect(() => {
    if (isImportModalOpen) {
      fetchPresetSkills();
    }
  }, [isImportModalOpen, fetchPresetSkills]);

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

  const handleImportPreset = useCallback(async () => {
    if (!selectedPreset) return;

    setIsSaving(true);
    const success = await importPresetSkill(selectedPreset);
    setIsSaving(false);

    if (success) {
      message.success(t('skillsModal.importSuccess'));
      setIsImportModalOpen(false);
      setSelectedPreset(null);
      // Select the newly imported skill
      const importedSkill = skills.find((s) => s.name === selectedPreset);
      if (importedSkill) {
        setSelectedSkill(importedSkill);
      }
    } else {
      message.error(t('skillsModal.importFailed'));
    }
  }, [selectedPreset, importPresetSkill, skills, t]);

  const handleCloseImportModal = useCallback(() => {
    setIsImportModalOpen(false);
    setSelectedPreset(null);
  }, []);

  const hasChanges = isCreating
    ? editedName.trim() !== '' || editedContent.trim() !== ''
    : selectedSkill && editedContent !== selectedSkill.content;

  return (
    <Modal
      title={
        <Flex align="center" gap={spacing.sm}>
          <ThunderboltOutlined style={{ color: colors.brand }} />
          {t('skillsModal.title')}
        </Flex>
      }
      open={isOpen}
      onCancel={onClose}
      width={1200}
      footer={null}
      styles={{ body: { padding: 0, height: 700 } }}
    >
      {error && (
        <div style={{ padding: spacing.lg }}>
          <Text type="danger">{error}</Text>
        </div>
      )}

      <Flex style={{ height: '100%' }}>
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
        presetSkills={presetSkills}
        selectedPreset={selectedPreset}
        loading={loading}
        isSaving={isSaving}
        onClose={handleCloseImportModal}
        onSelectPreset={setSelectedPreset}
        onImport={handleImportPreset}
      />
    </Modal>
  );
}
