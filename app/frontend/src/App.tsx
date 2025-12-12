import { useState, useRef, useEffect } from 'react';
import './App.css';
import { useAgent } from './hooks/useAgent';

function App() {
  const [input, setInput] = useState('');
  const { messages, isConnected, isProcessing, sendMessage, selectedModel, setSelectedModel } = useAgent();
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    <div className="app">
      <header className="header">
        <h1>Claude Coding Agent</h1>
        <div className="header-controls">
          <div className="model-selector">
            <label htmlFor="model-select">Model:</label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isProcessing}
            >
              <option value="databricks-claude-sonnet-4-5">Claude Sonnet 4.5</option>
              <option value="databricks-claude-opus-4-5">Claude Opus 4.5</option>
            </select>
          </div>
          <div className="status">
            <span
              className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}
            ></span>
            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </header>

      <div className="chat-container">
        <div className="messages">
          {messages.length === 0 && (
            <div className="welcome-message">
              <p>Claude Coding Agent</p>
              <div className="examples">
                <p>Try:</p>
                <ul>
                  <li>List all TypeScript files</li>
                  <li>Read package.json</li>
                  <li>Search for TODO comments</li>
                  <li>Create a new file</li>
                </ul>
              </div>
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

export default App;
