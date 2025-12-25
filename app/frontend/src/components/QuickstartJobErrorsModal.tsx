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
} from 'antd';
import { BugOutlined, SearchOutlined } from '@ant-design/icons';
import { colors, borderRadius } from '../styles/theme';

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
    </Modal>
  );
}
