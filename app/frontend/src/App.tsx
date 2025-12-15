import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import SessionPage from './pages/SessionPage';
import './App.css';

function WelcomePage() {
  return (
    <div className="welcome-panel">
      <div className="welcome-content">
        <div className="welcome-logo">
          <svg width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="30" width="80" height="50" rx="8" fill="#f5a623"/>
            <rect x="20" y="20" width="60" height="15" rx="4" fill="#f5a623"/>
            <circle cx="35" cy="50" r="8" fill="#1a1a1a"/>
            <circle cx="65" cy="50" r="8" fill="#1a1a1a"/>
            <rect x="30" y="65" width="40" height="5" rx="2" fill="#1a1a1a"/>
          </svg>
        </div>

        <div className="welcome-actions">
          <div className="action-card">
            <div className="action-card-content">
              <h3>Explore workspace files</h3>
              <p>List and read files in Databricks Workspace</p>
            </div>
            <div className="action-card-icon">
              <span>📁</span>
            </div>
          </div>

          <div className="action-card">
            <div className="action-card-content">
              <h3>Find performance issues</h3>
              <p>Identify slow code paths</p>
            </div>
            <div className="action-card-icon">
              <span>⚡</span>
            </div>
          </div>

          <div className="action-card">
            <div className="action-card-content">
              <h3>Fix a bug</h3>
              <p>Debug and resolve issues in your code</p>
            </div>
            <div className="action-card-icon">
              <span>🔧</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/sessions/:sessionId" element={<SessionPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
