import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/500.css';
import '@fontsource/noto-sans-jp/700.css';
import App from './App';
import { UserProvider } from './contexts/UserContext';
import { SessionsProvider } from './contexts/SessionsContext';
import { useCssVariables } from './hooks/useCssVariables';
import { antdTheme } from './styles/theme';
import './i18n';
import './index.css';

function AppWrapper() {
  useCssVariables();
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ConfigProvider theme={antdTheme}>
        <UserProvider>
          <SessionsProvider>
            <AppWrapper />
          </SessionsProvider>
        </UserProvider>
      </ConfigProvider>
    </BrowserRouter>
  </React.StrictMode>
);
