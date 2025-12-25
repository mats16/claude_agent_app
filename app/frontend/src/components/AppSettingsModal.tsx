import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Button,
  Alert,
  Typography,
  Flex,
  Spin,
  Divider,
  Input,
  Space,
  Radio,
  Card,
  Tag,
} from 'antd';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
  KeyOutlined,
  SaveOutlined,
  DeleteOutlined,
  CloseCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useUser } from '../contexts/UserContext';
import { colors, spacing } from '../styles/theme';

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
  const {
    userInfo,
    userSettings,
    isLoading: isUserLoading,
    refetchUserInfo,
    refetchUserSettings,
  } = useUser();
  const [spInfo, setSpInfo] = useState<ServicePrincipalInfo | null>(null);
  const [isCheckingPermission, setIsCheckingPermission] = useState(false);

  // PAT state
  const [patValue, setPatValue] = useState('');
  const [isSavingPat, setIsSavingPat] = useState(false);
  const [isDeletingPat, setIsDeletingPat] = useState(false);
  const [patMessage, setPatMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Access option state for initial setup
  type AccessOption = 'pat' | 'sp';
  const [selectedOption, setSelectedOption] = useState<AccessOption>('pat');

  const hasPat = userSettings?.hasDatabricksPat ?? false;
  const encryptionAvailable = userSettings?.encryptionAvailable ?? false;

  const hasPermission = userInfo?.hasWorkspacePermission ?? null;
  const isLoading = isUserLoading || isCheckingPermission;

  // Clear PAT input when modal opens
  useEffect(() => {
    if (isOpen) {
      setPatValue('');
      setPatMessage(null);
    }
  }, [isOpen]);

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

  const handleSavePat = async () => {
    if (!patValue.trim()) {
      setPatMessage({ type: 'error', text: t('patSection.patRequired') });
      return;
    }

    setIsSavingPat(true);
    setPatMessage(null);

    try {
      const response = await fetch('/api/v1/settings/pat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pat: patValue }),
      });

      if (!response.ok) {
        throw new Error('Failed to save PAT');
      }

      setPatValue('');
      setPatMessage({ type: 'success', text: t('patSection.saveSuccess') });
      await refetchUserSettings();

      // Trigger permission granted callback when PAT is saved in initial setup
      if (isInitialSetup) {
        onPermissionGranted?.();
      }
    } catch {
      setPatMessage({ type: 'error', text: t('patSection.saveFailed') });
    } finally {
      setIsSavingPat(false);
    }
  };

  const handleDeletePat = async () => {
    setIsDeletingPat(true);
    setPatMessage(null);

    try {
      const response = await fetch('/api/v1/settings/pat', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete PAT');
      }

      setPatMessage({ type: 'success', text: t('patSection.deleteSuccess') });
      await refetchUserSettings();
    } catch {
      setPatMessage({ type: 'error', text: t('patSection.deleteFailed') });
    } finally {
      setIsDeletingPat(false);
    }
  };

  const renderPermissionInstructions = () => (
    <div>
      <Alert
        type="warning"
        icon={<ExclamationCircleOutlined />}
        message={t('appSettingsModal.noPermission')}
        showIcon
        style={{ marginBottom: 16 }}
      />

      {/* Instructions */}
      <div
        style={{
          background: colors.backgroundTertiary,
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
              <Text code style={{ color: colors.danger, fontSize: 14 }}>
                Can Manage
              </Text>{' '}
              {t('appSettingsModal.instructionsTextAfter')}
            </>
          ) : (
            <>
              {t('appSettingsModal.instructionsTextBefore')}{' '}
              <Text code style={{ color: colors.danger, fontSize: 14 }}>
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

  const renderSpPermissionSection = () => (
    <div>
      {renderPermissionInstructions()}

      {/* SP limitations warning */}
      <Alert
        type="warning"
        icon={<WarningOutlined />}
        message={t('appSettingsModal.spLimitationsTitle')}
        description={
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>{t('appSettingsModal.spLimitGit')}</li>
            <li>{t('appSettingsModal.spLimitCommit')}</li>
            <li>{t('appSettingsModal.spLimitCli')}</li>
          </ul>
        }
        showIcon
        style={{ marginTop: spacing.lg }}
      />
    </div>
  );

  const renderInitialSetup = () => (
    <div>
      {/* Info alert for title */}
      <Alert
        type="info"
        message={t('appSettingsModal.chooseAccessMethod')}
        showIcon
        style={{ marginBottom: spacing.md }}
      />

      {/* Warning alert explaining why authentication is needed */}
      <Alert
        type="warning"
        icon={<ExclamationCircleOutlined />}
        message={t('appSettingsModal.chooseAccessMethodDesc')}
        showIcon
        style={{ marginBottom: spacing.lg }}
      />

      {/* Option selector */}
      <Radio.Group
        value={selectedOption}
        onChange={(e) => setSelectedOption(e.target.value)}
        style={{ width: '100%', marginBottom: spacing.lg }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {/* PAT Option Card */}
          <Card
            hoverable
            onClick={() => setSelectedOption('pat')}
            style={{
              borderColor: selectedOption === 'pat' ? colors.brand : undefined,
              cursor: 'pointer',
            }}
            styles={{
              body: { padding: spacing.md },
            }}
          >
            <Radio value="pat">
              <Space direction="vertical" size={4}>
                <Space>
                  <Text strong>{t('appSettingsModal.optionPat')}</Text>
                  <Tag color="orange">{t('appSettingsModal.recommended')}</Tag>
                </Space>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {t('appSettingsModal.optionPatDesc')}
                </Text>
              </Space>
            </Radio>
          </Card>

          {/* SP Option Card */}
          <Card
            hoverable
            onClick={() => setSelectedOption('sp')}
            style={{
              borderColor: selectedOption === 'sp' ? colors.brand : undefined,
              cursor: 'pointer',
            }}
            styles={{
              body: { padding: spacing.md },
            }}
          >
            <Radio value="sp">
              <Space direction="vertical" size={4}>
                <Text strong>{t('appSettingsModal.optionSp')}</Text>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {t('appSettingsModal.optionSpDesc')}
                </Text>
              </Space>
            </Radio>
          </Card>
        </Space>
      </Radio.Group>

      <Divider />

      {/* Content based on selected option */}
      {selectedOption === 'pat'
        ? renderPatSection()
        : renderSpPermissionSection()}
    </div>
  );

  const renderPatSection = () => {
    if (!encryptionAvailable) {
      return (
        <Alert
          type="warning"
          icon={<WarningOutlined />}
          message={t('patSection.encryptionUnavailable')}
          description={t('patSection.encryptionUnavailableDesc')}
          showIcon
        />
      );
    }

    return (
      <div>
        {/* Current status */}
        <div style={{ marginBottom: spacing.lg }}>
          <Text
            type="secondary"
            style={{ display: 'block', marginBottom: spacing.sm }}
          >
            {t('patSection.status')}:{' '}
            {hasPat ? (
              <Text strong style={{ color: colors.success }}>
                <CheckCircleOutlined style={{ marginRight: spacing.xs }} />
                {t('patSection.configured')}
              </Text>
            ) : (
              <Text strong style={{ color: colors.textMuted }}>
                <CloseCircleOutlined style={{ marginRight: spacing.xs }} />
                {t('patSection.notConfigured')}
              </Text>
            )}
          </Text>
        </div>

        {/* PAT Input */}
        <div style={{ marginBottom: spacing.lg }}>
          <Text strong style={{ display: 'block', marginBottom: spacing.sm }}>
            {hasPat ? t('patSection.updatePat') : t('patSection.setPat')}
          </Text>

          <Space.Compact style={{ width: '100%', marginBottom: spacing.md }}>
            <Input.Password
              value={patValue}
              onChange={(e) => setPatValue(e.target.value)}
              placeholder={t('patSection.placeholder')}
              style={{ flex: 1 }}
            />
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSavePat}
              loading={isSavingPat}
              disabled={isDeletingPat || !patValue.trim()}
            >
              {t('common.save')}
            </Button>
          </Space.Compact>

          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('patSection.hint')}
          </Text>
        </div>

        {/* Delete PAT */}
        {hasPat && (
          <div>
            <Text strong style={{ display: 'block', marginBottom: spacing.sm }}>
              {t('patSection.removePat')}
            </Text>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleDeletePat}
              loading={isDeletingPat}
              disabled={isSavingPat}
            >
              {t('patSection.deleteButton')}
            </Button>
          </div>
        )}

        {/* Message */}
        {patMessage && (
          <Alert
            type={patMessage.type}
            message={patMessage.text}
            showIcon
            style={{ marginTop: spacing.lg }}
          />
        )}
      </div>
    );
  };

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

      <Divider />

      {/* PAT Section */}
      <Flex
        align="center"
        gap={spacing.sm}
        style={{ marginBottom: spacing.md }}
      >
        <KeyOutlined style={{ color: colors.brand }} />
        <Text strong style={{ fontSize: 16 }}>
          {t('patSection.title')}
        </Text>
      </Flex>

      {renderPatSection()}
    </div>
  );

  // Can close if: not initial setup, OR permission granted, OR PAT is set
  const canClose = !isInitialSetup || hasPermission === true || hasPat === true;

  return (
    <Modal
      title={
        <Flex align="center" gap={8}>
          <SettingOutlined style={{ color: colors.brand }} />
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
      ) : hasPermission || hasPat ? (
        renderSettings()
      ) : (
        renderInitialSetup()
      )}
    </Modal>
  );
}
