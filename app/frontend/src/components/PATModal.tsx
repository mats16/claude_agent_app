import { useState, useEffect, useRef } from 'react';

const PAT_STORAGE_KEY = 'databricks_pat';

interface PATModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PATModal({ isOpen, onClose }: PATModalProps) {
  const [token, setToken] = useState('');
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Load existing token
      const existing = localStorage.getItem(PAT_STORAGE_KEY);
      setSavedToken(existing);
      setToken('');
      setShowToken(false);
      setMessage(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!token.trim()) return;

    setIsSaving(true);
    setMessage(null);

    try {
      localStorage.setItem(PAT_STORAGE_KEY, token.trim());
      setSavedToken(token.trim());
      setToken('');
      setMessage({ type: 'success', text: 'Token saved successfully' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save token' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    localStorage.removeItem(PAT_STORAGE_KEY);
    setSavedToken(null);
    setMessage({ type: 'success', text: 'Token deleted' });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && token.trim()) {
      handleSave();
    }
  };

  if (!isOpen) return null;

  const maskedToken = savedToken
    ? `${savedToken.slice(0, 8)}${'*'.repeat(20)}${savedToken.slice(-4)}`
    : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2>Personal Access Token</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <p className="pat-description">
            Enter your Databricks Personal Access Token to authenticate API requests.
          </p>

          {savedToken && (
            <div className="pat-current">
              <label className="pat-label">Current Token</label>
              <div className="pat-token-display">
                <code>{showToken ? savedToken : maskedToken}</code>
                <button
                  type="button"
                  className="pat-toggle-button"
                  onClick={() => setShowToken(!showToken)}
                  title={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  className="pat-delete-button"
                  onClick={handleDelete}
                  title="Delete token"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          )}

          <div className="pat-input-section">
            <label className="pat-label">
              {savedToken ? 'Replace Token' : 'Enter Token'}
            </label>
            <input
              ref={inputRef}
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="dapi..."
              className="modal-input"
              disabled={isSaving}
            />
          </div>

          {message && (
            <div className={`pat-message pat-message-${message.type}`}>
              {message.text}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="modal-button modal-button-cancel"
            disabled={isSaving}
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!token.trim() || isSaving}
            className="modal-button modal-button-save"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
