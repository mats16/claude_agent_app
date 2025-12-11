import { useState } from 'react';
import './App.css';

function App() {
  const [message, setMessage] = useState<string>('');
  const [health, setHealth] = useState<string>('');

  const fetchHello = async () => {
    const response = await fetch('/api/hello');
    const data = await response.json();
    setMessage(JSON.stringify(data, null, 2));
  };

  const fetchHealth = async () => {
    const response = await fetch('/api/health');
    const data = await response.json();
    setHealth(JSON.stringify(data, null, 2));
  };

  return (
    <div className="container">
      <h1>🚀 React + Express App</h1>
      <p className="subtitle">Turborepo Monorepo</p>

      <div className="card">
        <h3>📦 機能</h3>
        <ul className="feature-list">
          <li>React フロントエンド</li>
          <li>Express バックエンド</li>
          <li>Turborepo モノレポ</li>
          <li>TypeScript</li>
        </ul>
      </div>

      <div className="card">
        <h3>🧪 API テスト</h3>
        <button onClick={fetchHello}>Hello API</button>
        <button onClick={fetchHealth}>Health Check</button>
        {message && (
          <pre className="response">{message}</pre>
        )}
        {health && (
          <pre className="response">{health}</pre>
        )}
      </div>
    </div>
  );
}

export default App;
