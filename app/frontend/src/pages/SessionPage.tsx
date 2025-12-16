import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Input, Tag, Typography, Flex, Tooltip, Spin } from 'antd';
import {
  SendOutlined,
  EditOutlined,
  LinkOutlined,
  CloudSyncOutlined,
  CloudServerOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { useAgent } from '../hooks/useAgent';
import TitleEditModal from '../components/TitleEditModal';
import MessageRenderer from '../components/MessageRenderer';

const { Text } = Typography;

interface LocationState {
  initialMessage?: string;
  model?: string;
}

const PAT_STORAGE_KEY = 'databricks_pat';

export default function SessionPage() {
  const { t } = useTranslation();
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const [input, setInput] = useState('');
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [sessionAutoSync, setSessionAutoSync] = useState(false);
  const [sessionWorkspacePath, setSessionWorkspacePath] = useState<
    string | null
  >(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasPat, setHasPat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialMessageConsumedRef = useRef(false);
  const prevSessionIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const checkPat = () => {
      const token = localStorage.getItem(PAT_STORAGE_KEY);
      setHasPat(!!token);
    };
    checkPat();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === PAT_STORAGE_KEY) {
        checkPat();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    const handlePatChange = () => checkPat();
    window.addEventListener('pat-changed', handlePatChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('pat-changed', handlePatChange);
    };
  }, []);

  if (prevSessionIdRef.current !== sessionId) {
    initialMessageConsumedRef.current = false;
    prevSessionIdRef.current = sessionId;
  }

  useEffect(() => {
    if (!sessionId) return;

    const fetchSession = async () => {
      try {
        const response = await fetch(`/api/v1/sessions`);
        if (response.ok) {
          const data = await response.json();
          const session = data.sessions?.find(
            (s: { id: string }) => s.id === sessionId
          );
          if (session) {
            if (session.title) {
              setSessionTitle(session.title);
            }
            setSessionAutoSync(session.autoSync ?? false);
            setSessionWorkspacePath(session.workspacePath ?? null);
          }
        }
      } catch (error) {
        console.error('Failed to fetch session:', error);
      }
    };

    fetchSession();
  }, [sessionId]);

  const handleSaveSettings = useCallback(
    async (newTitle: string, autoSync: boolean) => {
      if (!sessionId) return;

      const response = await fetch(`/api/v1/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, autoSync }),
      });

      if (response.ok) {
        setSessionTitle(newTitle);
        setSessionAutoSync(autoSync);
      } else {
        throw new Error('Failed to update session settings');
      }
    },
    [sessionId]
  );

  const handleWorkspacePathClick = useCallback(async () => {
    if (!sessionWorkspacePath) return;

    try {
      const token = localStorage.getItem('databricks_pat');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['x-databricks-token'] = token;
      }

      const response = await fetch('/api/v1/workspace/status', {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: sessionWorkspacePath }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.browse_url) {
          window.open(data.browse_url, '_blank');
        }
      } else {
        console.error('Failed to get workspace status');
      }
    } catch (error) {
      console.error('Error fetching workspace status:', error);
    }
  }, [sessionWorkspacePath]);

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
    isReconnecting,
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

  const handleSubmit = () => {
    if (input.trim() && !isProcessing) {
      sendMessage(input.trim());
      setInput('');
    }
  };

  const getStatusColor = () => {
    if (isConnected) return '#4caf50';
    if (isReconnecting) return '#ff9800';
    return '#f44336';
  };

  const getStatusText = () => {
    if (isConnected) return t('sessionPage.connected');
    if (isReconnecting) return t('sessionPage.reconnecting');
    return t('sessionPage.disconnected');
  };

  return (
    <Flex
      vertical
      style={{
        height: '100%',
        background: '#fff',
      }}
    >
      {/* Header */}
      <Flex
        justify="space-between"
        align="center"
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fff',
        }}
      >
        <Flex align="center" gap={8} style={{ minWidth: 0, flex: 1 }}>
          <Tooltip
            title={
              sessionAutoSync
                ? t('sidebar.autoSync')
                : t('sessionPage.autoSyncDisabled')
            }
          >
            {sessionAutoSync ? (
              <CloudSyncOutlined style={{ fontSize: 22, color: '#4caf50' }} />
            ) : (
              <CloudServerOutlined
                style={{ fontSize: 22, color: '#999', opacity: 0.6 }}
              />
            )}
          </Tooltip>
          <Button
            type="text"
            onClick={() => setIsModalOpen(true)}
            style={{
              padding: '4px 8px',
              height: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Text
              strong
              style={{
                maxWidth: 300,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {sessionTitle || `Session ${sessionId?.slice(0, 8)}...`}
            </Text>
            <EditOutlined style={{ color: '#999', fontSize: 12 }} />
          </Button>
          {sessionWorkspacePath && (
            <Flex align="center" gap={4} style={{ marginLeft: 8 }}>
              <FolderOutlined style={{ fontSize: 12, color: '#666' }} />
              <Text style={{ fontSize: 12, color: '#666' }}>
                {sessionWorkspacePath}
              </Text>
              <Button
                type="text"
                size="small"
                icon={<LinkOutlined />}
                onClick={handleWorkspacePathClick}
                title={t('sessionPage.openInDatabricks')}
              />
            </Flex>
          )}
        </Flex>
        <Flex align="center" gap={12}>
          <Tag style={{ margin: 0 }}>{selectedModel}</Tag>
          <Tooltip title={getStatusText()}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: getStatusColor(),
                animation: isReconnecting
                  ? 'pulse 1s ease-in-out infinite'
                  : undefined,
              }}
            />
          </Tooltip>
        </Flex>
      </Flex>

      <TitleEditModal
        isOpen={isModalOpen}
        currentTitle={sessionTitle || `Session ${sessionId?.slice(0, 8)}...`}
        currentAutoSync={sessionAutoSync}
        onSave={handleSaveSettings}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          background: '#fafafa',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            flex: 1,
            maxWidth: 768,
            width: '100%',
            margin: '0 auto',
            paddingBottom: 16,
          }}
        >
          {messages.length === 0 && !isProcessing && !isLoadingHistory && (
            <Flex
              justify="center"
              align="center"
              style={{ padding: 32, color: '#999' }}
            >
              <Text type="secondary">
                {t('sessionPage.waitingForResponse')}
              </Text>
            </Flex>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              style={{
                display: 'flex',
                gap: 12,
                padding: '16px 24px',
                background: '#fff',
                borderBottom: '1px solid #f5f5f5',
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  width: 24,
                  fontSize: 14,
                  fontWeight: 600,
                  paddingTop: 2,
                  color: message.role === 'user' ? '#4ec9b0' : '#f5a623',
                }}
              >
                {message.role === 'user' ? '>' : '◆'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <MessageRenderer
                  content={message.content}
                  role={message.role as 'user' | 'agent'}
                />
              </div>
            </div>
          ))}

          {isProcessing &&
            messages.length > 0 &&
            messages[messages.length - 1].role === 'user' && (
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '16px 24px',
                  background: '#fff',
                  borderBottom: '1px solid #f5f5f5',
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: 24,
                    fontSize: 14,
                    fontWeight: 600,
                    paddingTop: 2,
                    color: '#f5a623',
                  }}
                >
                  ◆
                </div>
                <Spin size="small" />
              </div>
            )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <div
          style={{
            position: 'sticky',
            bottom: 24,
            margin: '0 auto 24px',
            maxWidth: 768,
            width: 'calc(100% - 48px)',
            background: '#fff',
            border: '1px solid #e5e5e5',
            borderRadius: 12,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            padding: '12px 16px',
          }}
        >
          <Flex gap={8} align="center">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPressEnter={(e) => {
                if (!e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={t('sessionPage.typeMessage')}
              disabled={!isConnected || isProcessing || !hasPat}
              variant="borderless"
              style={{ flex: 1 }}
            />
            <Tooltip title={!hasPat ? t('sidebar.patRequired') : ''}>
              <Button
                type="primary"
                shape="circle"
                icon={<SendOutlined />}
                disabled={
                  !isConnected || isProcessing || !input.trim() || !hasPat
                }
                onClick={handleSubmit}
              />
            </Tooltip>
          </Flex>
        </div>
      </div>
    </Flex>
  );
}
