/**
 * Preset skill import modal component
 * Displays list of available presets for import
 */

import { useTranslation } from 'react-i18next';
import { Modal, List, Flex, Spin, Typography, Empty } from 'antd';
import type { PresetSkill } from '../../hooks/useSkills';
import { colors, spacing } from '../../styles/theme';

const { Text } = Typography;

interface PresetImportModalProps {
  isOpen: boolean;
  presetSkills: PresetSkill[];
  selectedPreset: string | null;
  loading: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSelectPreset: (presetName: string) => void;
  onImport: () => void;
}

export default function PresetImportModal({
  isOpen,
  presetSkills,
  selectedPreset,
  loading,
  isSaving,
  onClose,
  onSelectPreset,
  onImport,
}: PresetImportModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      title={t('skillsModal.importPresetTitle')}
      open={isOpen}
      onCancel={onClose}
      onOk={onImport}
      okText={t('skillsModal.import')}
      cancelText={t('skillsModal.cancel')}
      okButtonProps={{ disabled: !selectedPreset, loading: isSaving }}
      cancelButtonProps={{ disabled: isSaving }}
      width={600}
    >
      {loading ? (
        <Flex justify="center" align="center" style={{ padding: spacing.xxl }}>
          <Spin />
        </Flex>
      ) : presetSkills.length === 0 ? (
        <Empty description={t('skillsModal.noPresets')} />
      ) : (
        <List
          dataSource={presetSkills}
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
                      <Text
                        type="secondary"
                        style={{ fontSize: '12px', fontFamily: 'monospace' }}
                      >
                        v{preset.version}
                      </Text>
                    </Flex>
                  }
                  description={preset.description}
                />
              </List.Item>
            );
          }}
        />
      )}
    </Modal>
  );
}
