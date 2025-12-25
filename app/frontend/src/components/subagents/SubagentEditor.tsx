/**
 * Subagent editor component for the right panel
 * Handles viewing and editing subagent details
 */

import { useTranslation } from 'react-i18next';
import { Button, Input, Flex, Typography, Empty, Select } from 'antd';
import { SaveOutlined, EditOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { colors, spacing, borderRadius } from '../../styles/theme';

const { TextArea } = Input;
const { Text } = Typography;

interface SubagentEditorProps {
  isCreating: boolean;
  isEditing: boolean;
  isSaving: boolean;
  hasChanges: boolean;
  editedName: string;
  editedDescription: string;
  editedTools: string;
  editedModel: 'sonnet' | 'opus' | undefined;
  editedContent: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onToolsChange: (value: string) => void;
  onModelChange: (value: 'sonnet' | 'opus' | undefined) => void;
  onContentChange: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function SubagentEditor({
  isCreating,
  isEditing,
  isSaving,
  hasChanges,
  editedName,
  editedDescription,
  editedTools,
  editedModel,
  editedContent,
  onNameChange,
  onDescriptionChange,
  onToolsChange,
  onModelChange,
  onContentChange,
  onEdit,
  onSave,
  onCancel,
}: SubagentEditorProps) {
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
          <Empty description={t('subagentModal.selectOrCreate')} />
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

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: spacing.xxl,
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      <Flex gap={spacing.lg} style={{ marginBottom: spacing.lg }}>
        <div style={{ flex: 1 }}>
          <Text strong style={{ display: 'block', marginBottom: spacing.sm }}>
            {t('subagentModal.subagentName')}
          </Text>
          <Input
            value={editedName}
            onChange={handleNameChange}
            placeholder={t('subagentModal.subagentNamePlaceholder')}
            disabled={!isCreating || isSaving}
            style={{ fontFamily: 'monospace' }}
          />
        </div>

        <div style={{ width: 200 }}>
          <Text strong style={{ display: 'block', marginBottom: spacing.sm }}>
            {t('subagentModal.subagentModel')}
          </Text>
          <Select
            value={editedModel}
            onChange={onModelChange}
            placeholder={t('subagentModal.subagentModelPlaceholder')}
            disabled={!showEditor || isSaving}
            allowClear
            style={{ width: '100%' }}
            options={[
              {
                value: 'sonnet',
                label: t('subagentModal.subagentModelSonnet'),
              },
              { value: 'opus', label: t('subagentModal.subagentModelOpus') },
            ]}
          />
        </div>
      </Flex>

      <div style={{ marginBottom: spacing.lg }}>
        <Text strong style={{ display: 'block', marginBottom: spacing.sm }}>
          {t('subagentModal.subagentDescription')} <Text type="danger">*</Text>
        </Text>
        <TextArea
          value={editedDescription}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder={t('subagentModal.subagentDescriptionPlaceholder')}
          disabled={!showEditor || isSaving}
          rows={2}
        />
      </div>

      <div style={{ marginBottom: spacing.lg }}>
        <Text strong style={{ display: 'block', marginBottom: spacing.sm }}>
          {t('subagentModal.subagentTools')}
        </Text>
        <Input
          value={editedTools}
          onChange={(e) => onToolsChange(e.target.value)}
          placeholder={t('subagentModal.subagentToolsPlaceholder')}
          disabled={!showEditor || isSaving}
          style={{ fontFamily: 'monospace' }}
        />
        <Text
          type="secondary"
          style={{ fontSize: 12, display: 'block', marginTop: spacing.xs }}
        >
          {t('subagentModal.subagentToolsHint')}
        </Text>
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
          {t('subagentModal.subagentContent')} <Text type="danger">*</Text>
        </Text>

        {showEditor ? (
          <TextArea
            value={editedContent}
            onChange={(e) => onContentChange(e.target.value)}
            placeholder={t('subagentModal.subagentContentPlaceholder')}
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
            {t('subagentModal.cancel')}
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={onSave}
            loading={isSaving}
            disabled={!hasChanges}
          >
            {t('subagentModal.save')}
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
            {t('subagentModal.edit')}
          </Button>
        </Flex>
      )}
    </div>
  );
}
