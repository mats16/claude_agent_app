import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Button,
  Input,
  List,
  Flex,
  message,
  Spin,
  Typography,
  Empty,
  Popconfirm,
  Dropdown,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  ThunderboltOutlined,
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  EditOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { useSkills, type Skill, type PresetSkill } from '../hooks/useSkills';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const { TextArea } = Input;
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

  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedVersion, setEditedVersion] = useState('1.0.0');
  const [editedContent, setEditedContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

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

  const handleNewSkill = () => {
    setIsCreating(true);
    setIsEditing(true);
    setSelectedSkill(null);
    setEditedName('');
    setEditedDescription('');
    setEditedVersion('1.0.0');
    setEditedContent('');
  };

  const handleSelectSkill = (skill: Skill) => {
    if (!isSaving) {
      setSelectedSkill(skill);
    }
  };

  const handleSave = async () => {
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
  };

  const handleDelete = async (skillName: string) => {
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
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
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
  };

  const handleImportPreset = async () => {
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
      message.error(t('skillsModal.presetExists'));
    }
  };

  const hasChanges = isCreating
    ? editedName.trim() !== '' || editedContent.trim() !== ''
    : selectedSkill && editedContent !== selectedSkill.content;

  return (
    <Modal
      title={
        <Flex align="center" gap={8}>
          <ThunderboltOutlined style={{ color: '#f5a623' }} />
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
        <div style={{ padding: 16 }}>
          <Text type="danger">{error}</Text>
        </div>
      )}

      <Flex style={{ height: '100%' }}>
        {/* Left Panel - Skills List */}
        <div
          style={{
            width: 280,
            borderRight: '1px solid #f0f0f0',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0' }}>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'new',
                    label: t('skillsModal.newSkill'),
                    icon: <PlusOutlined />,
                    onClick: handleNewSkill,
                  },
                  {
                    key: 'import',
                    label: t('skillsModal.importPreset'),
                    icon: <ThunderboltOutlined />,
                    onClick: () => setIsImportModalOpen(true),
                  },
                ] as MenuProps['items'],
              }}
              disabled={loading || isSaving}
            >
              <Button type="primary" block>
                {t('skillsModal.createMenu')} <DownOutlined />
              </Button>
            </Dropdown>
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            {loading && skills.length === 0 ? (
              <Flex
                justify="center"
                align="center"
                style={{ height: '100%', padding: 24 }}
              >
                <Spin />
              </Flex>
            ) : skills.length === 0 ? (
              <Empty
                description={t('skillsModal.noSkills')}
                style={{ marginTop: 60 }}
              />
            ) : (
              <List
                dataSource={skills}
                renderItem={(skill) => (
                  <List.Item
                    key={skill.name}
                    onClick={() => handleSelectSkill(skill)}
                    style={{
                      cursor: 'pointer',
                      padding: '12px 16px',
                      background:
                        selectedSkill?.name === skill.name && !isCreating
                          ? '#f5f5f5'
                          : 'transparent',
                      borderLeft:
                        selectedSkill?.name === skill.name && !isCreating
                          ? '3px solid #f5a623'
                          : '3px solid transparent',
                    }}
                    actions={[
                      <Popconfirm
                        title={t('skillsModal.deleteConfirm')}
                        onConfirm={(e) => {
                          e?.stopPropagation();
                          handleDelete(skill.name);
                        }}
                        okText={t('common.ok')}
                        cancelText={t('common.cancel')}
                        disabled={isSaving}
                      >
                        <Button
                          type="text"
                          size="small"
                          icon={<DeleteOutlined />}
                          danger
                          disabled={isSaving}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Popconfirm>,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Text
                          ellipsis
                          style={{
                            fontWeight:
                              selectedSkill?.name === skill.name && !isCreating
                                ? 600
                                : 400,
                          }}
                        >
                          {skill.name}
                        </Text>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </div>
        </div>

        {/* Right Panel - Editor */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: 24,
          }}
        >
          {!selectedSkill && !isCreating ? (
            <Flex
              justify="center"
              align="center"
              style={{ height: '100%', color: '#999' }}
            >
              <Empty description={t('skillsModal.selectOrCreate')} />
            </Flex>
          ) : (
            <>
              <Flex gap={16} style={{ marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    {t('skillsModal.skillName')}
                  </Text>
                  <Input
                    value={editedName}
                    onChange={(e) => {
                      let value = e.target.value;
                      // Remove .md extension if entered
                      value = value.replace(/\.md$/i, '');
                      // Only allow alphanumeric and hyphens
                      value = value.replace(/[^a-zA-Z0-9-]/g, '');
                      setEditedName(value);
                    }}
                    placeholder={t('skillsModal.skillNamePlaceholder')}
                    disabled={!isCreating || isSaving}
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>

                <div style={{ width: 200 }}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    {t('skillsModal.skillVersion')}
                  </Text>
                  <Input
                    value={editedVersion}
                    onChange={(e) => {
                      let value = e.target.value;
                      // Only allow digits and dots
                      value = value.replace(/[^0-9.]/g, '');
                      setEditedVersion(value);
                    }}
                    placeholder={t('skillsModal.skillVersionPlaceholder')}
                    disabled={(!isEditing && !isCreating) || isSaving}
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>
              </Flex>

              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  {t('skillsModal.skillDescription')}{' '}
                  <Text type="danger">*</Text>
                </Text>
                <TextArea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  placeholder={t('skillsModal.skillDescriptionPlaceholder')}
                  disabled={(!isEditing && !isCreating) || isSaving}
                  rows={3}
                />
              </div>

              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                }}
              >
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  {t('skillsModal.skillContent')} <Text type="danger">*</Text>
                </Text>

                {isEditing || isCreating ? (
                  <TextArea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    placeholder={t('skillsModal.skillContentPlaceholder')}
                    disabled={isSaving}
                    style={{
                      flex: 1,
                      fontFamily: 'monospace',
                      fontSize: 13,
                      resize: 'none',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      flex: 1,
                      overflow: 'auto',
                      padding: 16,
                      border: '1px solid #d9d9d9',
                      borderRadius: 8,
                      background: '#fafafa',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      minHeight: 0,
                      maxWidth: '100%',
                    }}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {editedContent}
                    </ReactMarkdown>
                  </div>
                )}
              </div>

              {isEditing || isCreating ? (
                <Flex gap={8} justify="flex-end" style={{ marginTop: 16 }}>
                  <Button onClick={handleCancel} disabled={isSaving}>
                    {t('skillsModal.cancel')}
                  </Button>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={handleSave}
                    loading={isSaving}
                    disabled={!hasChanges}
                  >
                    {t('skillsModal.save')}
                  </Button>
                </Flex>
              ) : (
                <Flex justify="flex-end" style={{ marginTop: 16 }}>
                  <Button
                    type="default"
                    icon={<EditOutlined />}
                    onClick={handleEdit}
                    disabled={isSaving}
                  >
                    {t('skillsModal.edit')}
                  </Button>
                </Flex>
              )}
            </>
          )}
        </div>
      </Flex>

      {/* Preset Skills Import Modal */}
      <Modal
        title={t('skillsModal.importPresetTitle')}
        open={isImportModalOpen}
        onCancel={() => {
          setIsImportModalOpen(false);
          setSelectedPreset(null);
        }}
        onOk={handleImportPreset}
        okText={t('skillsModal.import')}
        cancelText={t('skillsModal.cancel')}
        okButtonProps={{ disabled: !selectedPreset, loading: isSaving }}
        cancelButtonProps={{ disabled: isSaving }}
        width={600}
      >
        {loading ? (
          <Flex justify="center" align="center" style={{ padding: 24 }}>
            <Spin />
          </Flex>
        ) : presetSkills.length === 0 ? (
          <Empty description={t('skillsModal.noPresets')} />
        ) : (
          <List
            dataSource={presetSkills}
            renderItem={(preset) => (
              <List.Item
                key={preset.name}
                onClick={() => setSelectedPreset(preset.name)}
                style={{
                  cursor: 'pointer',
                  padding: '12px 16px',
                  background:
                    selectedPreset === preset.name ? '#f5f5f5' : 'transparent',
                  borderLeft:
                    selectedPreset === preset.name
                      ? '3px solid #f5a623'
                      : '3px solid transparent',
                }}
              >
                <List.Item.Meta
                  title={
                    <Text
                      strong={selectedPreset === preset.name}
                      style={{ fontFamily: 'monospace' }}
                    >
                      {preset.name}
                    </Text>
                  }
                  description={preset.description}
                />
              </List.Item>
            )}
          />
        )}
      </Modal>
    </Modal>
  );
}
