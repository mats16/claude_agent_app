/**
 * Preset subagent import modal component
 * Displays list of available presets for import
 */

import { useTranslation } from 'react-i18next';
import { Modal, List, Flex, Spin, Typography, Empty, Tag } from 'antd';
import type { PresetSubagent } from '../../hooks/useSubagents';
import { colors, spacing } from '../../styles/theme';

const { Text } = Typography;

interface PresetSubagentImportModalProps {
  isOpen: boolean;
  presetSubagents: PresetSubagent[];
  selectedPreset: string | null;
  loading: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSelectPreset: (presetName: string) => void;
  onImport: () => void;
}

export default function PresetSubagentImportModal({
  isOpen,
  presetSubagents,
  selectedPreset,
  loading,
  isSaving,
  onClose,
  onSelectPreset,
  onImport,
}: PresetSubagentImportModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      title={t('subagentModal.importPresetTitle')}
      open={isOpen}
      onCancel={onClose}
      onOk={onImport}
      okText={t('subagentModal.import')}
      cancelText={t('subagentModal.cancel')}
      okButtonProps={{ disabled: !selectedPreset, loading: isSaving }}
      cancelButtonProps={{ disabled: isSaving }}
      width={600}
    >
      {loading ? (
        <Flex justify="center" align="center" style={{ padding: spacing.xxl }}>
          <Spin />
        </Flex>
      ) : presetSubagents.length === 0 ? (
        <Empty description={t('subagentModal.noPresets')} />
      ) : (
        <List
          dataSource={presetSubagents}
          renderItem={(preset) => {
            const isSelected = selectedPreset === preset.name;

            return (
              <List.Item
                key={preset.name}
                onClick={() => onSelectPreset(preset.name)}
                style={{
                  cursor: 'pointer',
                  padding: `${spacing.md}px ${spacing.lg}px`,
                  background: isSelected
                    ? colors.backgroundSecondary
                    : 'transparent',
                  borderLeft: isSelected
                    ? `3px solid ${colors.brand}`
                    : '3px solid transparent',
                }}
              >
                <List.Item.Meta
                  title={
                    <Flex align="center" gap={spacing.sm}>
                      <Text
                        strong={isSelected}
                        style={{ fontFamily: 'monospace' }}
                      >
                        {preset.name}
                      </Text>
                      {preset.model && (
                        <Tag color="blue" style={{ marginLeft: spacing.xs }}>
                          {preset.model}
                        </Tag>
                      )}
                    </Flex>
                  }
                  description={
                    <div>
                      <div>{preset.description}</div>
                      {preset.tools && (
                        <Text
                          type="secondary"
                          style={{
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            marginTop: spacing.xs,
                            display: 'block',
                          }}
                        >
                          Tools: {preset.tools}
                        </Text>
                      )}
                    </div>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}
    </Modal>
  );
}
