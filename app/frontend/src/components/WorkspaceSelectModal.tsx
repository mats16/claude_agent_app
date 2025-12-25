import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Typography,
  List,
  Spin,
  Empty,
  Alert,
  Flex,
  Button,
  Tooltip,
} from 'antd';
import {
  FolderOutlined,
  FolderOpenOutlined,
  FileOutlined,
  BookOutlined,
  BranchesOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons';
import { colors } from '../styles/theme';

const { Text } = Typography;

interface WorkspaceObject {
  path: string;
  object_type: string;
}

interface WorkspaceSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
}

export default function WorkspaceSelectModal({
  isOpen,
  onClose,
  onSelect,
  initialPath,
}: WorkspaceSelectModalProps) {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState(initialPath || '');
  const [objects, setObjects] = useState<WorkspaceObject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  // Filter and sort objects: optionally hide hidden files, directories first, then alphabetically
  const sortedObjects = useMemo(() => {
    return [...objects]
      .filter((obj) => {
        // Optionally hide hidden files/folders (starting with '.')
        if (!showHidden) {
          const name = obj.path.split('/').pop() || '';
          if (name.startsWith('.')) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aIsDir =
          a.object_type === 'DIRECTORY' || a.object_type === 'REPO';
        const bIsDir =
          b.object_type === 'DIRECTORY' || b.object_type === 'REPO';

        // Directories and repos come first
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;

        // Then sort alphabetically by path name
        const aName = a.path.split('/').pop()?.toLowerCase() || '';
        const bName = b.path.split('/').pop()?.toLowerCase() || '';
        return aName.localeCompare(bName);
      });
  }, [objects, showHidden]);

  const fetchDirectories = async (path: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/v1/workspace/list?path=${encodeURIComponent(path)}`
      );

      if (res.status === 403) {
        setError(t('workspaceModal.noPermission'));
        setObjects([]);
        return;
      }

      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setObjects([]);
      } else if (data.objects) {
        setObjects(data.objects);
      } else {
        setObjects([]);
      }
    } catch (e) {
      console.error('Failed to fetch directories:', e);
      setError(t('workspaceModal.fetchFailed'));
      setObjects([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialPath) {
        setCurrentPath(initialPath);
        fetchDirectories(initialPath);
      } else {
        fetchHomeDirectory();
      }
    }
  }, [isOpen, initialPath]);

  const fetchHomeDirectory = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        '/api/v1/workspace/list?path=/Workspace/Users/me'
      );

      if (res.status === 403) {
        setError(t('workspaceModal.noPermission'));
        return;
      }

      const data = await res.json();

      if (data.objects && data.objects.length > 0) {
        const firstPath = data.objects[0].path;
        const homePath = firstPath.split('/').slice(0, 4).join('/');
        setCurrentPath(homePath);
        setObjects(data.objects);
      }
    } catch (e) {
      console.error('Failed to fetch home directory:', e);
      setError(t('workspaceModal.homeFetchFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDirectoryClick = (path: string) => {
    setCurrentPath(path);
    fetchDirectories(path);
  };

  const handleParentClick = () => {
    const parts = currentPath.split('/');
    if (parts.length > 2) {
      const parentPath = parts.slice(0, -1).join('/');
      setCurrentPath(parentPath);
      fetchDirectories(parentPath);
    }
  };

  const handleSelect = () => {
    onSelect(currentPath);
    onClose();
  };

  const canGoUp = currentPath.split('/').length > 2;

  const getIcon = (objectType: string, isParent: boolean) => {
    if (isParent) {
      return (
        <FolderOutlined style={{ color: colors.textMuted, fontSize: 16 }} />
      );
    }

    switch (objectType) {
      case 'DIRECTORY':
        return <FolderOutlined style={{ color: colors.brand, fontSize: 16 }} />;
      case 'REPO':
        return (
          <BranchesOutlined style={{ color: colors.brand, fontSize: 16 }} />
        );
      case 'NOTEBOOK':
        return (
          <BookOutlined style={{ color: colors.textMuted, fontSize: 16 }} />
        );
      default:
        return (
          <FileOutlined style={{ color: colors.textMuted, fontSize: 16 }} />
        );
    }
  };

  return (
    <Modal
      title={t('workspaceModal.title')}
      open={isOpen}
      onCancel={onClose}
      okText={t('common.select')}
      cancelText={t('common.cancel')}
      onOk={handleSelect}
      okButtonProps={{ disabled: !currentPath }}
      width={560}
    >
      <Flex
        align="center"
        gap={8}
        style={{
          padding: '8px 12px',
          background: colors.backgroundHover,
          borderRadius: 6,
          marginBottom: 16,
        }}
      >
        <FolderOpenOutlined style={{ color: colors.brand }} />
        <Text strong>{t('workspaceModal.current')}</Text>
        <Text style={{ flex: 1, wordBreak: 'break-all' }}>
          {currentPath || '/'}
        </Text>
        <Tooltip title={t('workspaceModal.showHiddenTooltip')}>
          <Button
            type="text"
            size="small"
            icon={showHidden ? <EyeOutlined /> : <EyeInvisibleOutlined />}
            onClick={() => setShowHidden(!showHidden)}
            style={{
              color: showHidden ? colors.brand : colors.textMuted,
            }}
          />
        </Tooltip>
      </Flex>

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <div
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          maxHeight: 300,
          overflow: 'auto',
        }}
      >
        {isLoading ? (
          <Flex justify="center" align="center" style={{ padding: 32 }}>
            <Spin />
            <Text type="secondary" style={{ marginLeft: 8 }}>
              {t('common.loading')}
            </Text>
          </Flex>
        ) : (
          <List
            size="small"
            dataSource={[
              ...(canGoUp
                ? [{ path: '..', object_type: 'DIRECTORY', isParent: true }]
                : []),
              ...sortedObjects.map((obj) => ({ ...obj, isParent: false })),
            ]}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t('workspaceModal.noSubdirectories')}
                />
              ),
            }}
            renderItem={(item) => {
              const isDirectory =
                item.object_type === 'DIRECTORY' || item.object_type === 'REPO';
              const isClickable = item.isParent || isDirectory;

              return (
                <List.Item
                  onClick={() => {
                    if (!isClickable) return;
                    item.isParent
                      ? handleParentClick()
                      : handleDirectoryClick(item.path);
                  }}
                  style={{
                    cursor: isClickable ? 'pointer' : 'not-allowed',
                    padding: '10px 16px',
                    transition: 'background 0.15s',
                    opacity: isClickable ? 1 : 0.5,
                  }}
                  onMouseEnter={(e) => {
                    if (isClickable) {
                      e.currentTarget.style.background =
                        colors.backgroundTertiary;
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Flex align="center" gap={8}>
                    {getIcon(item.object_type, item.isParent)}
                    <Text
                      style={{
                        color: isClickable ? undefined : colors.textMuted,
                      }}
                    >
                      {item.isParent ? '..' : item.path.split('/').pop()}
                    </Text>
                  </Flex>
                </List.Item>
              );
            }}
          />
        )}
      </div>
    </Modal>
  );
}
