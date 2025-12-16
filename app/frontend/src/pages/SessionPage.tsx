import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SendOutlined } from '@ant-design/icons';
import { useAgent } from '../hooks/useAgent';
import TitleEditModal from '../components/TitleEditModal';
import MessageRenderer from '../components/MessageRenderer';

interface LocationState {
  initialMessage?: string;
  model?: string;
}

const PAT_STORAGE_KEY = 'databricks_pat';

export default function SessionPage() {
  const { t } = useTranslation();
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const [input, setInput] = useState('');
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [sessionAutoSync, setSessionAutoSync] = useState(false);
  const [sessionWorkspacePath, setSessionWorkspacePath] = useState<
    string | null
  >(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasPat, setHasPat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialMessageConsumedRef = useRef(false);
  const prevSessionIdRef = useRef<string | undefined>(undefined);

  // Check if PAT is configured
  useEffect(() => {
    const checkPat = () => {
      const token = localStorage.getItem(PAT_STORAGE_KEY);
      setHasPat(!!token);
    };
    checkPat();

    // Listen for storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === PAT_STORAGE_KEY) {
        checkPat();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Listen for custom event for same-tab updates
    const handlePatChange = () => checkPat();
    window.addEventListener('pat-changed', handlePatChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('pat-changed', handlePatChange);
    };
  }, []);

  // Synchronous reset - runs during render, before initialMessage is computed
  // This must be outside useEffect to ensure the ref is reset before initialMessage is evaluated
  if (prevSessionIdRef.current !== sessionId) {
    initialMessageConsumedRef.current = false;
    prevSessionIdRef.current = sessionId;
  }

  // Fetch session data
  useEffect(() => {
    if (!sessionId) return;

    const fetchSession = async () => {
      try {
        const response = await fetch(`/api/v1/sessions`);
        if (response.ok) {
          const data = await response.json();
          const session = data.sessions?.find(
            (s: { id: string }) => s.id === sessionId
          );
          if (session) {
            if (session.title) {
              setSessionTitle(session.title);
            }
            setSessionAutoSync(session.autoSync ?? false);
            setSessionWorkspacePath(session.workspacePath ?? null);
          }
        }
      } catch (error) {
        console.error('Failed to fetch session:', error);
      }
    };

    fetchSession();
  }, [sessionId]);

  const handleSaveSettings = useCallback(
    async (newTitle: string, autoSync: boolean) => {
      if (!sessionId) return;

      const response = await fetch(`/api/v1/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, autoSync }),
      });

      if (response.ok) {
        setSessionTitle(newTitle);
        setSessionAutoSync(autoSync);
      } else {
        throw new Error('Failed to update session settings');
      }
    },
    [sessionId]
  );

  const handleWorkspacePathClick = useCallback(async () => {
    if (!sessionWorkspacePath) return;

    try {
      const token = localStorage.getItem('databricks_pat');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['x-databricks-token'] = token;
      }

      const response = await fetch('/api/v1/workspace/status', {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: sessionWorkspacePath }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.browse_url) {
          // Open Databricks workspace folder in new tab
          window.open(data.browse_url, '_blank');
        }
      } else {
        console.error('Failed to get workspace status');
      }
    } catch (error) {
      console.error('Error fetching workspace status:', error);
    }
  }, [sessionWorkspacePath]);

  const locationState = location.state as LocationState | null;
  const initialMessage = !initialMessageConsumedRef.current
    ? locationState?.initialMessage
    : undefined;

  useEffect(() => {
    if (locationState?.initialMessage && !initialMessageConsumedRef.current) {
      initialMessageConsumedRef.current = true;
      window.history.replaceState({}, '', location.pathname);
    }
  }, [locationState?.initialMessage, location.pathname]);

  const {
    messages,
    isConnected,
    isProcessing,
    isLoadingHistory,
    isReconnecting,
    sendMessage,
    selectedModel,
  } = useAgent({
    sessionId,
    initialMessage,
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      sendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-left">
          <button
            className="chat-title-button"
            onClick={() => setIsModalOpen(true)}
            title={t('sessionPage.clickToEdit')}
          >
            <span className="chat-title">
              {sessionTitle || `Session ${sessionId?.slice(0, 8)}...`}
            </span>
            {sessionAutoSync && (
              <span className="auto-sync-badge">{t('sidebar.autoSync')}</span>
            )}
            <span className="chat-title-edit-icon">&#9998;</span>
          </button>
          {sessionWorkspacePath && (
            <div className="workspace-path-container">
              <span className="workspace-path" title={sessionWorkspacePath}>
                {sessionWorkspacePath}
              </span>
              <button
                className="workspace-link-button"
                onClick={handleWorkspacePathClick}
                title={t('sessionPage.openInDatabricks')}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z" />
                  <path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z" />
                </svg>
              </button>
            </div>
          )}
        </div>
        <div className="chat-header-right">
          <span className="chat-model">{selectedModel}</span>
          <span
            className={`status-dot ${isConnected ? 'connected' : isReconnecting ? 'reconnecting' : 'disconnected'}`}
            title={
              isConnected
                ? t('sessionPage.connected')
                : isReconnecting
                  ? t('sessionPage.reconnecting')
                  : t('sessionPage.disconnected')
            }
          ></span>
        </div>
      </div>

      <TitleEditModal
        isOpen={isModalOpen}
        currentTitle={sessionTitle || `Session ${sessionId?.slice(0, 8)}...`}
        currentAutoSync={sessionAutoSync}
        onSave={handleSaveSettings}
        onClose={() => setIsModalOpen(false)}
      />

      <div className="chat-messages">
        <div className="chat-messages-inner">
          {messages.length === 0 && !isProcessing && !isLoadingHistory && (
            <div className="chat-empty">
              <p>{t('sessionPage.waitingForResponse')}</p>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={`chat-message ${message.role}`}>
              <div className="chat-message-icon">
                {message.role === 'user' ? '>' : '◆'}
              </div>
              <div className="chat-message-content">
                <MessageRenderer
                  content={message.content}
                  role={message.role as 'user' | 'agent'}
                />
              </div>
            </div>
          ))}

          {isProcessing &&
            messages.length > 0 &&
            messages[messages.length - 1].role === 'user' && (
              <div className="chat-message agent">
                <div className="chat-message-icon">◆</div>
                <div className="chat-message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}

          <div ref={messagesEndRef} />
        </div>

        <form className="chat-input-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('sessionPage.typeMessage')}
            disabled={!isConnected || isProcessing || !hasPat}
            className="chat-input"
          />
          <div
            className="chat-submit-wrapper"
            data-tooltip={!hasPat ? t('sidebar.patRequired') : undefined}
          >
            <button
              type="submit"
              disabled={
                !isConnected || isProcessing || !input.trim() || !hasPat
              }
              className="chat-submit"
            >
              <SendOutlined />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
