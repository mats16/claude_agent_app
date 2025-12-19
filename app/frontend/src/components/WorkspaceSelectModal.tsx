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
  Input,
  message,
} from 'antd';
import {
  FolderOutlined,
  FolderOpenOutlined,
  FileOutlined,
  BookOutlined,
  FolderAddOutlined,
  CheckOutlined,
  CloseOutlined,
} from '@ant-design/icons';

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
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sort objects: directories first, then alphabetically
  const sortedObjects = useMemo(() => {
    return [...objects].sort((a, b) => {
      const aIsDir = a.object_type === 'DIRECTORY';
      const bIsDir = b.object_type === 'DIRECTORY';

      // Directories come first
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;

      // Then sort alphabetically by path name
      const aName = a.path.split('/').pop()?.toLowerCase() || '';
      const bName = b.path.split('/').pop()?.toLowerCase() || '';
      return aName.localeCompare(bName);
    });
  }, [objects]);

  const fetchDirectories = async (path: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const apiPath = path.replace(/^\/Workspace/, '').toLowerCase();
      const res = await fetch(`/api/v1/workspace${apiPath}`);

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
      setIsCreating(false);
      setNewFolderName('');
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
      const res = await fetch('/api/v1/workspace/users/me');

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
    setIsCreating(false);
    setNewFolderName('');
  };

  const handleParentClick = () => {
    const parts = currentPath.split('/');
    if (parts.length > 2) {
      const parentPath = parts.slice(0, -1).join('/');
      setCurrentPath(parentPath);
      fetchDirectories(parentPath);
      setIsCreating(false);
      setNewFolderName('');
    }
  };

  const handleSelect = () => {
    onSelect(currentPath);
    onClose();
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      message.error(t('workspaceModal.nameRequired'));
      return;
    }

    // Validate folder name (no slashes, etc.)
    if (/[/\\:*?"<>|]/.test(newFolderName)) {
      message.error(t('workspaceModal.invalidName'));
      return;
    }

    setIsSubmitting(true);
    try {
      const newPath = `${currentPath}/${newFolderName.trim()}`;
      // Convert to lowercase API path: /Workspace/Users/email/folder -> /users/email/folder
      const apiPath = newPath.replace(/^\/Workspace/, '').toLowerCase();
      const res = await fetch(`/api/v1/workspace${apiPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ object_type: 'DIRECTORY' }),
      });

      if (res.status === 403) {
        message.error(t('workspaceModal.noPermission'));
        return;
      }

      const data = await res.json();

      if (data.error) {
        message.error(data.error);
        return;
      }

      message.success(t('workspaceModal.createSuccess'));
      setIsCreating(false);
      setNewFolderName('');

      // Refresh the directory list
      await fetchDirectories(currentPath);
    } catch (e) {
      console.error('Failed to create folder:', e);
      message.error(t('workspaceModal.createFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewFolderName('');
  };

  const canGoUp = currentPath.split('/').length > 2;

  const getIcon = (objectType: string, isParent: boolean) => {
    if (isParent) {
      return <FolderOutlined style={{ color: '#999', fontSize: 16 }} />;
    }

    switch (objectType) {
      case 'DIRECTORY':
        return <FolderOutlined style={{ color: '#f5a623', fontSize: 16 }} />;
      case 'NOTEBOOK':
        return <BookOutlined style={{ color: '#999', fontSize: 16 }} />;
      default:
        return <FileOutlined style={{ color: '#999', fontSize: 16 }} />;
    }
  };

  // Custom footer with New Folder button on the left
  const modalFooter = (
    <Flex justify="space-between" align="center">
      <div>
        {isCreating ? (
          <Flex align="center" gap={8}>
            <Input
              placeholder={t('workspaceModal.folderNamePlaceholder')}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onPressEnter={handleCreateFolder}
              style={{ width: 200 }}
              autoFocus
              disabled={isSubmitting}
            />
            <Button
              type="primary"
              icon={<CheckOutlined />}
              onClick={handleCreateFolder}
              loading={isSubmitting}
            >
              {t('workspaceModal.createFolder')}
            </Button>
            <Button
              icon={<CloseOutlined />}
              onClick={handleCancelCreate}
              disabled={isSubmitting}
            />
          </Flex>
        ) : (
          <Button
            icon={<FolderAddOutlined />}
            onClick={() => setIsCreating(true)}
            disabled={isLoading || !currentPath}
          >
            {t('workspaceModal.newFolder')}
          </Button>
        )}
      </div>
      <Flex gap={8}>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="primary" onClick={handleSelect} disabled={!currentPath}>
          {t('common.select')}
        </Button>
      </Flex>
    </Flex>
  );

  return (
    <Modal
      title={t('workspaceModal.title')}
      open={isOpen}
      onCancel={onClose}
      footer={modalFooter}
      width={560}
    >
      <Flex
        align="center"
        gap={8}
        style={{
          padding: '8px 12px',
          background: '#f5f5f5',
          borderRadius: 6,
          marginBottom: 16,
        }}
      >
        <FolderOpenOutlined style={{ color: '#f5a623' }} />
        <Text strong>{t('workspaceModal.current')}</Text>
        <Text style={{ flex: 1, wordBreak: 'break-all' }}>
          {currentPath || '/'}
        </Text>
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
          border: '1px solid #f0f0f0',
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
              const isDirectory = item.object_type === 'DIRECTORY';
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
                      e.currentTarget.style.background = '#fafafa';
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
                        color: isClickable ? undefined : '#999',
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
