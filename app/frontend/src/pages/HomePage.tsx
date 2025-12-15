import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('databricks-claude-sonnet-4-5');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // POST to create session - returns immediately after init message
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
            model: selectedModel === 'databricks-claude-sonnet-4-5' ? 'sonnet' : 'opus',
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const data = await response.json();
      const sessionId = data.session_id;

      // Navigate to session page - WebSocket will receive queued events
      navigate(`/sessions/${sessionId}`, {
        state: {
          initialMessage: input.trim(),
        },
      });
    } catch (error) {
      console.error('Failed to create session:', error);
      setIsSubmitting(false);
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
            >
              <option value="databricks-claude-sonnet-4-5">Claude Sonnet 4.5</option>
              <option value="databricks-claude-opus-4-5">Claude Opus 4.5</option>
            </select>
          </div>
        </div>
      </header>

      <div className="chat-container">
        <div className="messages">
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
        </div>

        <form className="input-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message to start a new session..."
            className="input-field"
          />
          <button
            type="submit"
            disabled={!input.trim() || isSubmitting}
            className="send-button"
          >
            {isSubmitting ? 'Creating...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}
