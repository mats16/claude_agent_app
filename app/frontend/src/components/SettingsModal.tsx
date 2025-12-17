import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Button,
  Alert,
  Typography,
  Flex,
  Switch,
  Divider,
  Spin,
} from 'antd';
import {
  SyncOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  FolderOpenOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useUser, UserSettings } from '../contexts/UserContext';

const { Text, Title, Link } = Typography;

export type { UserSettings };

interface ServicePrincipalInfo {
  displayName: string;
  applicationId: string | null;
  databricksHost: string | null;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isInitialSetup?: boolean;
  onPermissionGranted?: () => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  isInitialSetup = false,
  onPermissionGranted,
}: SettingsModalProps) {
  const { t } = useTranslation();
  const {
    userInfo,
    userSettings,
    isLoading: isUserLoading,
    refetchUserInfo,
  } = useUser();
  const [spInfo, setSpInfo] = useState<ServicePrincipalInfo | null>(null);
  const [claudeConfigSync, setClaudeConfigSync] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingPermission, setIsCheckingPermission] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const hasPermission = userInfo?.hasWorkspacePermission ?? null;
  const isLoading = isUserLoading || isCheckingPermission;

  // Sync claudeConfigSync state with userSettings
  useEffect(() => {
    if (userSettings) {
      setClaudeConfigSync(userSettings.claudeConfigSync);
    }
  }, [userSettings]);

  // Fetch SP info if no permission
  const fetchSpInfo = useCallback(async () => {
    try {
      const spRes = await fetch('/api/v1/service-principal');
      if (spRes.ok) {
        const spData = await spRes.json();
        setSpInfo(spData);
      }
    } catch (error) {
      console.error('Failed to fetch SP info:', error);
    }
  }, []);

  // Fetch SP info when modal opens and no permission
  useEffect(() => {
    if (isOpen && hasPermission === false && !spInfo) {
      fetchSpInfo();
    }
  }, [isOpen, hasPermission, spInfo, fetchSpInfo]);

  // Call onPermissionGranted when permission is granted
  useEffect(() => {
    if (hasPermission === true && isInitialSetup) {
      onPermissionGranted?.();
    }
  }, [hasPermission, isInitialSetup, onPermissionGranted]);

  const checkPermission = useCallback(async () => {
    setIsCheckingPermission(true);
    setMessage(null);
    try {
      await refetchUserInfo();
    } finally {
      setIsCheckingPermission(false);
    }
  }, [refetchUserInfo]);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/v1/users/me/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claudeConfigSync }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setMessage({ type: 'success', text: t('settingsModal.saved') });
      window.dispatchEvent(new Event('settings-changed'));

      if (isInitialSetup && hasPermission) {
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

  const renderPermissionInstructions = () => (
    <div>
      <Alert
        type="warning"
        icon={<ExclamationCircleOutlined />}
        message={t('settingsModal.noPermission')}
        showIcon
        style={{ marginBottom: 16 }}
      />

      {/* Service Principal name */}
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">{t('settingsModal.grantPermissionTo')}</Text>
        <Flex align="center" gap={8} style={{ marginTop: 4 }}>
          <RobotOutlined style={{ fontSize: 16, color: '#666' }} />
          <Text>
            <Text strong>Service Principal:</Text>{' '}
            <Text code>{spInfo?.displayName || 'Service Principal'}</Text>
          </Text>
        </Flex>
      </div>

      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        {t('settingsModal.chooseOption')}
      </Text>

      {/* Option 1 */}
      <div
        style={{
          background: '#fafafa',
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          {t('settingsModal.option1Title')}
        </Text>
        <Text>
          {t('settingsModal.option1Step1Prefix')}{' '}
          <Text code style={{ color: '#cf1322' }}>
            Can Manage
          </Text>{' '}
          {t('settingsModal.option1Step1Suffix')}
        </Text>
      </div>

      {/* Option 2 */}
      <div
        style={{
          background: '#fafafa',
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          {t('settingsModal.option2Title')}
        </Text>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>
            <Text>
              {t('settingsModal.option2Step1Prefix')}{' '}
              <Text code style={{ color: '#cf1322' }}>
                Can Edit
              </Text>{' '}
              {t('settingsModal.option2Step1Suffix')}
            </Text>
          </li>
          <li>
            <Text>{t('settingsModal.option2Step2')}</Text>
          </li>
        </ol>
      </div>

      {/* Open Databricks Console link */}
      <Flex justify="center" style={{ marginTop: 16 }}>
        <Link href={`https://${spInfo?.databricksHost}/browse`} target="_blank">
          {t('settingsModal.openDatabricksConsole')}
        </Link>
      </Flex>

      <Flex justify="center" style={{ marginTop: 16 }}>
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          onClick={checkPermission}
          loading={isLoading}
        >
          {t('settingsModal.checkAgain')}
        </Button>
      </Flex>
    </div>
  );

  const renderSettings = () => (
    <div>
      {isInitialSetup && (
        <Alert
          type="success"
          icon={<CheckCircleOutlined />}
          message={t('settingsModal.permissionGranted')}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

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
    </div>
  );

  const canClose = !isInitialSetup || hasPermission === true;

  return (
    <Modal
      title={
        <Flex align="center" gap={8}>
          <FolderOpenOutlined style={{ color: '#f5a623' }} />
          {isInitialSetup
            ? t('settingsModal.initialTitle')
            : t('settingsModal.title')}
        </Flex>
      }
      open={isOpen}
      onOk={hasPermission ? handleSave : undefined}
      onCancel={canClose ? onClose : undefined}
      okText={isSaving ? t('common.saving') : t('common.save')}
      cancelText={t('common.close')}
      okButtonProps={{
        disabled: !hasPermission,
        loading: isSaving,
        style: hasPermission ? undefined : { display: 'none' },
      }}
      cancelButtonProps={{
        disabled: isSaving,
        style: canClose ? undefined : { display: 'none' },
      }}
      closable={canClose}
      maskClosable={canClose}
      keyboard={canClose}
      width={440}
    >
      {isLoading && hasPermission === null ? (
        <Flex justify="center" align="center" style={{ minHeight: 200 }}>
          <Spin size="large" />
        </Flex>
      ) : hasPermission ? (
        renderSettings()
      ) : (
        renderPermissionInstructions()
      )}

      {!isLoading && hasPermission && (
        <>
          <Divider style={{ margin: '16px 0' }} />
          <Flex justify="center">
            <Button
              type="link"
              icon={<ReloadOutlined />}
              onClick={checkPermission}
              size="small"
            >
              {t('settingsModal.recheckPermission')}
            </Button>
          </Flex>
        </>
      )}
    </Modal>
  );
}
