import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Input, Select, Typography, Button, Flex } from 'antd';
import { FolderOutlined } from '@ant-design/icons';
import WorkspaceSelectModal from './WorkspaceSelectModal';
import { useUser } from '../contexts/UserContext';
import {
  type SyncMode,
  syncModeToFlags,
  flagsToSyncMode,
} from './WorkspacePathSelector';
import { typography } from '../styles/theme';

const { Text } = Typography;

interface TitleEditModalProps {
  isOpen: boolean;
  currentTitle: string;
  currentAutoWorkspacePush: boolean;
  currentWorkspacePath: string | null;
  currentAppAutoDeploy: boolean;
  onSave: (
    newTitle: string,
    workspaceAutoPush: boolean,
    workspacePath: string | null,
    appAutoDeploy: boolean
  ) => void;
  onClose: () => void;
}

export default function TitleEditModal({
  isOpen,
  currentTitle,
  currentAutoWorkspacePush,
  currentWorkspacePath,
  currentAppAutoDeploy,
  onSave,
  onClose,
}: TitleEditModalProps) {
  const { t } = useTranslation();
  const { userInfo } = useUser();
  const [title, setTitle] = useState(currentTitle);
  const [syncMode, setSyncMode] = useState<SyncMode>(
    flagsToSyncMode(currentAutoWorkspacePush, currentAppAutoDeploy)
  );
  const [workspacePath, setWorkspacePath] = useState<string | null>(
    currentWorkspacePath
  );
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle(currentTitle);
      setSyncMode(
        flagsToSyncMode(currentAutoWorkspacePush, currentAppAutoDeploy)
      );
      setWorkspacePath(currentWorkspacePath);
    }
  }, [
    isOpen,
    currentTitle,
    currentAutoWorkspacePush,
    currentWorkspacePath,
    currentAppAutoDeploy,
  ]);

  const handleOk = async () => {
    if (!title.trim() || isSaving) return;

    setIsSaving(true);
    try {
      const { workspaceAutoPush, appAutoDeploy } = syncModeToFlags(syncMode);
      await onSave(
        title.trim(),
        workspaceAutoPush,
        workspacePath,
        appAutoDeploy
      );
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  // Handle workspace path change: enable auto push when path is set, disable when cleared
  const handleWorkspacePathChange = (path: string) => {
    setWorkspacePath(path);
    if (path.trim().length > 0 && syncMode === 'manual') {
      setSyncMode('auto_push');
    } else if (!path.trim()) {
      setSyncMode('manual');
    }
    setIsWorkspaceModalOpen(false);
  };

  const syncModeOptions = [
    {
      value: 'manual' as SyncMode,
      label: (
        <Flex vertical gap={0}>
          <Text strong style={{ fontSize: typography.fontSizeBase }}>
            {t('syncMode.manual')}
          </Text>
          <Text type="secondary" style={{ fontSize: typography.fontSizeSmall }}>
            {t('syncMode.manualDescription')}
          </Text>
        </Flex>
      ),
    },
    {
      value: 'auto_push' as SyncMode,
      label: (
        <Flex vertical gap={0}>
          <Text strong style={{ fontSize: typography.fontSizeBase }}>
            {t('syncMode.autoPush')}
          </Text>
          <Text type="secondary" style={{ fontSize: typography.fontSizeSmall }}>
            {t('syncMode.autoPushDescription')}
          </Text>
        </Flex>
      ),
    },
    {
      value: 'auto_deploy' as SyncMode,
      label: (
        <Flex vertical gap={0}>
          <Text strong style={{ fontSize: typography.fontSizeBase }}>
            {t('syncMode.autoDeploy')}
          </Text>
          <Text type="secondary" style={{ fontSize: typography.fontSizeSmall }}>
            {t('syncMode.autoDeployDescription')}
          </Text>
        </Flex>
      ),
    },
  ];

  return (
    <Modal
      title={t('titleEditModal.title')}
      open={isOpen}
      onOk={handleOk}
      onCancel={onClose}
      okText={isSaving ? t('common.saving') : t('common.save')}
      cancelText={t('common.cancel')}
      okButtonProps={{
        disabled: !title.trim(),
        loading: isSaving,
      }}
      cancelButtonProps={{
        disabled: isSaving,
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          {t('titleEditModal.sessionTitle')}
        </Text>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('titleEditModal.titlePlaceholder')}
          disabled={isSaving}
          autoFocus
          onPressEnter={handleOk}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          {t('titleEditModal.workspacePath')}
        </Text>
        <Button
          icon={<FolderOutlined />}
          onClick={() => setIsWorkspaceModalOpen(true)}
          disabled={isSaving}
          block
          style={{
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {workspacePath || t('titleEditModal.noWorkspacePath')}
          </span>
        </Button>
        <Text
          type="secondary"
          style={{ display: 'block', marginTop: 4, fontSize: 12 }}
        >
          {t('titleEditModal.workspacePathHint')}
        </Text>
      </div>
      <div>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          {t('sidebar.autoSync')}
        </Text>
        <Select
          value={syncMode}
          onChange={setSyncMode}
          disabled={isSaving}
          style={{ width: '100%' }}
          options={syncModeOptions}
          labelRender={({ value }) => {
            switch (value) {
              case 'manual':
                return t('syncMode.manual');
              case 'auto_push':
                return t('syncMode.autoPush');
              case 'auto_deploy':
                return t('syncMode.autoDeploy');
              default:
                return '';
            }
          }}
        />
      </div>
      <WorkspaceSelectModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        onSelect={handleWorkspacePathChange}
        initialPath={workspacePath || userInfo?.workspaceHome}
      />
    </Modal>
  );
}
