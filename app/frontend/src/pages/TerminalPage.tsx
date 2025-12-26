import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Flex, Typography, Tooltip, Spin } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import { init, Terminal } from 'ghostty-web';
import { colors, spacing, typography } from '../styles/theme';
import { sectionHeaderStyle } from '../styles/common';
import { getWebSocketUrl } from '../utils/websocket';

const { Text } = Typography;

// Terminal theme matching our app's dark mode
const terminalTheme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: colors.brand,
  cursorAccent: '#1e1e1e',
  selectionBackground: 'rgba(245, 166, 35, 0.3)',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5',
};

interface TerminalMessage {
  type: 'connected' | 'output' | 'exit' | 'error';
  data?: string;
  cwd?: string;
  exitCode?: number;
  signal?: number;
  error?: string;
}

export default function TerminalPage() {
  const { t } = useTranslation();
  const { sessionId } = useParams<{ sessionId: string }>();
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // Connection ID to track and invalidate stale connections (StrictMode protection)
  const connectionIdRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [cwd, setCwd] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!sessionId || !terminalRef.current) return;

    // Increment connection ID to invalidate any previous connection's events
    const thisConnectionId = ++connectionIdRef.current;
    console.log(`Terminal starting connection #${thisConnectionId}`);

    setIsInitializing(true);
    setError(null);

    // Clean up any existing instances before creating new ones
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.dispose();
      terminalInstanceRef.current = null;
    }
    if (wsRef.current) {
      // Remove handlers before closing to prevent stale events
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    // Clear the container
    terminalRef.current.innerHTML = '';

    try {
      // Initialize ghostty-web WASM
      await init();

      // Check if this connection is still valid (not superseded by a newer one)
      if (thisConnectionId !== connectionIdRef.current) {
        console.log(
          `Terminal connection #${thisConnectionId} superseded, aborting`
        );
        return;
      }

      // Create terminal instance
      const term = new Terminal({
        fontSize: 14,
        theme: terminalTheme,
      });

      terminalInstanceRef.current = term;

      // Open terminal in the container
      term.open(terminalRef.current);

      // Set up WebSocket connection
      const wsUrl = getWebSocketUrl(
        `/api/v1/sessions/${sessionId}/terminal/ws`
      );
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (thisConnectionId !== connectionIdRef.current) return;
        console.log(`Terminal WebSocket connected (#${thisConnectionId})`);
      };

      ws.onmessage = (event) => {
        // Ignore messages from stale connections
        if (thisConnectionId !== connectionIdRef.current) return;

        try {
          const message = JSON.parse(event.data) as TerminalMessage;

          switch (message.type) {
            case 'connected':
              setIsConnected(true);
              setIsInitializing(false);
              if (message.cwd) {
                setCwd(message.cwd);
              }
              break;

            case 'output':
              if (message.data && terminalInstanceRef.current) {
                terminalInstanceRef.current.write(message.data);
              }
              break;

            case 'exit':
              setIsConnected(false);
              if (terminalInstanceRef.current) {
                terminalInstanceRef.current.write(
                  `\r\n\x1b[33m[Process exited with code ${message.exitCode}]\x1b[0m\r\n`
                );
              }
              break;

            case 'error':
              setError(message.error || 'Unknown error');
              setIsConnected(false);
              setIsInitializing(false);
              break;
          }
        } catch (e) {
          console.error('Failed to parse terminal message:', e);
        }
      };

      ws.onerror = (event) => {
        if (thisConnectionId !== connectionIdRef.current) return;
        console.error('Terminal WebSocket error:', event);
        setError('Connection error');
        setIsConnected(false);
        setIsInitializing(false);
      };

      ws.onclose = () => {
        if (thisConnectionId !== connectionIdRef.current) return;
        console.log(`Terminal WebSocket closed (#${thisConnectionId})`);
        setIsConnected(false);
      };

      // Send terminal input to WebSocket
      term.onData((data: string) => {
        // Only send if this is still the active connection
        if (thisConnectionId !== connectionIdRef.current) return;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      });

      // Handle terminal resize
      const sendResize = () => {
        if (thisConnectionId !== connectionIdRef.current) return;
        if (terminalRef.current) {
          // Get the terminal dimensions
          const container = terminalRef.current;
          const style = getComputedStyle(container);
          const width =
            container.clientWidth -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight);
          const height =
            container.clientHeight -
            parseFloat(style.paddingTop) -
            parseFloat(style.paddingBottom);

          // Calculate cols and rows based on character size (approximate)
          const charWidth = 9; // Approximate character width at 14px font
          const charHeight = 17; // Approximate line height at 14px font
          const cols = Math.floor(width / charWidth);
          const rows = Math.floor(height / charHeight);

          if (cols > 0 && rows > 0) {
            // Resize the terminal view
            try {
              term.resize(cols, rows);
            } catch (e) {
              // Ignore resize errors
            }

            // Send resize to backend PTY
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'resize', cols, rows }));
            }
          }
        }
      };

      // Set up ResizeObserver
      resizeObserverRef.current = new ResizeObserver(() => {
        sendResize();
      });
      resizeObserverRef.current.observe(terminalRef.current);

      // Initial resize - call immediately and also with a delay to ensure it takes effect
      sendResize();
      setTimeout(sendResize, 100);
      setTimeout(sendResize, 500);
    } catch (e) {
      console.error('Failed to initialize terminal:', e);
      setError('Failed to initialize terminal');
      setIsInitializing(false);
    }
  }, [sessionId]);

  // Cleanup function
  const cleanup = useCallback(() => {
    // Invalidate any active connection
    connectionIdRef.current++;

    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.dispose();
      terminalInstanceRef.current = null;
    }

    setIsConnected(false);
  }, []);

  // Reconnect function
  const handleReconnect = useCallback(() => {
    cleanup();
    connect();
  }, [cleanup, connect]);

  // Initialize on mount
  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

  return (
    <Flex
      vertical
      style={{
        height: '100%',
        background: colors.background,
      }}
    >
      {/* Header */}
      <Flex justify="space-between" align="center" style={sectionHeaderStyle}>
        <Flex align="center" gap={spacing.sm}>
          <Link to={`/sessions/${sessionId}`}>
            <Button type="text" icon={<ArrowLeftOutlined />} size="small">
              {t('terminal.backToSession')}
            </Button>
          </Link>
          <Text
            strong
            style={{
              marginLeft: spacing.sm,
              color: colors.textPrimary,
            }}
          >
            {t('terminal.title')}
          </Text>
          {cwd && (
            <Text
              type="secondary"
              style={{
                marginLeft: spacing.sm,
                fontSize: typography.fontSizeSmall,
                fontFamily: typography.fontFamilyMono,
              }}
            >
              {cwd}
            </Text>
          )}
        </Flex>
        <Flex align="center" gap={spacing.sm}>
          <Tooltip
            title={
              isConnected ? t('terminal.connected') : t('terminal.disconnected')
            }
          >
            <div
              style={{
                width: spacing.sm,
                height: spacing.sm,
                borderRadius: '50%',
                background: isConnected ? colors.success : colors.error,
              }}
            />
          </Tooltip>
          <Button
            type="text"
            icon={<ReloadOutlined />}
            size="small"
            onClick={handleReconnect}
            title={t('terminal.reconnect')}
          />
        </Flex>
      </Flex>

      {/* Terminal Container */}
      <div
        style={{
          flex: 1,
          background: terminalTheme.background,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {isInitializing && (
          <Flex
            justify="center"
            align="center"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.8)',
              zIndex: 10,
            }}
          >
            <Spin size="large" />
          </Flex>
        )}

        {error && (
          <Flex
            justify="center"
            align="center"
            vertical
            gap={spacing.md}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.9)',
              zIndex: 10,
            }}
          >
            <Text style={{ color: colors.error }}>{error}</Text>
            <Button onClick={handleReconnect}>{t('terminal.retry')}</Button>
          </Flex>
        )}

        <div
          ref={terminalRef}
          className="terminal-container"
          style={{
            width: '100%',
            height: '100%',
            padding: spacing.sm,
          }}
        />
      </div>
    </Flex>
  );
}
