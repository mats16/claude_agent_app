import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Input,
  Button,
  Alert,
  Typography,
  Flex,
  Tooltip,
  Switch,
  Divider,
} from 'antd';
import {
  EyeOutlined,
  EyeInvisibleOutlined,
  DeleteOutlined,
  SyncOutlined,
  KeyOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;

export interface UserSettings {
  userId: string;
  hasAccessToken: boolean;
  claudeConfigSync: boolean;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isInitialSetup?: boolean;
}

export default function SettingsModal({
  isOpen,
  onClose,
  isInitialSetup = false,
}: SettingsModalProps) {
  const { t } = useTranslation();
  const [token, setToken] = useState('');
  const [hasExistingToken, setHasExistingToken] = useState(false);
  const [claudeConfigSync, setClaudeConfigSync] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Fetch current settings when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/users/me/settings');
      if (response.ok) {
        const data: UserSettings = await response.json();
        setHasExistingToken(data.hasAccessToken);
        setClaudeConfigSync(data.claudeConfigSync);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setIsLoading(false);
      setToken('');
      setShowToken(false);
      setMessage(null);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const updates: { accessToken?: string; claudeConfigSync?: boolean } = {};

      if (token.trim()) {
        updates.accessToken = token.trim();
      }
      updates.claudeConfigSync = claudeConfigSync;

      const response = await fetch('/api/v1/users/me/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      if (token.trim()) {
        setHasExistingToken(true);
        setToken('');
      }
      setMessage({ type: 'success', text: t('settingsModal.saved') });
      window.dispatchEvent(new Event('settings-changed'));

      // Auto close after save for initial setup
      if (isInitialSetup) {
        setTimeout(() => {
          onClose();
        }, 1000);
      }
    } catch {
      setMessage({ type: 'error', text: t('settingsModal.saveFailed') });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteToken = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/v1/users/me/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: '' }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete token');
      }

      setHasExistingToken(false);
      setMessage({ type: 'success', text: t('settingsModal.tokenDeleted') });
      window.dispatchEvent(new Event('settings-changed'));
    } catch {
      setMessage({ type: 'error', text: t('settingsModal.saveFailed') });
    } finally {
      setIsSaving(false);
    }
  };

  const canSave = isInitialSetup ? token.trim() : true;

  return (
    <Modal
      title={
        isInitialSetup
          ? t('settingsModal.initialTitle')
          : t('settingsModal.title')
      }
      open={isOpen}
      onOk={handleSave}
      onCancel={isInitialSetup ? undefined : onClose}
      okText={isSaving ? t('common.saving') : t('common.save')}
      cancelText={t('common.close')}
      okButtonProps={{
        disabled: !canSave,
        loading: isSaving,
      }}
      cancelButtonProps={{
        disabled: isSaving,
        style: isInitialSetup ? { display: 'none' } : undefined,
      }}
      closable={!isInitialSetup}
      maskClosable={!isInitialSetup}
      keyboard={!isInitialSetup}
      width={520}
    >
      {isInitialSetup && (
        <Alert
          type="info"
          message={t('settingsModal.initialMessage')}
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {/* Access Token Section */}
      <div style={{ marginBottom: 24 }}>
        <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
          <KeyOutlined style={{ color: '#f5a623' }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('settingsModal.accessTokenTitle')}
          </Title>
        </Flex>

        <Alert
          type="warning"
          message={t('settingsModal.oboWarning')}
          style={{ marginBottom: 12 }}
          showIcon
        />

        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          {t('settingsModal.accessTokenDescription')}
        </Text>

        {hasExistingToken && (
          <Flex
            align="center"
            gap={8}
            style={{
              padding: '8px 12px',
              background: '#f5f5f5',
              borderRadius: 6,
              marginBottom: 12,
            }}
          >
            <Text style={{ flex: 1, color: '#52c41a' }}>
              {t('settingsModal.tokenConfigured')}
            </Text>
            <Tooltip title={t('settingsModal.deleteToken')}>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={handleDeleteToken}
                loading={isSaving}
              />
            </Tooltip>
          </Flex>
        )}

        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          {hasExistingToken
            ? t('settingsModal.replaceToken')
            : t('settingsModal.enterToken')}
        </Text>
        <Input.Password
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={t('settingsModal.tokenPlaceholder')}
          disabled={isSaving || isLoading}
          iconRender={(visible) =>
            visible ? <EyeOutlined /> : <EyeInvisibleOutlined />
          }
        />
      </div>

      <Divider style={{ margin: '16px 0' }} />

      {/* Claude Config Sync Section */}
      <div style={{ marginBottom: 16 }}>
        <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
          <SyncOutlined style={{ color: '#f5a623' }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('settingsModal.claudeConfigSyncTitle')}
          </Title>
        </Flex>

        <Flex justify="space-between" align="center">
          <div style={{ flex: 1, marginRight: 16 }}>
            <Text type="secondary">
              {t('settingsModal.claudeConfigSyncDescription')}
            </Text>
          </div>
          <Switch
            checked={claudeConfigSync}
            onChange={setClaudeConfigSync}
            disabled={isSaving || isLoading}
          />
        </Flex>
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
