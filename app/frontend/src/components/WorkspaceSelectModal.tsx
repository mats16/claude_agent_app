import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOutlined } from '@ant-design/icons';

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

  // Fetch directories for the current path
  const fetchDirectories = async (path: string) => {
    const token = localStorage.getItem(PAT_STORAGE_KEY);
    if (!token) {
      setError(t('workspaceModal.patNotConfigured'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Remove /Workspace prefix for the API call
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

  // Fetch home directory on open
  useEffect(() => {
    if (isOpen) {
      if (initialPath) {
        setCurrentPath(initialPath);
        fetchDirectories(initialPath);
      } else {
        // Fetch the home directory path first
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
        // Extract home directory from first object's path
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
    // Don't go above /Workspace (2 parts: ['', 'Workspace'])
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  // Don't go above /Workspace (2 parts: ['', 'Workspace'])
  const canGoUp = currentPath.split('/').length > 2;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content workspace-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2>{t('workspaceModal.title')}</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="workspace-current-path">
            <span className="workspace-path-label">
              {t('workspaceModal.current')}
            </span>
            <code className="workspace-path-value">{currentPath}</code>
          </div>

          {error && <div className="workspace-error">{error}</div>}

          <div className="workspace-directory-list">
            {canGoUp && (
              <button
                className="workspace-directory-item workspace-parent"
                onClick={handleParentClick}
                disabled={isLoading}
              >
                <span className="workspace-icon">
                  <FolderOutlined />
                </span>
                <span>..</span>
              </button>
            )}

            {isLoading ? (
              <div className="workspace-loading">{t('common.loading')}</div>
            ) : directories.length === 0 ? (
              <div className="workspace-empty">
                {t('workspaceModal.noSubdirectories')}
              </div>
            ) : (
              directories.map((dir) => (
                <button
                  key={dir}
                  className="workspace-directory-item"
                  onClick={() => handleDirectoryClick(dir)}
                >
                  <span className="workspace-icon">
                    <FolderOutlined />
                  </span>
                  <span>{dir.split('/').pop()}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="modal-button modal-button-cancel"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSelect}
            className="modal-button modal-button-save"
            disabled={!currentPath}
          >
            {t('common.select')}
          </button>
        </div>
      </div>
    </div>
  );
}
