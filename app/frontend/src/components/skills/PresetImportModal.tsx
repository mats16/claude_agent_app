/**
 * Preset skill import modal component
 * Displays list of available presets and GitHub skills for import
 */

import { useTranslation } from 'react-i18next';
import { Modal, List, Flex, Spin, Typography, Empty, Tabs, Alert } from 'antd';
import { GithubOutlined, FolderOutlined } from '@ant-design/icons';
import type { PresetSkill, GitHubSkill } from '../../hooks/useSkills';
import { colors, spacing } from '../../styles/theme';

const { Text } = Typography;

export type ImportTab = 'local' | 'github';

interface PresetImportModalProps {
  isOpen: boolean;
  // Local presets
  presetSkills: PresetSkill[];
  selectedPreset: string | null;
  loading: boolean;
  // GitHub skills
  githubSkills: GitHubSkill[];
  selectedGitHubSkill: string | null;
  githubLoading: boolean;
  githubError: string | null;
  githubCached: boolean;
  // Common
  isSaving: boolean;
  activeTab: ImportTab;
  onClose: () => void;
  onSelectPreset: (presetName: string) => void;
  onSelectGitHubSkill: (skillName: string) => void;
  onImportPreset: () => void;
  onImportGitHubSkill: () => void;
  onTabChange: (tab: ImportTab) => void;
}

export default function PresetImportModal({
  isOpen,
  presetSkills,
  selectedPreset,
  loading,
  githubSkills,
  selectedGitHubSkill,
  githubLoading,
  githubError,
  githubCached,
  isSaving,
  activeTab,
  onClose,
  onSelectPreset,
  onSelectGitHubSkill,
  onImportPreset,
  onImportGitHubSkill,
  onTabChange,
}: PresetImportModalProps) {
  const { t } = useTranslation();

  const handleImport = () => {
    if (activeTab === 'local') {
      onImportPreset();
    } else {
      onImportGitHubSkill();
    }
  };

  const isImportDisabled =
    activeTab === 'local' ? !selectedPreset : !selectedGitHubSkill;

  const renderSkillList = (
    skills: (PresetSkill | GitHubSkill)[],
    selectedName: string | null,
    onSelect: (name: string) => void,
    emptyMessage: string,
    showVersion: boolean = true
  ) => {
    if (skills.length === 0) {
      return <Empty description={emptyMessage} />;
    }

    return (
      <List
        dataSource={skills}
        style={{ maxHeight: 400, overflowY: 'auto' }}
        renderItem={(skill) => {
          const isSelected = selectedName === skill.name;

          return (
            <List.Item
              key={skill.name}
              onClick={() => onSelect(skill.name)}
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
                      {skill.name}
                    </Text>
                    {showVersion && (
                      <Text
                        type="secondary"
                        style={{ fontSize: '12px', fontFamily: 'monospace' }}
                      >
                        v{skill.version}
                      </Text>
                    )}
                  </Flex>
                }
                description={skill.description}
              />
            </List.Item>
          );
        }}
      />
    );
  };

  const tabItems = [
    {
      key: 'local',
      label: (
        <Flex align="center" gap={spacing.xs}>
          <FolderOutlined />
          {t('skillsModal.localPresets')}
        </Flex>
      ),
      children: loading ? (
        <Flex justify="center" align="center" style={{ padding: spacing.xxl }}>
          <Spin />
        </Flex>
      ) : (
        renderSkillList(
          presetSkills,
          selectedPreset,
          onSelectPreset,
          t('skillsModal.noPresets'),
          true
        )
      ),
    },
    {
      key: 'github',
      label: (
        <Flex align="center" gap={spacing.xs}>
          <GithubOutlined />
          {t('skillsModal.githubSkills')}
          {githubCached && (
            <Text
              type="secondary"
              style={{ fontSize: '11px', marginLeft: spacing.xs }}
            >
              {t('skillsModal.cachedData')}
            </Text>
          )}
        </Flex>
      ),
      children: (
        <>
          {githubError && (
            <Alert
              type="error"
              message={
                githubError === 'RATE_LIMITED'
                  ? t('skillsModal.rateLimitError')
                  : t('skillsModal.networkError')
              }
              style={{ marginBottom: spacing.md }}
            />
          )}
          {githubLoading ? (
            <Flex
              justify="center"
              align="center"
              style={{ padding: spacing.xxl }}
            >
              <Spin />
            </Flex>
          ) : (
            renderSkillList(
              githubSkills,
              selectedGitHubSkill,
              onSelectGitHubSkill,
              t('skillsModal.noGitHubSkills'),
              false
            )
          )}
        </>
      ),
    },
  ];

  return (
    <Modal
      title={t('skillsModal.importPresetTitle')}
      open={isOpen}
      onCancel={onClose}
      onOk={handleImport}
      okText={t('skillsModal.import')}
      cancelText={t('skillsModal.cancel')}
      okButtonProps={{ disabled: isImportDisabled, loading: isSaving }}
      cancelButtonProps={{ disabled: isSaving }}
      width={600}
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => onTabChange(key as ImportTab)}
        items={tabItems}
      />
    </Modal>
  );
}
