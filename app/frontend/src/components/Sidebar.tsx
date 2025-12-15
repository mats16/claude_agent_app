import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SessionList from './SessionList';
import AccountMenu from './AccountMenu';
import WorkspaceSelectModal from './WorkspaceSelectModal';

interface SidebarProps {
  width?: number;
  onSessionCreated?: (sessionId: string) => void;
}

const PAT_STORAGE_KEY = 'databricks_pat';

export default function Sidebar({ width, onSessionCreated }: SidebarProps) {
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(
    'databricks-claude-sonnet-4-5'
  );
  const [workspacePath, setWorkspacePath] = useState('');
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();

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
        <h1 className="sidebar-title">Claude Code on Databricks</h1>
      </div>

      <div className="sidebar-input-section">
        <form onSubmit={handleSubmit}>
          <div className="sidebar-chat-container">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What do you want to do?"
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
                <option value="databricks-claude-sonnet-4-5">Sonnet 4.5</option>
                <option value="databricks-claude-opus-4-5">Opus 4.5</option>
              </select>
              <button
                type="submit"
                disabled={!input.trim() || isSubmitting}
                className="sidebar-send-button"
              >
                {isSubmitting ? '...' : '↑'}
              </button>
            </div>
          </div>
          <div className="sidebar-workspace-row">
            <button
              type="button"
              onClick={() => setIsWorkspaceModalOpen(true)}
              className="sidebar-workspace-button"
              disabled={isSubmitting}
              title={workspacePath || 'Select workspace'}
            >
              {workspacePath || 'Select workspace'}
            </button>
            <label className="sidebar-flag">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                disabled={isSubmitting}
              />
              <span>Overwrite</span>
            </label>
            <label className="sidebar-flag">
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                disabled={isSubmitting}
              />
              <span>Auto Sync</span>
            </label>
          </div>
        </form>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Sessions</span>
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
