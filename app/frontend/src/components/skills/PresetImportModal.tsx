/**
 * Preset skill import modal component
 * Displays list of available skills from Databricks and Anthropic GitHub repositories
 * Shows detail view when a skill is selected, with import option
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  List,
  Flex,
  Spin,
  Typography,
  Empty,
  Tabs,
  Alert,
  Button,
  Descriptions,
} from 'antd';
import { GithubOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import type { PublicSkillDetail } from '../../hooks/useSkills';
import { spacing } from '../../styles/theme';

const { Text, Title } = Typography;

export type ImportTab = 'databricks' | 'anthropic';

interface PresetImportModalProps {
  isOpen: boolean;
  // Databricks skills
  databricksSkillNames: string[];
  databricksLoading: boolean;
  databricksError: string | null;
  databricksCached: boolean;
  // Anthropic skills
  anthropicSkillNames: string[];
  anthropicLoading: boolean;
  anthropicError: string | null;
  anthropicCached: boolean;
  // Common
  isSaving: boolean;
  activeTab: ImportTab;
  onClose: () => void;
  onTabChange: (tab: ImportTab) => void;
  onFetchDetail: (
    source: 'databricks' | 'anthropic',
    skillName: string
  ) => Promise<PublicSkillDetail | null>;
  onImport: (detail: PublicSkillDetail) => Promise<boolean>;
}

export default function PresetImportModal({
  isOpen,
  databricksSkillNames,
  databricksLoading,
  databricksError,
  databricksCached,
  anthropicSkillNames,
  anthropicLoading,
  anthropicError,
  anthropicCached,
  isSaving,
  activeTab,
  onClose,
  onTabChange,
  onFetchDetail,
  onImport,
}: PresetImportModalProps) {
  const { t } = useTranslation();
  const [selectedDetail, setSelectedDetail] =
    useState<PublicSkillDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const handleSelectSkill = async (skillName: string) => {
    setDetailLoading(true);
    setDetailError(null);

    const detail = await onFetchDetail(activeTab, skillName);
    if (detail) {
      setSelectedDetail(detail);
    } else {
      setDetailError(t('skillsModal.fetchDetailError'));
    }
    setDetailLoading(false);
  };

  const handleBack = () => {
    setSelectedDetail(null);
    setDetailError(null);
  };

  const handleImport = async () => {
    if (selectedDetail) {
      const success = await onImport(selectedDetail);
      if (success) {
        setSelectedDetail(null);
        onClose();
      }
    }
  };

  const handleClose = () => {
    setSelectedDetail(null);
    setDetailError(null);
    onClose();
  };

  const renderSkillList = (
    skillNames: string[],
    emptyMessage: string,
    loading: boolean,
    error: string | null
  ) => {
    if (error) {
      return (
        <Alert
          type="error"
          message={
            error === 'RATE_LIMITED'
              ? t('skillsModal.rateLimitError')
              : t('skillsModal.networkError')
          }
          style={{ marginBottom: spacing.md }}
        />
      );
    }

    if (loading) {
      return (
        <Flex justify="center" align="center" style={{ padding: spacing.xxl }}>
          <Spin />
        </Flex>
      );
    }

    if (skillNames.length === 0) {
      return <Empty description={emptyMessage} />;
    }

    return (
      <List
        dataSource={skillNames}
        style={{ maxHeight: 400, overflowY: 'auto' }}
        renderItem={(name) => (
          <List.Item
            key={name}
            onClick={() => handleSelectSkill(name)}
            style={{
              cursor: 'pointer',
              padding: `${spacing.md}px ${spacing.lg}px`,
            }}
            className="skill-list-item"
          >
            <Text style={{ fontFamily: 'monospace' }}>{name}</Text>
          </List.Item>
        )}
      />
    );
  };

  const renderDetailView = () => {
    if (detailLoading) {
      return (
        <Flex justify="center" align="center" style={{ padding: spacing.xxl }}>
          <Spin />
        </Flex>
      );
    }

    if (detailError) {
      return (
        <>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
            style={{ marginBottom: spacing.md }}
          >
            {t('skillsModal.back')}
          </Button>
          <Alert type="error" message={detailError} />
        </>
      );
    }

    if (!selectedDetail) {
      return null;
    }

    return (
      <>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={handleBack}
          style={{ marginBottom: spacing.md }}
        >
          {t('skillsModal.back')}
        </Button>
        <Title level={5} style={{ marginBottom: spacing.md }}>
          {selectedDetail.name}
        </Title>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label={t('skillsModal.detailName')}>
            <Text style={{ fontFamily: 'monospace' }}>
              {selectedDetail.name}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('skillsModal.detailDescription')}>
            {selectedDetail.description || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('skillsModal.detailVersion')}>
            <Text style={{ fontFamily: 'monospace' }}>
              {selectedDetail.version}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('skillsModal.detailRepo')}>
            <Text style={{ fontFamily: 'monospace', fontSize: '12px' }}>
              {selectedDetail.repo}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('skillsModal.detailPath')}>
            <Text style={{ fontFamily: 'monospace', fontSize: '12px' }}>
              {selectedDetail.path}
            </Text>
          </Descriptions.Item>
        </Descriptions>
      </>
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
      children: renderSkillList(
        databricksSkillNames,
        t('skillsModal.noDatabricksSkills'),
        databricksLoading,
        databricksError
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
      children: renderSkillList(
        anthropicSkillNames,
        t('skillsModal.noAnthropicSkills'),
        anthropicLoading,
        anthropicError
      ),
    },
  ];

  const isDetailView = selectedDetail !== null || detailLoading || detailError;

  return (
    <Modal
      title={t('skillsModal.importPresetTitle')}
      open={isOpen}
      onCancel={handleClose}
      onOk={handleImport}
      okText={t('skillsModal.import')}
      cancelText={t('skillsModal.cancel')}
      okButtonProps={{
        disabled: !selectedDetail,
        loading: isSaving,
        style: { display: isDetailView && selectedDetail ? 'inline' : 'none' },
      }}
      cancelButtonProps={{ disabled: isSaving }}
      width={600}
      footer={
        isDetailView && selectedDetail
          ? undefined
          : isDetailView
            ? null
            : undefined
      }
    >
      {isDetailView ? (
        renderDetailView()
      ) : (
        <Tabs
          activeKey={activeTab}
          onChange={(key) => onTabChange(key as ImportTab)}
          items={tabItems}
        />
      )}
    </Modal>
  );
}
