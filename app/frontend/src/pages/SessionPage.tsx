import { useState, useRef, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useAgent } from '../hooks/useAgent';

interface LocationState {
  initialMessage?: string;
  model?: string;
}

export default function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialMessageConsumedRef = useRef(false);
  const prevSessionIdRef = useRef<string | undefined>(undefined);

  // Synchronous reset - runs during render, before initialMessage is computed
  // This must be outside useEffect to ensure the ref is reset before initialMessage is evaluated
  if (prevSessionIdRef.current !== sessionId) {
    initialMessageConsumedRef.current = false;
    prevSessionIdRef.current = sessionId;
  }

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
          <span className="chat-session-id">
            Session: {sessionId?.slice(0, 8)}...
          </span>
        </div>
        <div className="chat-header-right">
          <span className="chat-model">{selectedModel.replace('databricks-claude-', '')}</span>
          <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
        </div>
      </div>

      <div className="chat-messages">
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
              <pre>{message.content}</pre>
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
          Send
        </button>
      </form>
    </div>
  );
}
