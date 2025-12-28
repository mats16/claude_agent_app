import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Modal,
  Typography,
  List,
  Spin,
  Flex,
  Button,
  Empty,
  message,
  ConfigProvider,
} from 'antd';
import { BugOutlined, SearchOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { colors, borderRadius } from '../styles/theme';
import {
  useSkills,
  type PublicSkillDetail,
} from '../hooks/useSkills';
import PresetImportModal, {
  type ImportTab,
} from './skills/PresetImportModal';

const { Text } = Typography;

interface JobRunState {
  life_cycle_state: string;
  result_state?: 'SUCCESS' | 'FAILED' | 'TIMED_OUT' | 'CANCELED';
  state_message?: string;
}

interface JobRun {
  job_id: number;
  run_id: number;
  run_name?: string;
  state: JobRunState;
  start_time?: number;
  end_time?: number;
}

interface ListRunsResponse {
  runs?: JobRun[];
  has_more?: boolean;
  next_page_token?: string;
}

interface QuickstartJobErrorsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QuickstartJobErrorsModal({
  isOpen,
  onClose,
}: QuickstartJobErrorsModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [failedJobs, setFailedJobs] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingSessionFor, setCreatingSessionFor] = useState<number | null>(
    null
  );

  // Skill import state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [activeImportTab, setActiveImportTab] =
    useState<ImportTab>('databricks');
  const [isSavingSkill, setIsSavingSkill] = useState(false);

  const {
    fetchSkills,
    databricksSkillNames,
    databricksLoading,
    databricksError,
    anthropicSkillNames,
    anthropicLoading,
    anthropicError,
    fetchDatabricksSkillNames,
    fetchAnthropicSkillNames,
    fetchSkillDetail,
    importSkill,
  } = useSkills();

  // Fetch skill names when import modal opens
  useEffect(() => {
    if (isImportModalOpen && activeImportTab === 'databricks') {
      fetchDatabricksSkillNames();
    }
  }, [isImportModalOpen, activeImportTab, fetchDatabricksSkillNames]);

  useEffect(() => {
    if (isImportModalOpen && activeImportTab === 'anthropic') {
      fetchAnthropicSkillNames();
    }
  }, [isImportModalOpen, activeImportTab, fetchAnthropicSkillNames]);

  const handleImportSkill = useCallback(
    async (detail: PublicSkillDetail): Promise<boolean> => {
      setIsSavingSkill(true);
      const success = await importSkill(detail);
      setIsSavingSkill(false);

      if (success) {
        message.success(t('skillsModal.importSuccess'));
        await fetchSkills();
        return true;
      } else {
        message.error(t('skillsModal.importFailed'));
        return false;
      }
    },
    [importSkill, fetchSkills, t]
  );

  const fetchFailedJobs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/jobs/runs/list?limit=25');
      if (!response.ok) {
        throw new Error('Failed to fetch job runs');
      }
      const data: ListRunsResponse = await response.json();

      // Filter for FAILED runs only (state.result_state === 'FAILED')
      const failed = (data.runs || []).filter(
        (run) => run.state.result_state === 'FAILED'
      );

      setFailedJobs(failed);
    } catch {
      setFailedJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchFailedJobs();
    }
  }, [isOpen, fetchFailedJobs]);

  const handleInvestigate = async (job: JobRun) => {
    setCreatingSessionFor(job.run_id);

    try {
      const jobName = job.run_name || `Job ${job.job_id}`;

      const response = await fetch('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [
            {
              uuid: crypto.randomUUID(),
              session_id: '',
              type: 'user',
              message: {
                role: 'user',
                content: t('quickstartJobs.initialMessage', {
                  jobName,
                  jobId: job.job_id,
                  runId: job.run_id,
                }),
              },
            },
          ],
          session_context: {
            model: 'databricks-claude-sonnet-4-5',
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const data = await response.json();
      onClose();
      navigate(`/sessions/${data.session_id}`);
    } catch {
      message.error('Failed to create investigation session');
    } finally {
      setCreatingSessionFor(null);
    }
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <Modal
      title={
        <Flex align="center" gap={8}>
          <BugOutlined style={{ color: colors.brand }} />
          <span>{t('quickstartJobs.title')}</span>
        </Flex>
      }
      open={isOpen}
      onCancel={onClose}
      width={600}
      footer={<Button onClick={onClose}>{t('common.cancel')}</Button>}
    >
      <Flex
        align="center"
        gap={8}
        style={{
          padding: '8px 12px',
          marginBottom: 16,
          background: '#e6f4ff',
          borderRadius: borderRadius.md,
          border: '1px solid #91caff',
        }}
      >
        <InfoCircleOutlined style={{ color: '#1677ff', fontSize: 16 }} />
        <Text style={{ flex: 1 }}>
          {t('quickstartJobs.importSkillLink')}
        </Text>
        <ConfigProvider theme={{ token: { colorPrimary: '#1677ff' } }}>
          <Button
            size="small"
            onClick={() => setIsImportModalOpen(true)}
          >
            {t('skillsModal.import')}
          </Button>
        </ConfigProvider>
      </Flex>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {t('quickstartJobs.subtitle')}
      </Text>
      <div
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.md,
          maxHeight: 400,
          overflow: 'auto',
        }}
      >
        {loading ? (
          <Flex justify="center" align="center" style={{ padding: 48 }}>
            <Spin />
            <Text type="secondary" style={{ marginLeft: 8 }}>
              {t('quickstartJobs.loading')}
            </Text>
          </Flex>
        ) : failedJobs.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('quickstartJobs.noFailedJobs')}
            style={{ padding: 48 }}
          />
        ) : (
          <List
            size="small"
            dataSource={failedJobs}
            renderItem={(job) => (
              <List.Item
                style={{
                  padding: '12px 16px',
                  borderBottom: `1px solid ${colors.border}`,
                }}
                actions={[
                  <Button
                    key="investigate"
                    type="primary"
                    size="small"
                    icon={<SearchOutlined />}
                    loading={creatingSessionFor === job.run_id}
                    onClick={() => handleInvestigate(job)}
                  >
                    {t('quickstartJobs.investigate')}
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Text
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 13,
                      }}
                    >
                      {job.run_name || `Job ${job.job_id}`}
                    </Text>
                  }
                  description={
                    <Flex gap={8} align="center">
                      <Text
                        type="secondary"
                        style={{ fontSize: 11, fontFamily: 'monospace' }}
                      >
                        run_id: {job.run_id}
                      </Text>
                      {job.end_time && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {formatTime(job.end_time)}
                        </Text>
                      )}
                    </Flex>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </div>

      <PresetImportModal
        isOpen={isImportModalOpen}
        databricksSkillNames={databricksSkillNames}
        databricksLoading={databricksLoading}
        databricksError={databricksError}
        anthropicSkillNames={anthropicSkillNames}
        anthropicLoading={anthropicLoading}
        anthropicError={anthropicError}
        isSaving={isSavingSkill}
        activeTab={activeImportTab}
        onClose={() => setIsImportModalOpen(false)}
        onTabChange={setActiveImportTab}
        onFetchDetail={fetchSkillDetail}
        onImport={handleImportSkill}
      />
    </Modal>
  );
}
