import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Alert, Typography, Flex, Switch, Divider } from 'antd';
import {
  SaveOutlined,
  SyncOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useUser, UserSettings } from '../contexts/UserContext';

const { Text, Title } = Typography;

export type { UserSettings };

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t } = useTranslation();
  const { userSettings } = useUser();
  const [claudeConfigSync, setClaudeConfigSync] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Sync claudeConfigSync state with userSettings
  useEffect(() => {
    if (userSettings) {
      setClaudeConfigSync(userSettings.claudeConfigSync);
    }
  }, [userSettings]);

  const handleManualPull = async () => {
    setIsPulling(true);
    setMessage(null);
    try {
      const response = await fetch('/api/v1/settings/claude-backup/pull', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to pull claude config');
      }

      setMessage({ type: 'success', text: t('settingsModal.pullSuccess') });
    } catch {
      setMessage({ type: 'error', text: t('settingsModal.pullFailed') });
    } finally {
      setIsPulling(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/v1/settings/claude-backup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claudeConfigSync }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setMessage({ type: 'success', text: t('settingsModal.saved') });
      window.dispatchEvent(new Event('settings-changed'));
    } catch {
      setMessage({ type: 'error', text: t('settingsModal.saveFailed') });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      title={
        <Flex align="center" gap={8}>
          <SaveOutlined style={{ color: '#f5a623' }} />
          {t('settingsModal.title')}
        </Flex>
      }
      open={isOpen}
      onOk={handleSave}
      onCancel={onClose}
      okText={isSaving ? t('common.saving') : t('common.save')}
      cancelText={t('common.close')}
      okButtonProps={{ loading: isSaving }}
      cancelButtonProps={{ disabled: isSaving }}
      width={500}
    >
      {/* Auto Backup Section */}
      <div style={{ marginBottom: 16 }}>
        <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
          <SyncOutlined style={{ color: '#f5a623' }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('settingsModal.autoBackupTitle')}
          </Title>
        </Flex>

        <Flex
          justify="space-between"
          align="center"
          style={{ marginBottom: 12 }}
        >
          <div style={{ flex: 1, marginRight: 16 }}>
            <Text type="secondary">
              {t('settingsModal.autoBackupDescription')}
            </Text>
          </div>
          <Switch
            checked={claudeConfigSync}
            onChange={setClaudeConfigSync}
            disabled={isSaving}
          />
        </Flex>

        <Divider style={{ margin: '16px 0' }} />

        {/* Manual Pull Section */}
        <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
          <DownloadOutlined style={{ color: '#f5a623' }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('settingsModal.manualPullButton')}
          </Title>
        </Flex>

        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          {t('settingsModal.manualPullDescription')}
        </Text>

        <Button
          icon={<DownloadOutlined />}
          onClick={handleManualPull}
          loading={isPulling}
          disabled={isSaving}
        >
          {t('settingsModal.manualPullButton')}
        </Button>
      </div>

      {message && (
        <Alert
          type={message.type}
          message={message.text}
          showIcon
          style={{ marginTop: 16 }}
        />
      )}
    </Modal>
  );
}
