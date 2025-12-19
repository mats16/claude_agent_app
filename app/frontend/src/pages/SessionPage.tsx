import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Tag, Typography, Flex, Tooltip, Spin } from 'antd';
import {
  EditOutlined,
  LinkOutlined,
  CloudSyncOutlined,
  CloudServerOutlined,
  FolderOutlined,
  RobotOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useAgent } from '../hooks/useAgent';
import { useImageUpload } from '../hooks/useImageUpload';
import { useSessions } from '../contexts/SessionsContext';
import TitleEditModal from '../components/TitleEditModal';
import MessageRenderer from '../components/MessageRenderer';
import ChatInput from '../components/ChatInput';
import {
  colors,
  spacing,
  borderRadius,
  layout,
  typography,
} from '../styles/theme';
import {
  sectionHeaderStyle,
  getDropZoneStyle,
  dropZoneOverlayStyle,
  ellipsisStyle,
  userMessageBubbleStyle,
  getStatusColor,
} from '../styles/common';

const { Text } = Typography;

// Typewriter effect component for "Thinking..." text
function ThinkingIndicator() {
  const text = 'Thinking...';
  const [displayedText, setDisplayedText] = useState('');
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    if (charIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(text.slice(0, charIndex + 1));
        setCharIndex(charIndex + 1);
      }, 50);
      return () => clearTimeout(timeout);
    } else {
      // Reset to loop the animation
      const timeout = setTimeout(() => {
        setDisplayedText('');
        setCharIndex(0);
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [charIndex]);

  return (
    <Flex align="center" gap={spacing.sm}>
      <Spin size="small" />
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: typography.fontSizeSmall,
          fontFamily: 'monospace',
          minWidth: 80,
        }}
      >
        {displayedText}
      </Text>
    </Flex>
  );
}

interface LocationState {
  initialMessage?: string;
  model?: string;
}

function isLocationState(state: unknown): state is LocationState {
  if (state === null || typeof state !== 'object') {
    return false;
  }
  const s = state as Record<string, unknown>;
  return (
    (s.initialMessage === undefined || typeof s.initialMessage === 'string') &&
    (s.model === undefined || typeof s.model === 'string')
  );
}

