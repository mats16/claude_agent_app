import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import SessionPage from './pages/SessionPage';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/sessions/:sessionId" element={<SessionPage />} />
    </Routes>
  );
}

export default App;
