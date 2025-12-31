import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useDraft, getSessionDraftKey } from '../hooks/useDraft';
import { useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Typography, Flex, Tooltip, Spin } from 'antd';
import {
  EditOutlined,
  CloudSyncOutlined,
  CloudServerOutlined,
  FolderOutlined,
  RobotOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useAgent } from '../hooks/useAgent';
import { useImageUpload } from '../hooks/useImageUpload';
import { useFileUpload } from '../hooks/useFileUpload';
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
    <Flex align="center" gap={spacing.sm} style={{ height: 22 }}>
      <Spin size="small" />
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: typography.fontSizeSmall,
          fontFamily: 'monospace',
          minWidth: 80,
        }}
      >
        {displayedText || '\u00A0'}
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
  const {
    getSession,
    updateSessionLocally,
    isLoading: isLoadingSessions,
  } = useSessions();
  const draftKey = useMemo(
    () => (sessionId ? getSessionDraftKey(sessionId) : ''),
    [sessionId]
  );
  const [input, setInput, clearInputDraft] = useDraft(draftKey);
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
  const sessionDatabricksWorkspaceAutoPush =
    session?.databricksWorkspaceAutoPush ?? false;
  const sessionDatabricksWorkspacePath =
    session?.databricksWorkspacePath ?? null;
  const sessionWorkspaceUrl = session?.workspaceUrl ?? null;

  // Fetch session details (workspace_url, last_used_model) when session page loads
  useEffect(() => {
    if (!sessionId) return;
    // Skip if we already have workspace_url and lastUsedModel
    const needsFetch =
      (sessionDatabricksWorkspacePath && !sessionWorkspaceUrl) ||
      session?.lastUsedModel === undefined;
    if (needsFetch) {
      const fetchSessionDetails = async () => {
        try {
          const response = await fetch(`/api/v1/sessions/${sessionId}`);
          if (response.ok) {
            const data = await response.json();
            const updates: Record<string, unknown> = {};
            if (data.workspace_url) {
              updates.workspaceUrl = data.workspace_url;
            }
            if (data.last_used_model !== undefined) {
              updates.lastUsedModel = data.last_used_model;
            }
            if (Object.keys(updates).length > 0) {
              updateSessionLocally(sessionId, updates);
            }
          }
        } catch (error) {
          console.error('Failed to fetch session details:', error);
        }
      };
      fetchSessionDetails();
    }
  }, [
    sessionId,
    sessionDatabricksWorkspacePath,
    sessionWorkspaceUrl,
    session?.lastUsedModel,
    updateSessionLocally,
  ]);

  // Removed app auto-deploy functionality

  const handleSaveSettings = useCallback(
    async (
      newTitle: string,
      databricksWorkspaceAutoPush: boolean,
      databricksWorkspacePath: string | null
    ) => {
      if (!sessionId) return;

      const response = await fetch(`/api/v1/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          workspace_auto_push: databricksWorkspaceAutoPush,
          workspace_path: databricksWorkspacePath,
        }),
      });

      if (response.ok) {
        updateSessionLocally(sessionId, {
          title: newTitle,
          databricksWorkspaceAutoPush,
          databricksWorkspacePath,
        });
      } else {
        throw new Error('Failed to update session settings');
      }
    },
    [sessionId, updateSessionLocally]
  );

  const handleWorkspacePathClick = useCallback(() => {
    if (!sessionWorkspaceUrl) return;
    window.open(sessionWorkspaceUrl, '_blank');
  }, [sessionWorkspaceUrl]);

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
    stopAgent,
    selectedModel,
    setSelectedModel,
  } = useAgent({
    sessionId,
    initialMessage,
    model: locationState?.model || session?.lastUsedModel || undefined,
  });

  // Image upload handling via custom hook
  const {
    attachedImages,
    setAttachedImages,
    isConverting,
    convertImages,
    clearImages,
  } = useImageUpload({
    maxImages,
    isDisabled: () => isConverting,
  });

  // File upload handling via custom hook (with unified drag & drop for images)
  const {
    attachedFiles,
    setAttachedFiles,
    isUploading,
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    uploadTextFiles,
    convertPdfs,
    clearFiles,
  } = useFileUpload({
    maxFiles: 10,
    isDisabled: () => isUploading,
    // Unified drag & drop: pass image state to handle both images and files
    currentImages: attachedImages,
    maxImages,
    onImagesChange: setAttachedImages,
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
    const hasContent =
      input.trim() || attachedImages.length > 0 || attachedFiles.length > 0;
    if (!hasContent || isConverting || isUploading) {
      return;
    }

    try {
      let finalInput = input.trim();

      // Upload text files to server first (if any) and prepend @file_name references
      if (
        sessionId &&
        attachedFiles.some((f) => f.type === 'text' && f.status === 'pending')
      ) {
        const uploadedFileNames = await uploadTextFiles(sessionId);
        // Auto-prepend @file_name references for uploaded files
        if (uploadedFileNames.length > 0) {
          const fileReferences = uploadedFileNames
            .map((name) => `@${name}`)
            .join(' ');
          finalInput = finalInput
            ? `${fileReferences}\n${finalInput}`
            : fileReferences;
        }
      }

      // Convert PDFs to base64
      const pdfContents = await convertPdfs();

      // Convert attached images to WebP format
      const imageContents = await convertImages();

      // Send message with images and documents
      sendMessage(finalInput, imageContents, pdfContents);

      // Clear input, images, and files
      clearInputDraft();
      clearImages();
      clearFiles();
    } catch (error) {
      console.error('Failed to process attachments:', error);
    }
  }, [
    input,
    attachedImages,
    attachedFiles,
    isConverting,
    isUploading,
    sessionId,
    sendMessage,
    convertImages,
    convertPdfs,
    uploadTextFiles,
    clearImages,
    clearFiles,
    clearInputDraft,
  ]);

  const handleStop = useCallback(() => {
    stopAgent();
  }, [stopAgent]);

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
              sessionDatabricksWorkspaceAutoPush
                ? t('syncMode.autoPush')
                : t('sessionPage.autoSyncDisabled')
            }
          >
            {sessionDatabricksWorkspaceAutoPush ? (
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
              {isLoadingSessions && !session
                ? t('sessionPage.loading')
                : sessionTitle || t('sessionPage.untitled')}
            </Text>
            <EditOutlined
              style={{
                color: colors.textMuted,
                fontSize: typography.fontSizeSmall,
              }}
            />
          </Button>
        </Flex>
        {sessionWorkspaceUrl && (
          <Button
            type="text"
            size="small"
            icon={<FolderOutlined />}
            onClick={handleWorkspacePathClick}
            title={sessionDatabricksWorkspacePath ?? undefined}
            style={{
              marginRight: spacing.sm,
              color: colors.textSecondary,
              fontSize: typography.fontSizeSmall,
            }}
          >
            Open workspace
          </Button>
        )}
        <Tooltip title={getStatusText()} placement="left">
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

      <TitleEditModal
        isOpen={isModalOpen}
        currentTitle={sessionTitle || ''}
        currentDatabricksWorkspaceAutoPush={sessionDatabricksWorkspaceAutoPush}
        currentDatabricksWorkspacePath={sessionDatabricksWorkspacePath}
        onSave={handleSaveSettings}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Drop Zone - Covers everything below header */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          background: isDragging ? colors.brandLight : colors.background,
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

        {/* Messages - Scrollable area */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScrollContainer}
          style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
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
                      sessionId={sessionId}
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
        </div>

        {/* Input Form - Hidden for archived sessions */}
        {!isArchived && (
          <ChatInput
            input={input}
            onInputChange={setInput}
            attachedImages={attachedImages}
            onImagesChange={setAttachedImages}
            attachedFiles={attachedFiles}
            onFilesChange={setAttachedFiles}
            disabled={false}
            isConverting={isConverting}
            isUploading={isUploading}
            onSubmit={handleSubmit}
            onStop={handleStop}
            isAgentProcessing={isProcessing}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
        )}
      </div>
    </Flex>
  );
}
