/**
 * Workspace path selector with auto-sync toggle
 * Reusable component for selecting workspace directory
 */

import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Tooltip, Typography, Flex } from 'antd';
import { FolderOutlined, SyncOutlined, CloseOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface WorkspacePathSelectorProps {
  /** Current workspace path */
  workspacePath: string;
  /** Callback when path changes */
  onPathChange: (path: string) => void;
  /** Whether auto workspace push is enabled */
  autoWorkspacePush: boolean;
  /** Callback when auto push toggle changes */
  onAutoWorkspacePushChange: (enabled: boolean) => void;
  /** Callback to open workspace selection modal */
  onOpenModal: () => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Whether to show the auto sync checkbox */
  showAutoSync?: boolean;
}

export default function WorkspacePathSelector({
  workspacePath,
  onPathChange,
  autoWorkspacePush,
  onAutoWorkspacePushChange,
  onOpenModal,
  disabled = false,
  showAutoSync = true,
}: WorkspacePathSelectorProps) {
  const { t } = useTranslation();

  const handleClearPath = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      onPathChange('');
    }
  };

  return (
    <Flex align="center" gap={8} wrap="wrap">
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <Button
          size="small"
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
              color: '#ff4d4f',
              fontSize: 12,
              cursor: disabled ? 'not-allowed' : 'pointer',
              zIndex: 1,
              opacity: disabled ? 0.5 : 1,
            }}
            onClick={handleClearPath}
          />
        )}
      </div>
      {showAutoSync && (
        <Tooltip
          title={t('sidebar.autoSyncTooltip')}
          placement="bottomRight"
          arrow={{ pointAtCenter: true }}
          overlayStyle={{ maxWidth: 'none', whiteSpace: 'nowrap' }}
        >
          <Checkbox
            checked={autoWorkspacePush}
            onChange={(e) => onAutoWorkspacePushChange(e.target.checked)}
            disabled={disabled}
          >
            <Text style={{ fontSize: 12 }}>
              <SyncOutlined style={{ marginRight: 4 }} />
              {t('sidebar.autoSync')}
            </Text>
          </Checkbox>
        </Tooltip>
      )}
    </Flex>
  );
}
