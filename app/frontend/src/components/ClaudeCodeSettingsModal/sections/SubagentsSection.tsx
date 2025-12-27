/**
 * Subagent management section
 * Extracted from SubagentModal for use in unified Claude Code Settings
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Flex, Typography, message } from 'antd';
import { useSubagents, type Subagent } from '../../../hooks/useSubagents';
import SubagentsList from '../../subagents/SubagentsList';
import SubagentEditor from '../../subagents/SubagentEditor';
import PresetSubagentImportModal from '../../subagents/PresetSubagentImportModal';
import { spacing } from '../../../styles/theme';

const { Text } = Typography;

interface SubagentsSectionProps {
  isVisible: boolean;
}

export default function SubagentsSection({ isVisible }: SubagentsSectionProps) {
  const { t } = useTranslation();
  const {
    subagents,
    loading,
    error,
    // Databricks agents
    databricksAgents,
    databricksLoading,
    databricksError,
    databricksCached,
    // Actions
    fetchSubagents,
    createSubagent,
    updateSubagent,
    deleteSubagent,
    fetchDatabricksAgents,
    importDatabricksAgent,
  } = useSubagents();

  // Selection state
  const [selectedSubagent, setSelectedSubagent] = useState<Subagent | null>(
    null
  );
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form state
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedTools, setEditedTools] = useState('');
  const [editedModel, setEditedModel] = useState<'sonnet' | 'opus' | undefined>(
    undefined
  );
  const [editedContent, setEditedContent] = useState('');

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedDatabricksAgent, setSelectedDatabricksAgent] = useState<
    string | null
  >(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Fetch subagents when section becomes visible
  useEffect(() => {
    if (isVisible) {
      fetchSubagents();
    }
  }, [isVisible, fetchSubagents]);

  // Fetch Databricks agents when import modal opens
  useEffect(() => {
    if (isImportModalOpen) {
      fetchDatabricksAgents();
    }
  }, [isImportModalOpen, fetchDatabricksAgents]);

  // Update edited fields when selected subagent changes
  useEffect(() => {
    if (selectedSubagent) {
      setEditedName(selectedSubagent.name);
      setEditedDescription(selectedSubagent.description);
      setEditedTools(selectedSubagent.tools || '');
      setEditedModel(selectedSubagent.model);
      setEditedContent(selectedSubagent.content);
      setIsCreating(false);
      setIsEditing(false);
    }
  }, [selectedSubagent]);

  const handleNewSubagent = useCallback(() => {
    setIsCreating(true);
    setIsEditing(true);
    setSelectedSubagent(null);
    setEditedName('');
    setEditedDescription('');
    setEditedTools('');
    setEditedModel(undefined);
    setEditedContent('');
  }, []);

  const handleSelectSubagent = useCallback(
    (subagent: Subagent) => {
      if (!isSaving) {
        setSelectedSubagent(subagent);
      }
    },
    [isSaving]
  );

  const handleSave = useCallback(async () => {
    // Validate
    if (!editedName.trim()) {
      message.error(t('subagentModal.nameRequired'));
      return;
    }

    if (!editedDescription.trim()) {
      message.error(t('subagentModal.descriptionRequired'));
      return;
    }

    if (!editedContent.trim()) {
      message.error(t('subagentModal.contentRequired'));
      return;
    }

    // Validate name format
    if (!/^[a-zA-Z0-9-]+$/.test(editedName)) {
      message.error(t('subagentModal.invalidName'));
      return;
    }

    setIsSaving(true);
    let success = false;

    // Normalize tools and model - empty string becomes undefined
    const tools = editedTools.trim() || undefined;
    const model = editedModel || undefined;

    if (isCreating) {
      // Check for duplicate names
      if (subagents.some((s) => s.name === editedName)) {
        message.error(t('subagentModal.nameExists'));
        setIsSaving(false);
        return;
      }
      success = await createSubagent(
        editedName,
        editedDescription,
        editedContent,
        tools,
        model
      );
    } else if (selectedSubagent) {
      success = await updateSubagent(
        selectedSubagent.name,
        editedDescription,
        editedContent,
        tools,
        model
      );
    }

    setIsSaving(false);

    if (success) {
      message.success(t('subagentModal.saved'));
      setIsCreating(false);
      setIsEditing(false);
      // Select the newly created/updated subagent
      if (isCreating) {
        const newSubagent: Subagent = {
          name: editedName,
          description: editedDescription,
          tools,
          model,
          content: editedContent,
        };
        setSelectedSubagent(newSubagent);
      }
    } else {
      message.error(t('subagentModal.saveFailed'));
    }
  }, [
    editedName,
    editedDescription,
    editedTools,
    editedModel,
    editedContent,
    isCreating,
    selectedSubagent,
    subagents,
    createSubagent,
    updateSubagent,
    t,
  ]);

  const handleDelete = useCallback(
    async (subagentName: string) => {
      setIsSaving(true);
      const success = await deleteSubagent(subagentName);
      setIsSaving(false);

      if (success) {
        message.success(t('subagentModal.deleted'));
        // Clear selection if deleted subagent was selected
        if (selectedSubagent?.name === subagentName) {
          setSelectedSubagent(null);
          setIsCreating(false);
        }
      } else {
        message.error(t('subagentModal.deleteFailed'));
      }
    },
    [deleteSubagent, selectedSubagent, t]
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
      setEditedTools('');
      setEditedModel(undefined);
      setEditedContent('');
    } else if (selectedSubagent) {
      // Exit edit mode and reset to original values
      setIsEditing(false);
      setEditedName(selectedSubagent.name);
      setEditedDescription(selectedSubagent.description);
      setEditedTools(selectedSubagent.tools || '');
      setEditedModel(selectedSubagent.model);
      setEditedContent(selectedSubagent.content);
    }
  }, [isCreating, selectedSubagent]);

  const handleImportDatabricksAgent = useCallback(async () => {
    if (!selectedDatabricksAgent) return;

    setIsSaving(true);
    const success = await importDatabricksAgent(selectedDatabricksAgent);
    setIsSaving(false);

    if (success) {
      message.success(t('subagentModal.importSuccess'));
      setIsImportModalOpen(false);
      setSelectedDatabricksAgent(null);
      await fetchSubagents();
    } else {
      message.error(t('subagentModal.importFailed'));
    }
  }, [selectedDatabricksAgent, importDatabricksAgent, fetchSubagents, t]);

  const handleCloseImportModal = useCallback(() => {
    setIsImportModalOpen(false);
    setSelectedDatabricksAgent(null);
  }, []);

  const hasChanges = isCreating
    ? editedName.trim() !== '' || editedContent.trim() !== ''
    : selectedSubagent && editedContent !== selectedSubagent.content;

  return (
    <>
      {error && (
        <div style={{ padding: spacing.lg }}>
          <Text type="danger">{error}</Text>
        </div>
      )}

      <Flex style={{ height: '100%', overflow: 'hidden', minHeight: 0 }}>
        <SubagentsList
          subagents={subagents}
          selectedSubagent={selectedSubagent}
          isCreating={isCreating}
          loading={loading}
          isSaving={isSaving}
          dropdownOpen={dropdownOpen}
          onDropdownOpenChange={setDropdownOpen}
          onNewSubagent={handleNewSubagent}
          onImportClick={() => setIsImportModalOpen(true)}
          onSelectSubagent={handleSelectSubagent}
          onDeleteSubagent={handleDelete}
        />

        <SubagentEditor
          isCreating={isCreating}
          isEditing={isEditing}
          isSaving={isSaving}
          hasChanges={!!hasChanges}
          editedName={editedName}
          editedDescription={editedDescription}
          editedTools={editedTools}
          editedModel={editedModel}
          editedContent={editedContent}
          onNameChange={setEditedName}
          onDescriptionChange={setEditedDescription}
          onToolsChange={setEditedTools}
          onModelChange={setEditedModel}
          onContentChange={setEditedContent}
          onEdit={handleEdit}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      </Flex>

      <PresetSubagentImportModal
        isOpen={isImportModalOpen}
        databricksAgents={databricksAgents}
        selectedAgent={selectedDatabricksAgent}
        loading={databricksLoading}
        error={databricksError}
        cached={databricksCached}
        isSaving={isSaving}
        onClose={handleCloseImportModal}
        onSelectAgent={setSelectedDatabricksAgent}
        onImport={handleImportDatabricksAgent}
      />
    </>
  );
}
