import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Alert, Typography, Flex, Spin } from 'antd';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useUser } from '../contexts/UserContext';

const { Text, Link } = Typography;

interface ServicePrincipalInfo {
  displayName: string;
  applicationId: string | null;
  databricksHost: string | null;
}

interface AppSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isInitialSetup?: boolean;
  onPermissionGranted?: () => void;
}

export default function AppSettingsModal({
  isOpen,
  onClose,
  isInitialSetup = false,
  onPermissionGranted,
}: AppSettingsModalProps) {
  const { t, i18n } = useTranslation();
  const { userInfo, isLoading: isUserLoading, refetchUserInfo } = useUser();
  const [spInfo, setSpInfo] = useState<ServicePrincipalInfo | null>(null);
  const [isCheckingPermission, setIsCheckingPermission] = useState(false);

  const hasPermission = userInfo?.hasWorkspacePermission ?? null;
  const isLoading = isUserLoading || isCheckingPermission;

  // Fetch SP info if no permission
  const fetchSpInfo = useCallback(async () => {
    try {
      const spRes = await fetch('/api/v1/settings/sp-permission');
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
    try {
      await refetchUserInfo();
    } finally {
      setIsCheckingPermission(false);
    }
  }, [refetchUserInfo]);

  const renderPermissionInstructions = () => (
    <div>
      <Alert
        type="warning"
        icon={<ExclamationCircleOutlined />}
        message={t('appSettingsModal.noPermission')}
        showIcon
        style={{ marginBottom: 16 }}
      />

      {/* Service Principal authentication note */}
      <Alert
        type="info"
        message={t('appSettingsModal.spAuthNote')}
        style={{ marginBottom: 16 }}
      />

      {/* Instructions */}
      <div
        style={{
          background: '#fafafa',
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <Text strong style={{ display: 'block', marginBottom: 12 }}>
          {t('appSettingsModal.instructionsTitle')}
        </Text>
        <Text>
          {i18n.language === 'ja' ? (
            <>
              <Text code>{spInfo?.displayName || 'Service Principal'}</Text>{' '}
              {t('appSettingsModal.instructionsTextBefore')}{' '}
              <Text code style={{ color: '#cf1322', fontSize: 14 }}>
                Can Manage
              </Text>{' '}
              {t('appSettingsModal.instructionsTextAfter')}
            </>
          ) : (
            <>
              {t('appSettingsModal.instructionsTextBefore')}{' '}
              <Text code style={{ color: '#cf1322', fontSize: 14 }}>
                Can Manage
              </Text>{' '}
              {t('appSettingsModal.instructionsTextAfter')}{' '}
              <Text code>{spInfo?.displayName || 'Service Principal'}</Text>
            </>
          )}
        </Text>
      </div>

      {/* Open Databricks Console link */}
      <Flex justify="center" style={{ marginBottom: 16 }}>
        <Link href={`https://${spInfo?.databricksHost}/browse`} target="_blank">
          {t('appSettingsModal.openDatabricksConsole')}
        </Link>
      </Flex>

      <Flex justify="center">
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          onClick={checkPermission}
          loading={isLoading}
        >
          {t('appSettingsModal.checkAgain')}
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
          message={t('appSettingsModal.permissionGranted')}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Text type="secondary">
        ワークスペースへのアクセス権限が確認されています。
      </Text>
    </div>
  );

  const canClose = !isInitialSetup || hasPermission === true;

  return (
    <Modal
      title={
        <Flex align="center" gap={8}>
          <SettingOutlined style={{ color: '#f5a623' }} />
          {isInitialSetup
            ? t('appSettingsModal.initialTitle')
            : t('appSettingsModal.title')}
        </Flex>
      }
      open={isOpen}
      onCancel={canClose ? onClose : undefined}
      footer={null}
      closable={canClose}
      maskClosable={canClose}
      keyboard={canClose}
      width={500}
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
    </Modal>
  );
}