export default function SessionPage() {
  const { t } = useTranslation();
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const { getSession, updateSessionLocally } = useSessions();
  const [input, setInput] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const maxImages = 5;
  const initialMessageConsumedRef = useRef(false);
  const prevSessionIdRef = useRef<string | undefined>(undefined);

  if (prevSessionIdRef.current !== sessionId) {
    initialMessageConsumedRef.current = false;
    prevSessionIdRef.current = sessionId;
  }

  // Get session data from context
  const session = sessionId ? getSession(sessionId) : undefined;
  const isArchived = session?.isArchived ?? false;
  const sessionTitle = session?.title ?? null;
  const sessionAutoWorkspacePush = session?.autoWorkspacePush ?? false;
  const sessionWorkspacePath = session?.workspacePath ?? null;

  const handleSaveSettings = useCallback(
    async (
      newTitle: string,
      autoWorkspacePush: boolean,
      workspacePath: string | null
    ) => {
      if (!sessionId) return;

      const response = await fetch(`/api/v1/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          autoWorkspacePush,
          workspacePath,
        }),
      });

      if (response.ok) {
        updateSessionLocally(sessionId, {
          title: newTitle,
          autoWorkspacePush,
          workspacePath,
        });
      } else {
        throw new Error('Failed to update session settings');
      }
    },
    [sessionId, updateSessionLocally]
  );

  const handleWorkspacePathClick = useCallback(async () => {
    if (!sessionWorkspacePath) return;

    try {
      const response = await fetch('/api/v1/workspace/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const locationState = isLocationState(location.state) ? location.state : null;
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
    sessionNotFound,
    connectionError,
    sendMessage,
    selectedModel,
  } = useAgent({
    sessionId,
    initialMessage,
  });

  // Image upload handling via custom hook
  const {
    attachedImages,
    setAttachedImages,
    isConverting,
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    convertImages,
    clearImages,
  } = useImageUpload({
    maxImages,
    isDisabled: () => !isConnected || isConverting,
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Check if user is at bottom of scroll container
  const checkIsAtBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    const threshold = 100; // pixels from bottom tolerance
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold
    );
  }, []);

  // Handle scroll events to track position
  const handleScrollContainer = useCallback(() => {
    isAtBottomRef.current = checkIsAtBottom();
  }, [checkIsAtBottom]);

  // Auto-scroll only if user was already at bottom
  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom();
    }
  }, [messages]);

  const handleSubmit = useCallback(async () => {
    if ((!input.trim() && attachedImages.length === 0) || isConverting) {
      return;
    }

    try {
      // Convert attached images to WebP format using hook
      const imageContents = await convertImages();

      // Send message with images
      sendMessage(input.trim(), imageContents);

      // Clear input and images
      setInput('');
      clearImages();
    } catch (error) {
      console.error('Failed to convert images:', error);
    }
  }, [
    input,
    attachedImages,
    isConverting,
    sendMessage,
    convertImages,
    clearImages,
  ]);

  const getStatusText = () => {
    if (connectionError) return connectionError;
    if (isConnected) return t('sessionPage.connected');
    if (isReconnecting) return t('sessionPage.reconnecting');
    return t('sessionPage.disconnected');
  };

  // Show not found page if session doesn't exist
  if (sessionNotFound) {
    return (
      <Flex
        vertical
        justify="center"
        align="center"
        style={{
          height: '100%',
          background: colors.background,
        }}
      >
        <Flex
          vertical
          align="center"
          gap={spacing.lg}
          style={{ maxWidth: 400, textAlign: 'center' }}
        >
          <ExclamationCircleOutlined
            style={{
              fontSize: 64,
              color: colors.warning,
            }}
          />
          <Text
            style={{
              fontSize: typography.fontSizeLarge,
              fontWeight: typography.fontWeightMedium,
              color: colors.textPrimary,
            }}
          >
            {t('sessionPage.notFound')}
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
            }}
          >
            {t('sessionPage.notFoundDescription')}
          </Text>
        </Flex>
      </Flex>
    );
  }

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
        <Flex align="center" gap={spacing.sm} style={{ minWidth: 0, flex: 1 }}>
          <Tooltip
            title={
              sessionAutoWorkspacePush
                ? t('sidebar.autoSync')
                : t('sessionPage.autoSyncDisabled')
            }
          >
            {sessionAutoWorkspacePush ? (
              <CloudSyncOutlined
                style={{ fontSize: 22, color: colors.success }}
              />
            ) : (
              <CloudServerOutlined
                style={{ fontSize: 22, color: colors.textMuted, opacity: 0.6 }}
              />
            )}
          </Tooltip>
          <Button
            type="text"
            onClick={() => setIsModalOpen(true)}
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
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
                ...ellipsisStyle,
              }}
            >
              {sessionTitle || `Session ${sessionId?.slice(0, 8)}...`}
            </Text>
            <EditOutlined
              style={{
                color: colors.textMuted,
                fontSize: typography.fontSizeSmall,
              }}
            />
          </Button>
          {sessionWorkspacePath && (
            <Flex
              align="center"
              gap={spacing.xs}
              style={{ marginLeft: spacing.sm }}
            >
              <FolderOutlined
                style={{
                  fontSize: typography.fontSizeSmall,
                  color: colors.textSecondary,
                }}
              />
              <Text
                style={{
                  fontSize: typography.fontSizeSmall,
                  color: colors.textSecondary,
                }}
              >
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
        <Flex align="center" gap={spacing.md}>
          <Tag style={{ margin: 0 }}>{selectedModel}</Tag>
          <Tooltip title={getStatusText()}>
            <div
              style={{
                width: spacing.sm,
                height: spacing.sm,
                borderRadius: '50%',
                background: getStatusColor(isConnected, isReconnecting),
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
        currentAutoWorkspacePush={sessionAutoWorkspacePush}
        currentWorkspacePath={sessionWorkspacePath}
        onSave={handleSaveSettings}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Messages - Drop Zone */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScrollContainer}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          flex: 1,
          overflow: 'auto',
          background: isDragging ? colors.brandLight : colors.background,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          ...getDropZoneStyle(isDragging),
        }}
      >
        {isDragging && (
          <div style={dropZoneOverlayStyle}>
            <span
              style={{
                color: colors.brand,
                fontWeight: typography.fontWeightMedium,
                fontSize: typography.fontSizeLarge,
              }}
            >
              {t('imageUpload.dropHere')}
            </span>
          </div>
        )}
        <div
          style={{
            flex: 1,
            maxWidth: layout.maxContentWidth,
            width: '100%',
            margin: '0 auto',
            paddingBottom: spacing.lg,
          }}
        >
          {messages.length === 0 && !isProcessing && !isLoadingHistory && (
            <Flex
              justify="center"
              align="center"
              style={{ padding: spacing.xxxl, color: colors.textMuted }}
            >
              <Text type="secondary">
                {t('sessionPage.waitingForResponse')}
              </Text>
            </Flex>
          )}

          {messages.map((message, index) => {
            const isLastMessage = index === messages.length - 1;
            const showSpinnerInMessage =
              isProcessing && isLastMessage && message.role === 'agent';
            const isUser = message.role === 'user';

            return (
              <div
                key={message.id}
                style={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                  padding: `${spacing.lg}px ${spacing.xxl}px`,
                }}
              >
                {!isUser && (
                  <div
                    style={{
                      flexShrink: 0,
                      width: spacing.xxl,
                      fontSize: typography.fontSizeLarge,
                      paddingTop: 2,
                      color: colors.textPrimary,
                      marginRight: spacing.md,
                    }}
                  >
                    <RobotOutlined />
                  </div>
                )}
                <div
                  style={{
                    maxWidth: isUser ? '80%' : '100%',
                    minWidth: 0,
                    ...(isUser ? userMessageBubbleStyle : { flex: 1 }),
                  }}
                >
                  <MessageRenderer
                    content={message.content}
                    role={message.role as 'user' | 'agent'}
                    images={message.images}
                  />
                  {showSpinnerInMessage && (
                    <div style={{ marginTop: spacing.sm }}>
                      <ThinkingIndicator />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isProcessing &&
            messages.length > 0 &&
            messages[messages.length - 1].role === 'user' && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-start',
                  padding: `${spacing.lg}px ${spacing.xxl}px`,
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: spacing.xxl,
                    fontSize: typography.fontSizeLarge,
                    paddingTop: 2,
                    color: colors.textPrimary,
                    marginRight: spacing.md,
                  }}
                >
                  <RobotOutlined />
                </div>
                <ThinkingIndicator />
              </div>
            )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Form - Hidden for archived sessions */}
        {!isArchived && (
          <ChatInput
            input={input}
            onInputChange={setInput}
            attachedImages={attachedImages}
            onImagesChange={setAttachedImages}
            disabled={!isConnected}
            isConverting={isConverting}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </Flex>
  );
}
