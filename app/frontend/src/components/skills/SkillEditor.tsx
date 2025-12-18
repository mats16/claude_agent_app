/**
 * Skill editor component for the right panel
 * Handles viewing and editing skill details
 */

import { useTranslation } from 'react-i18next';
import { Button, Input, Flex, Typography, Empty } from 'antd';
import { SaveOutlined, EditOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { colors, spacing, borderRadius } from '../../styles/theme';

const { TextArea } = Input;
const { Text } = Typography;

interface SkillEditorProps {
  isCreating: boolean;
  isEditing: boolean;
  isSaving: boolean;
  hasChanges: boolean;
  editedName: string;
  editedDescription: string;
  editedVersion: string;
  editedContent: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onVersionChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function SkillEditor({
  isCreating,
  isEditing,
  isSaving,
  hasChanges,
  editedName,
  editedDescription,
  editedVersion,
  editedContent,
  onNameChange,
  onDescriptionChange,
  onVersionChange,
  onContentChange,
  onEdit,
  onSave,
  onCancel,
}: SkillEditorProps) {
  const { t } = useTranslation();

  const showEditor = isCreating || isEditing;
  const hasSelection = isCreating || editedName !== '';

  if (!hasSelection) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: spacing.xxl,
        }}
      >
        <Flex
          justify="center"
          align="center"
          style={{ height: '100%', color: colors.textMuted }}
        >
          <Empty description={t('skillsModal.selectOrCreate')} />
        </Flex>
      </div>
    );
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    // Remove .md extension if entered
    value = value.replace(/\.md$/i, '');
    // Only allow alphanumeric and hyphens
    value = value.replace(/[^a-zA-Z0-9-]/g, '');
    onNameChange(value);
  };

  const handleVersionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    // Only allow digits and dots
    value = value.replace(/[^0-9.]/g, '');
    onVersionChange(value);
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: spacing.xxl,
      }}
    >
      <Flex gap={spacing.lg} style={{ marginBottom: spacing.lg }}>
        <div style={{ flex: 1 }}>
          <Text strong style={{ display: 'block', marginBottom: spacing.sm }}>
            {t('skillsModal.skillName')}
          </Text>
          <Input
            value={editedName}
            onChange={handleNameChange}
            placeholder={t('skillsModal.skillNamePlaceholder')}
            disabled={!isCreating || isSaving}
            style={{ fontFamily: 'monospace' }}
          />
        </div>

        <div style={{ width: 200 }}>
          <Text strong style={{ display: 'block', marginBottom: spacing.sm }}>
            {t('skillsModal.skillVersion')}
          </Text>
          <Input
            value={editedVersion}
            onChange={handleVersionChange}
            placeholder={t('skillsModal.skillVersionPlaceholder')}
            disabled={!showEditor || isSaving}
            style={{ fontFamily: 'monospace' }}
          />
        </div>
      </Flex>

      <div style={{ marginBottom: spacing.lg }}>
        <Text strong style={{ display: 'block', marginBottom: spacing.sm }}>
          {t('skillsModal.skillDescription')} <Text type="danger">*</Text>
        </Text>
        <TextArea
          value={editedDescription}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder={t('skillsModal.skillDescriptionPlaceholder')}
          disabled={!showEditor || isSaving}
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
        <Text strong style={{ display: 'block', marginBottom: spacing.sm }}>
          {t('skillsModal.skillContent')} <Text type="danger">*</Text>
        </Text>

        {showEditor ? (
          <TextArea
            value={editedContent}
            onChange={(e) => onContentChange(e.target.value)}
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
              padding: spacing.lg,
              border: '1px solid #d9d9d9',
              borderRadius: borderRadius.md,
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

      {showEditor ? (
        <Flex
          gap={spacing.sm}
          justify="flex-end"
          style={{ marginTop: spacing.lg }}
        >
          <Button onClick={onCancel} disabled={isSaving}>
            {t('skillsModal.cancel')}
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={onSave}
            loading={isSaving}
            disabled={!hasChanges}
          >
            {t('skillsModal.save')}
          </Button>
        </Flex>
      ) : (
        <Flex justify="flex-end" style={{ marginTop: spacing.lg }}>
          <Button
            type="default"
            icon={<EditOutlined />}
            onClick={onEdit}
            disabled={isSaving}
          >
            {t('skillsModal.edit')}
          </Button>
        </Flex>
      )}
    </div>
  );
}
