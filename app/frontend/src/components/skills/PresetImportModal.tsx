/**
 * Preset skill import modal component
 * Displays list of available skills from Databricks and Anthropic GitHub repositories
 */

import { useTranslation } from 'react-i18next';
import { Modal, List, Flex, Spin, Typography, Empty, Tabs, Alert } from 'antd';
import { GithubOutlined } from '@ant-design/icons';
import type { GitHubSkill } from '../../hooks/useSkills';
import { colors, spacing } from '../../styles/theme';

const { Text } = Typography;

export type ImportTab = 'databricks' | 'anthropic';

interface PresetImportModalProps {
  isOpen: boolean;
  // Databricks skills
  databricksSkills: GitHubSkill[];
  selectedDatabricksSkill: string | null;
  databricksLoading: boolean;
  databricksError: string | null;
  databricksCached: boolean;
  // Anthropic skills
  anthropicSkills: GitHubSkill[];
  selectedAnthropicSkill: string | null;
  anthropicLoading: boolean;
  anthropicError: string | null;
  anthropicCached: boolean;
  // Common
  isSaving: boolean;
  activeTab: ImportTab;
  onClose: () => void;
  onSelectDatabricksSkill: (skillName: string) => void;
  onSelectAnthropicSkill: (skillName: string) => void;
  onImportDatabricksSkill: () => void;
  onImportAnthropicSkill: () => void;
  onTabChange: (tab: ImportTab) => void;
}

export default function PresetImportModal({
  isOpen,
  databricksSkills,
  selectedDatabricksSkill,
  databricksLoading,
  databricksError,
  databricksCached,
  anthropicSkills,
  selectedAnthropicSkill,
  anthropicLoading,
  anthropicError,
  anthropicCached,
  isSaving,
  activeTab,
  onClose,
  onSelectDatabricksSkill,
  onSelectAnthropicSkill,
  onImportDatabricksSkill,
  onImportAnthropicSkill,
  onTabChange,
}: PresetImportModalProps) {
  const { t } = useTranslation();

  const handleImport = () => {
    if (activeTab === 'databricks') {
      onImportDatabricksSkill();
    } else {
      onImportAnthropicSkill();
    }
  };

  const isImportDisabled =
    activeTab === 'databricks' ? !selectedDatabricksSkill : !selectedAnthropicSkill;

  const renderSkillList = (
    skills: GitHubSkill[],
    selectedName: string | null,
    onSelect: (name: string) => void,
    emptyMessage: string
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
                    {skill.version && (
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
      key: 'databricks',
      label: (
        <Flex align="center" gap={spacing.xs}>
          <GithubOutlined />
          {t('skillsModal.databricksSkills')}
          {databricksCached && (
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
          {databricksError && (
            <Alert
              type="error"
              message={
                databricksError === 'RATE_LIMITED'
                  ? t('skillsModal.rateLimitError')
                  : t('skillsModal.networkError')
              }
              style={{ marginBottom: spacing.md }}
            />
          )}
          {databricksLoading ? (
            <Flex
              justify="center"
              align="center"
              style={{ padding: spacing.xxl }}
            >
              <Spin />
            </Flex>
          ) : (
            renderSkillList(
              databricksSkills,
              selectedDatabricksSkill,
              onSelectDatabricksSkill,
              t('skillsModal.noDatabricksSkills')
            )
          )}
        </>
      ),
    },
    {
      key: 'anthropic',
      label: (
        <Flex align="center" gap={spacing.xs}>
          <GithubOutlined />
          {t('skillsModal.anthropicSkills')}
          {anthropicCached && (
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
          {anthropicError && (
            <Alert
              type="error"
              message={
                anthropicError === 'RATE_LIMITED'
                  ? t('skillsModal.rateLimitError')
                  : t('skillsModal.networkError')
              }
              style={{ marginBottom: spacing.md }}
            />
          )}
          {anthropicLoading ? (
            <Flex
              justify="center"
              align="center"
              style={{ padding: spacing.xxl }}
            >
              <Spin />
            </Flex>
          ) : (
            renderSkillList(
              anthropicSkills,
              selectedAnthropicSkill,
              onSelectAnthropicSkill,
              t('skillsModal.noAnthropicSkills')
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
