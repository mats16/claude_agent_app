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

  // Get initial message from navigation state (for new sessions)
  const locationState = location.state as LocationState | null;
  const initialMessage = locationState?.initialMessage;

  const {
    messages,
    isConnected,
    isProcessing,
    sendMessage,
    selectedModel,
    setSelectedModel,
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

  const isNewSession = sessionId === 'new';

  return (
    <div className="app">
      <header className="header">
        <h1>Claude Coding Agent</h1>
        <div className="header-controls">
          {!isNewSession && (
            <div
              className="session-info"
              style={{ marginRight: '1rem', fontSize: '0.8rem', opacity: 0.7 }}
            >
              Session: {sessionId?.slice(0, 8)}...
            </div>
          )}
          <div className="model-selector">
            <label htmlFor="model-select">Model:</label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isProcessing}
            >
              <option value="databricks-claude-sonnet-4-5">
                Claude Sonnet 4.5
              </option>
              <option value="databricks-claude-opus-4-5">
                Claude Opus 4.5
              </option>
            </select>
          </div>
          <div className="status">
            <span
              className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}
            ></span>
            <span>{isConnected ? 'Connected' : 'Connecting...'}</span>
          </div>
        </div>
      </header>

      <div className="chat-container">
        <div className="messages">
          {messages.length === 0 && !isProcessing && (
            <div className="welcome-message">
              <p>Session started. Continue your conversation.</p>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={`message ${message.role}`}>
              <div className="message-role">
                {message.role === 'user' ? '>' : '◆'}
              </div>
              <div className="message-content">
                <pre>{message.content}</pre>
              </div>
            </div>
          ))}

          {isProcessing &&
            messages.length > 0 &&
            messages[messages.length - 1].role === 'user' && (
              <div className="message agent">
                <div className="message-role">◆</div>
                <div className="message-content">
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

        <form className="input-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={!isConnected || isProcessing}
            className="input-field"
          />
          <button
            type="submit"
            disabled={!isConnected || isProcessing || !input.trim()}
            className="send-button"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
