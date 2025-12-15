import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useAgent } from '../hooks/useAgent';
import TitleEditModal from '../components/TitleEditModal';
import MessageRenderer from '../components/MessageRenderer';

interface LocationState {
  initialMessage?: string;
  model?: string;
}

export default function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const [input, setInput] = useState('');
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialMessageConsumedRef = useRef(false);
  const prevSessionIdRef = useRef<string | undefined>(undefined);

  // Synchronous reset - runs during render, before initialMessage is computed
  // This must be outside useEffect to ensure the ref is reset before initialMessage is evaluated
  if (prevSessionIdRef.current !== sessionId) {
    initialMessageConsumedRef.current = false;
    prevSessionIdRef.current = sessionId;
  }

  // Fetch session title
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
          if (session?.title) {
            setSessionTitle(session.title);
          }
        }
      } catch (error) {
        console.error('Failed to fetch session:', error);
      }
    };

    fetchSession();
  }, [sessionId]);

  const handleSaveTitle = useCallback(
    async (newTitle: string) => {
      if (!sessionId) return;

      const response = await fetch(`/api/v1/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });

      if (response.ok) {
        setSessionTitle(newTitle);
      } else {
        throw new Error('Failed to update title');
      }
    },
    [sessionId]
  );

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
            title="Click to edit title"
          >
            <span className="chat-title">
              {sessionTitle || `Session ${sessionId?.slice(0, 8)}...`}
            </span>
            <span className="chat-title-edit-icon">&#9998;</span>
          </button>
        </div>
        <div className="chat-header-right">
          <span className="chat-model">
            {selectedModel.replace('databricks-claude-', '')}
          </span>
          <span
            className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}
          ></span>
        </div>
      </div>

      <TitleEditModal
        isOpen={isModalOpen}
        currentTitle={sessionTitle || `Session ${sessionId?.slice(0, 8)}...`}
        onSave={handleSaveTitle}
        onClose={() => setIsModalOpen(false)}
      />

      <div className="chat-messages">
        <div className="chat-messages-inner">
          {messages.length === 0 && !isProcessing && !isLoadingHistory && (
            <div className="chat-empty">
              <p>Session started. Waiting for response...</p>
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
            placeholder="Type your message..."
            disabled={!isConnected || isProcessing}
            className="chat-input"
          />
          <button
            type="submit"
            disabled={!isConnected || isProcessing || !input.trim()}
            className="chat-submit"
          >
            ↑
          </button>
        </form>
      </div>
    </div>
  );
}
