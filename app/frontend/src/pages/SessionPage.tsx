import { useState, useRef, useEffect, useCallback, DragEvent } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Input,
  Tag,
  Typography,
  Flex,
  Tooltip,
  Spin,
  message,
} from 'antd';
import {
  SendOutlined,
  EditOutlined,
  LinkOutlined,
  CloudSyncOutlined,
  CloudServerOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { useAgent } from '../hooks/useAgent';
import { useSessions } from '../contexts/SessionsContext';
import TitleEditModal from '../components/TitleEditModal';
import MessageRenderer from '../components/MessageRenderer';
import ImageUpload, { AttachedImage } from '../components/ImageUpload';
import {
  convertToWebP,
  revokePreviewUrl,
  isSupportedImageType,
  isWithinSizeLimit,
  createPreviewUrl,
} from '../utils/imageUtils';
import type { ImageContent } from '@app/shared';

const { Text } = Typography;
const { TextArea } = Input;

interface LocationState {
  initialMessage?: string;
  model?: string;
}

export default function SessionPage() {
  const { t } = useTranslation();
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const { getSession, updateSessionLocally } = useSessions();
  const [input, setInput] = useState('');
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [sessionAutoWorkspacePush, setSessionAutoWorkspacePush] =
    useState(false);
  const [sessionWorkspacePath, setSessionWorkspacePath] = useState<
    string | null
  >(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const maxImages = 5;
  const initialMessageConsumedRef = useRef(false);
  const prevSessionIdRef = useRef<string | undefined>(undefined);

  if (prevSessionIdRef.current !== sessionId) {
    initialMessageConsumedRef.current = false;
    prevSessionIdRef.current = sessionId;
  }

  // Sync session data from context
  useEffect(() => {
    if (!sessionId) return;
    const session = getSession(sessionId);
    if (session) {
      if (session.title) {
        setSessionTitle(session.title);
      }
      setSessionAutoWorkspacePush(session.autoWorkspacePush ?? false);
      setSessionWorkspacePath(session.workspacePath ?? null);
    }
  }, [sessionId, getSession]);

  const handleSaveSettings = useCallback(
    async (newTitle: string, autoWorkspacePush: boolean) => {
      if (!sessionId) return;

      const response = await fetch(`/api/v1/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, autoWorkspacePush }),
      });

      if (response.ok) {
        setSessionTitle(newTitle);
        setSessionAutoWorkspacePush(autoWorkspacePush);
        updateSessionLocally(sessionId, { title: newTitle, autoWorkspacePush });
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

  const handleSubmit = useCallback(async () => {
    if (
      (!input.trim() && attachedImages.length === 0) ||
      isProcessing ||
      isConverting
    ) {
      return;
    }

    setIsConverting(true);
    try {
      // Convert attached images to WebP format
      const imageContents: ImageContent[] = [];
      for (const img of attachedImages) {
        const converted = await convertToWebP(img.file);
        imageContents.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: converted.media_type,
            data: converted.data,
          },
        });
      }

      // Send message with images
      sendMessage(input.trim(), imageContents);

      // Clear input and images
      setInput('');
      // Revoke preview URLs to free memory
      attachedImages.forEach((img) => revokePreviewUrl(img.previewUrl));
      setAttachedImages([]);
    } catch (error) {
      console.error('Failed to convert images:', error);
    } finally {
      setIsConverting(false);
    }
  }, [input, attachedImages, isProcessing, isConverting, sendMessage]);

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

  // Drag & drop handlers for the entire content area
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if leaving the drop zone entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (!isConnected || isProcessing || isConverting) return;

      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;

      const validFiles: AttachedImage[] = [];

      for (const file of Array.from(files)) {
        if (attachedImages.length + validFiles.length >= maxImages) {
          message.warning(
            t('imageUpload.maxImagesReached', { max: maxImages })
          );
          break;
        }

        if (!isSupportedImageType(file)) {
          message.error(t('imageUpload.unsupportedType', { name: file.name }));
          continue;
        }

        if (!isWithinSizeLimit(file)) {
          message.error(t('imageUpload.fileTooLarge', { name: file.name }));
          continue;
        }

        validFiles.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          file,
          previewUrl: createPreviewUrl(file),
        });
      }

      if (validFiles.length > 0) {
        setAttachedImages((prev) => [...prev, ...validFiles]);
      }
    },
    [attachedImages, isConnected, isProcessing, isConverting, t, maxImages]
  );

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
              sessionAutoWorkspacePush
                ? t('sidebar.autoSync')
                : t('sessionPage.autoSyncDisabled')
            }
          >
            {sessionAutoWorkspacePush ? (
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
        currentAutoWorkspacePush={sessionAutoWorkspacePush}
        onSave={handleSaveSettings}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Messages - Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          flex: 1,
          overflow: 'auto',
          background: isDragging ? 'rgba(245, 166, 35, 0.05)' : '#fafafa',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          border: isDragging ? '2px dashed #f5a623' : '2px solid transparent',
          transition: 'all 0.2s ease',
        }}
      >
        {isDragging && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(245, 166, 35, 0.1)',
              zIndex: 10,
              pointerEvents: 'none',
            }}
          >
            <span style={{ color: '#f5a623', fontWeight: 500, fontSize: 16 }}>
              {t('imageUpload.dropHere')}
            </span>
          </div>
        )}
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

          {messages.map((message, index) => {
            const isLastMessage = index === messages.length - 1;
            const showSpinnerInMessage =
              isProcessing && isLastMessage && message.role === 'agent';

            return (
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
                    images={message.images}
                  />
                  {showSpinnerInMessage && (
                    <Spin size="small" style={{ marginTop: 8 }} />
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
          <Flex vertical gap={8}>
            {/* Image previews above input */}
            <ImageUpload
              images={attachedImages}
              onImagesChange={setAttachedImages}
              disabled={!isConnected || isProcessing || isConverting}
              showButtonOnly={false}
            />
            <Flex gap={8} align="flex-end">
              <TextArea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={t('sessionPage.typeMessage')}
                disabled={!isConnected || isProcessing || isConverting}
                variant="borderless"
                autoSize={{ minRows: 1, maxRows: 9 }}
                style={{ flex: 1, padding: 0, alignSelf: 'stretch' }}
              />
              <ImageUpload
                images={attachedImages}
                onImagesChange={setAttachedImages}
                disabled={!isConnected || isProcessing || isConverting}
                showButtonOnly={true}
              />
              <Button
                type="primary"
                shape="circle"
                icon={<SendOutlined />}
                disabled={
                  !isConnected ||
                  isProcessing ||
                  isConverting ||
                  (!input.trim() && attachedImages.length === 0)
                }
                loading={isConverting}
                onClick={handleSubmit}
              />
            </Flex>
          </Flex>
        </div>
      </div>
    </Flex>
  );
}
