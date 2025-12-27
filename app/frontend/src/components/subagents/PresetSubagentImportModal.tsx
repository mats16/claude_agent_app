/**
 * Preset subagent import modal component
 * Displays list of available agents from Databricks GitHub repository
 */

import { useTranslation } from 'react-i18next';
import { Modal, List, Flex, Spin, Typography, Empty, Tag, Alert } from 'antd';
import { GithubOutlined } from '@ant-design/icons';
import type { GitHubSubagent } from '../../hooks/useSubagents';
import { colors, spacing } from '../../styles/theme';

const { Text, Title } = Typography;

interface PresetSubagentImportModalProps {
  isOpen: boolean;
  databricksAgents: GitHubSubagent[];
  selectedAgent: string | null;
  loading: boolean;
  error: string | null;
  cached: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSelectAgent: (agentName: string) => void;
  onImport: () => void;
}

export default function PresetSubagentImportModal({
  isOpen,
  databricksAgents,
  selectedAgent,
  loading,
  error,
  cached,
  isSaving,
  onClose,
  onSelectAgent,
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
      okButtonProps={{ disabled: !selectedAgent, loading: isSaving }}
      cancelButtonProps={{ disabled: isSaving }}
      width={600}
    >
      <Flex
        align="center"
        gap={spacing.sm}
        style={{ marginBottom: spacing.md }}
      >
        <GithubOutlined />
        <Title level={5} style={{ margin: 0 }}>
          {t('subagentModal.databricksAgents')}
        </Title>
        {cached && (
          <Text type="secondary" style={{ fontSize: '11px' }}>
            {t('subagentModal.cachedData')}
          </Text>
        )}
      </Flex>

      {error && (
        <Alert
          type="error"
          message={
            error === 'RATE_LIMITED'
              ? t('subagentModal.rateLimitError')
              : t('subagentModal.networkError')
          }
          style={{ marginBottom: spacing.md }}
        />
      )}

      {loading ? (
        <Flex justify="center" align="center" style={{ padding: spacing.xxl }}>
          <Spin />
        </Flex>
      ) : databricksAgents.length === 0 ? (
        <Empty description={t('subagentModal.noDatabricksAgents')} />
      ) : (
        <List
          dataSource={databricksAgents}
          style={{ maxHeight: 400, overflowY: 'auto' }}
          renderItem={(agent) => {
            const isSelected = selectedAgent === agent.name;

            return (
              <List.Item
                key={agent.name}
                onClick={() => onSelectAgent(agent.name)}
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
                        {agent.name}
                      </Text>
                      {agent.model && (
                        <Tag color="blue" style={{ marginLeft: spacing.xs }}>
                          {agent.model}
                        </Tag>
                      )}
                    </Flex>
                  }
                  description={
                    <div>
                      <div>{agent.description}</div>
                      {agent.tools && agent.tools.length > 0 && (
                        <Text
                          type="secondary"
                          style={{
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            marginTop: spacing.xs,
                            display: 'block',
                          }}
                        >
                          Tools: {agent.tools.join(', ')}
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
