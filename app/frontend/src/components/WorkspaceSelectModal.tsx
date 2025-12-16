import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Button,
  Typography,
  List,
  Spin,
  Empty,
  Alert,
  Flex,
} from 'antd';
import { FolderOutlined, FolderOpenOutlined } from '@ant-design/icons';

const { Text } = Typography;

const PAT_STORAGE_KEY = 'databricks_pat';

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
  const [directories, setDirectories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDirectories = async (path: string) => {
    const token = localStorage.getItem(PAT_STORAGE_KEY);
    if (!token) {
      setError(t('workspaceModal.patNotConfigured'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const apiPath = path.replace(/^\/Workspace/, '');
      const res = await fetch(`/api/v1/Workspace${apiPath}`, {
        headers: { 'x-databricks-token': token },
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setDirectories([]);
      } else if (data.objects) {
        const dirs = data.objects.map((o: WorkspaceObject) => o.path);
        setDirectories(dirs);
      } else {
        setDirectories([]);
      }
    } catch (e) {
      console.error('Failed to fetch directories:', e);
      setError(t('workspaceModal.fetchFailed'));
      setDirectories([]);
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
    const token = localStorage.getItem(PAT_STORAGE_KEY);
    if (!token) {
      setError(t('workspaceModal.patNotConfigured'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/Workspace/Users/me', {
        headers: { 'x-databricks-token': token },
      });
      const data = await res.json();

      if (data.objects && data.objects.length > 0) {
        const firstPath = data.objects[0].path;
        const homePath = firstPath.split('/').slice(0, 4).join('/');
        setCurrentPath(homePath);
        setDirectories(data.objects.map((o: WorkspaceObject) => o.path));
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

  return (
    <Modal
      title={t('workspaceModal.title')}
      open={isOpen}
      onOk={handleSelect}
      onCancel={onClose}
      okText={t('common.select')}
      cancelText={t('common.cancel')}
      okButtonProps={{
        disabled: !currentPath,
      }}
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
        <Text code style={{ flex: 1, wordBreak: 'break-all' }}>
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
              ...(canGoUp ? [{ path: '..', isParent: true }] : []),
              ...directories.map((d) => ({ path: d, isParent: false })),
            ]}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t('workspaceModal.noSubdirectories')}
                />
              ),
            }}
            renderItem={(item) => (
              <List.Item
                onClick={() =>
                  item.isParent
                    ? handleParentClick()
                    : handleDirectoryClick(item.path)
                }
                style={{
                  cursor: 'pointer',
                  padding: '10px 16px',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#fafafa';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <Flex align="center" gap={8}>
                  <FolderOutlined
                    style={{
                      color: item.isParent ? '#999' : '#f5a623',
                      fontSize: 16,
                    }}
                  />
                  <Text style={{ color: item.isParent ? '#999' : undefined }}>
                    {item.isParent ? '..' : item.path.split('/').pop()}
                  </Text>
                </Flex>
              </List.Item>
            )}
          />
        )}
      </div>
    </Modal>
  );
}
