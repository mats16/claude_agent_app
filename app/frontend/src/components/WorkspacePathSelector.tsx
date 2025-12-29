/**
 * Workspace path selector with sync mode dropdown
 * Reusable component for selecting workspace directory and sync behavior
 */

import { useTranslation } from 'react-i18next';
import { Button, Select, Tooltip, Flex, Typography } from 'antd';
import { FolderOutlined, CloseOutlined } from '@ant-design/icons';
import { colors, typography } from '../styles/theme';

const { Text } = Typography;

// Sync mode type: determines how workspace is synced
export type SyncMode = 'manual' | 'auto_push';

// Helper functions to convert between SyncMode and DB flags
export function syncModeToFlags(mode: SyncMode): {
  databricksWorkspaceAutoPush: boolean;
} {
  switch (mode) {
    case 'manual':
      return { databricksWorkspaceAutoPush: false };
    case 'auto_push':
      return { databricksWorkspaceAutoPush: true };
  }
}

export function flagsToSyncMode(
  databricksWorkspaceAutoPush: boolean
): SyncMode {
  if (databricksWorkspaceAutoPush) return 'auto_push';
  return 'manual';
}

interface WorkspacePathSelectorProps {
  /** Current workspace path */
  workspacePath: string;
  /** Callback when path changes */
  onPathChange: (path: string) => void;
  /** Current sync mode */
  syncMode: SyncMode;
  /** Callback when sync mode changes */
  onSyncModeChange: (mode: SyncMode) => void;
  /** Callback to open workspace selection modal */
  onOpenModal: () => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Whether to show the sync mode dropdown */
  showSyncMode?: boolean;
}

export default function WorkspacePathSelector({
  workspacePath,
  onPathChange,
  syncMode,
  onSyncModeChange,
  onOpenModal,
  disabled = false,
  showSyncMode = true,
}: WorkspacePathSelectorProps) {
  const { t } = useTranslation();

  const handleClearPath = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      onPathChange('');
    }
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
  ];

  return (
    <Flex align="center" gap={8} wrap="wrap">
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <Button
          icon={<FolderOutlined />}
          onClick={onOpenModal}
          disabled={disabled}
          style={{
            width: '100%',
            textAlign: 'left',
            justifyContent: 'flex-start',
            overflow: 'hidden',
            paddingRight: workspacePath ? 32 : undefined,
          }}
          title={workspacePath || t('sidebar.selectWorkspace')}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
            }}
          >
            {workspacePath || t('sidebar.selectWorkspace')}
          </span>
        </Button>
        {workspacePath && (
          <CloseOutlined
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              color: colors.danger,
              fontSize: 12,
              cursor: disabled ? 'not-allowed' : 'pointer',
              zIndex: 1,
              opacity: disabled ? 0.5 : 1,
            }}
            onClick={handleClearPath}
          />
        )}
      </div>
      {showSyncMode && (
        <Select
          value={syncMode}
          onChange={onSyncModeChange}
          disabled={disabled}
          style={{ minWidth: 120 }}
          popupMatchSelectWidth={false}
          options={syncModeOptions}
          labelRender={({ value }) => {
            switch (value) {
              case 'manual':
                return t('syncMode.manual');
              case 'auto_push':
                return t('syncMode.autoPush');
              default:
                return '';
            }
          }}
        />
      )}
    </Flex>
  );
}
