import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SessionList from './SessionList';
import AccountMenu from './AccountMenu';

interface SidebarProps {
  width?: number;
  onSessionCreated?: (sessionId: string) => void;
}

export default function Sidebar({ width, onSessionCreated }: SidebarProps) {
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(
    'databricks-claude-sonnet-4-5'
  );
  const [workspacePath, setWorkspacePath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();

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
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What do you want to do?"
            className="sidebar-textarea"
            disabled={isSubmitting}
            rows={1}
          />
          <div className="sidebar-input-controls">
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
        </form>

        <div className="sidebar-workspace-row">
          <input
            type="text"
            value={workspacePath}
            onChange={(e) => setWorkspacePath(e.target.value)}
            placeholder="/Workspace/Users/..."
            className="sidebar-workspace-input"
            disabled={isSubmitting}
          />
        </div>
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
    </aside>
  );
}
