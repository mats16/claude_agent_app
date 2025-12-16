import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SendOutlined, SyncOutlined } from '@ant-design/icons';
import SessionList from './SessionList';
import AccountMenu from './AccountMenu';
import WorkspaceSelectModal from './WorkspaceSelectModal';

interface SidebarProps {
  width?: number;
  onSessionCreated?: (sessionId: string) => void;
}

const PAT_STORAGE_KEY = 'databricks_pat';

export default function Sidebar({ width, onSessionCreated }: SidebarProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(
    'databricks-claude-sonnet-4-5'
  );
  const [workspacePath, setWorkspacePath] = useState('');
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [overwrite, setOverwrite] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [hasPat, setHasPat] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();

  // Check if PAT is configured
  useEffect(() => {
    const checkPat = () => {
      const token = localStorage.getItem(PAT_STORAGE_KEY);
      setHasPat(!!token);
    };
    checkPat();

    // Listen for storage changes (e.g., when PAT is saved in another component)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === PAT_STORAGE_KEY) {
        checkPat();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Also listen for custom event for same-tab updates
    const handlePatChange = () => checkPat();
    window.addEventListener('pat-changed', handlePatChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('pat-changed', handlePatChange);
    };
  }, []);

  // Fetch home directory as default
  useEffect(() => {
    const fetchHomeDirectory = async () => {
      const token = localStorage.getItem(PAT_STORAGE_KEY);
      if (!token || workspacePath) return;

      try {
        const res = await fetch('/api/v1/Workspace/Users/me', {
          headers: { 'x-databricks-token': token },
        });
        const data = await res.json();
        if (data.objects && data.objects.length > 0) {
          // Extract home directory from first object's path
          // e.g., /Workspace/Users/user@example.com/subdir -> /Workspace/Users/user@example.com
          const firstPath = data.objects[0].path;
          const homePath = firstPath.split('/').slice(0, 4).join('/');
          setWorkspacePath(homePath);
        }
      } catch (e) {
        console.error('Failed to fetch home directory:', e);
      }
    };
    fetchHomeDirectory();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSubmitting) return;

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/v1/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events: [
            {
              uuid: crypto.randomUUID(),
              session_id: '',
              type: 'user',
              message: { role: 'user', content: input.trim() },
            },
          ],
          session_context: {
            model: selectedModel,
            workspacePath: workspacePath.trim() || undefined,
            overwrite,
            autoSync,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const data = await response.json();
      const sessionId = data.session_id;

      setInput('');
      onSessionCreated?.(sessionId);

      navigate(`/sessions/${sessionId}`, {
        state: {
          initialMessage: input.trim(),
        },
      });
    } catch (error) {
      console.error('Failed to create session:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Don't submit during IME composition (e.g., Japanese input)
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <aside
      className="sidebar"
      style={
        width ? { width: `${width}px`, minWidth: `${width}px` } : undefined
      }
    >
      <div className="sidebar-header">
        <Link to="/" className="sidebar-title-link">
          <h1 className="sidebar-title">{t('sidebar.title')}</h1>
        </Link>
      </div>

      <div className="sidebar-input-section">
        <form onSubmit={handleSubmit}>
          <div className="sidebar-chat-container">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('sidebar.placeholder')}
              className="sidebar-textarea"
              disabled={isSubmitting}
              rows={3}
            />
            <div className="sidebar-chat-controls">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="sidebar-model-select"
                disabled={isSubmitting}
              >
                <option value="databricks-claude-opus-4-5">Opus 4.5</option>
                <option value="databricks-claude-sonnet-4-5">Sonnet 4.5</option>
              </select>
              <div
                className="sidebar-send-button-wrapper"
                data-tooltip={!hasPat ? t('sidebar.patRequired') : undefined}
              >
                <button
                  type="submit"
                  disabled={!input.trim() || isSubmitting || !hasPat}
                  className="sidebar-send-button"
                >
                  {isSubmitting ? '...' : <SendOutlined />}
                </button>
              </div>
            </div>
          </div>
          <div className="sidebar-workspace-row">
            <button
              type="button"
              onClick={() => setIsWorkspaceModalOpen(true)}
              className="sidebar-workspace-button"
              disabled={isSubmitting}
              title={workspacePath || t('sidebar.selectWorkspace')}
            >
              {workspacePath || t('sidebar.selectWorkspace')}
            </button>
            <label
              className="sidebar-flag"
              data-tooltip={t('sidebar.overwriteTooltip')}
            >
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                disabled={isSubmitting}
              />
              <span>{t('sidebar.overwrite')}</span>
            </label>
            <label
              className="sidebar-flag"
              data-tooltip={t('sidebar.autoSyncTooltip')}
            >
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                disabled={isSubmitting}
              />
              <span>
                <SyncOutlined /> {t('sidebar.autoSync')}
              </span>
            </label>
          </div>
        </form>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span>{t('sidebar.sessions')}</span>
        </div>
        <SessionList />
      </div>

      <div className="sidebar-footer">
        <AccountMenu />
      </div>

      <WorkspaceSelectModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        onSelect={setWorkspacePath}
        initialPath={workspacePath}
      />
    </aside>
  );
}
