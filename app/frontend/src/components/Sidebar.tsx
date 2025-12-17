import { useState, useEffect, useCallback, DragEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Input,
  Select,
  Checkbox,
  Tooltip,
  Typography,
  Flex,
  message,
} from 'antd';
import {
  SendOutlined,
  SyncOutlined,
  FolderOutlined,
  EditOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import SessionList from './SessionList';
import AccountMenu from './AccountMenu';
import WorkspaceSelectModal from './WorkspaceSelectModal';
import SettingsModal from './SettingsModal';
import ImageUpload, { AttachedImage } from './ImageUpload';
import {
  convertToWebP,
  revokePreviewUrl,
  isSupportedImageType,
  isWithinSizeLimit,
  createPreviewUrl,
} from '../utils/imageUtils';
import { useUser } from '../contexts/UserContext';
import type { ImageContent, MessageContent } from '@app/shared';

const { TextArea } = Input;
const { Text } = Typography;

interface SidebarProps {
  width?: number;
  onSessionCreated?: (sessionId: string) => void;
}

export default function Sidebar({ onSessionCreated }: SidebarProps) {
  const { t } = useTranslation();
  const { userInfo, isLoading } = useUser();
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(
    'databricks-claude-sonnet-4-5'
  );
  const [workspacePath, setWorkspacePath] = useState('');
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [overwrite, setOverwrite] = useState(true);
  const [autoWorkspacePush, setAutoWorkspacePush] = useState(true);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const navigate = useNavigate();

  const maxImages = 5;

  const hasPermission = userInfo?.hasWorkspacePermission ?? null;

  // Set default workspace path from userInfo
  useEffect(() => {
    if (
      userInfo?.hasWorkspacePermission &&
      userInfo.workspaceHome &&
      !workspacePath
    ) {
      setWorkspacePath(userInfo.workspaceHome);
    }
  }, [userInfo, workspacePath]);

  // Show permission modal if no permission after loading, hide if permission granted
  useEffect(() => {
    if (!isLoading) {
      if (hasPermission === false) {
        setShowPermissionModal(true);
      } else if (hasPermission === true) {
        setShowPermissionModal(false);
      }
    }
  }, [isLoading, hasPermission]);

  const handleSubmit = async () => {
    if (
      (!input.trim() && attachedImages.length === 0) ||
      isSubmitting ||
      isConverting
    )
      return;

    setIsSubmitting(true);
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

      // Build message content array
      const messageContent: MessageContent[] = [];
      if (input.trim()) {
        messageContent.push({ type: 'text', text: input.trim() });
      }
      messageContent.push(...imageContents);

      const response = await fetch('/api/v1/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events: [
            {
              uuid: crypto.randomUUID(),
              session_id: '',
              type: 'user',
              message: { role: 'user', content: messageContent },
            },
          ],
          session_context: {
            model: selectedModel,
            workspacePath: workspacePath.trim() || undefined,
            overwrite,
            autoWorkspacePush,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const data = await response.json();
      const sessionId = data.session_id;

      setInput('');
      // Revoke preview URLs to free memory
      attachedImages.forEach((img) => revokePreviewUrl(img.previewUrl));
      setAttachedImages([]);
      onSessionCreated?.(sessionId);

      navigate(`/sessions/${sessionId}`, {
        state: {
          initialMessage: input.trim(),
        },
      });
    } catch (error) {
      console.error('Failed to create session:', error);
    } finally {
      setIsSubmitting(false);
      setIsConverting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePermissionGranted = () => {
    setShowPermissionModal(false);
  };

  // Drag & drop handlers for the input section
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

      if (isSubmitting || isConverting) return;

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
    [attachedImages, isSubmitting, isConverting, t, maxImages]
  );

  return (
    <Flex
      vertical
      style={{
        height: '100%',
        background: '#F7F7F7',
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Typography.Title
            level={5}
            style={{ margin: 0, color: '#1a1a1a', fontWeight: 700 }}
          >
            {t('sidebar.title')}
          </Typography.Title>
        </Link>
      </div>

      {/* Input Section - Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #f0f0f0',
          position: 'relative',
          border: isDragging ? '2px dashed #f5a623' : '1px solid transparent',
          borderBottomColor: '#f0f0f0',
          background: isDragging ? 'rgba(245, 166, 35, 0.05)' : 'transparent',
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
            <span style={{ color: '#f5a623', fontWeight: 500 }}>
              {t('imageUpload.dropHere')}
            </span>
          </div>
        )}
        <div
          style={{
            border: '1px solid #e5e5e5',
            borderRadius: 12,
            padding: '12px',
            background: '#fff',
          }}
        >
          {/* Image previews */}
          <ImageUpload
            images={attachedImages}
            onImagesChange={setAttachedImages}
            disabled={isSubmitting || isConverting}
            showButtonOnly={false}
          />
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('sidebar.placeholder')}
            disabled={isSubmitting || isConverting}
            autoSize={{ minRows: 3, maxRows: 19 }}
            variant="borderless"
            style={{ padding: 0, marginBottom: 8 }}
          />
          <Flex justify="flex-end" align="center" gap={8}>
            <ImageUpload
              images={attachedImages}
              onImagesChange={setAttachedImages}
              disabled={isSubmitting || isConverting}
              showButtonOnly={true}
            />
            <Select
              value={selectedModel}
              onChange={setSelectedModel}
              disabled={isSubmitting || isConverting}
              style={{ width: 120 }}
              size="small"
              options={[
                { value: 'databricks-claude-opus-4-5', label: 'Opus 4.5' },
                { value: 'databricks-claude-sonnet-4-5', label: 'Sonnet 4.5' },
              ]}
            />
            <Tooltip
              title={!hasPermission ? t('sidebar.permissionRequired') : ''}
            >
              <Button
                type="primary"
                shape="circle"
                icon={<SendOutlined />}
                loading={isSubmitting || isConverting}
                disabled={
                  (!input.trim() && attachedImages.length === 0) ||
                  !hasPermission
                }
                onClick={handleSubmit}
              />
            </Tooltip>
          </Flex>
        </div>

        <Flex align="center" gap={8} wrap="wrap" style={{ marginTop: 8 }}>
          <Button
            size="small"
            icon={<FolderOutlined />}
            onClick={() => setIsWorkspaceModalOpen(true)}
            disabled={isSubmitting}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: 'left',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={workspacePath || t('sidebar.selectWorkspace')}
          >
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {workspacePath || t('sidebar.selectWorkspace')}
            </span>
          </Button>
          <Tooltip title={t('sidebar.overwriteTooltip')}>
            <Checkbox
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              disabled={isSubmitting}
            >
              <Text style={{ fontSize: 12 }}>
                <EditOutlined style={{ marginRight: 4 }} />
                {t('sidebar.overwrite')}
              </Text>
            </Checkbox>
          </Tooltip>
          <Tooltip title={t('sidebar.autoSyncTooltip')}>
            <Checkbox
              checked={autoWorkspacePush}
              onChange={(e) => setAutoWorkspacePush(e.target.checked)}
              disabled={isSubmitting}
            >
              <Text style={{ fontSize: 12 }}>
                <SyncOutlined style={{ marginRight: 4 }} />
                {t('sidebar.autoSync')}
              </Text>
            </Checkbox>
          </Tooltip>
        </Flex>
      </div>

      {/* Sessions Section */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '12px 20px 8px',
            fontSize: 11,
            fontWeight: 600,
            color: '#999',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {t('sidebar.sessions')}
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <SessionList />
        </div>
      </div>

      {/* Footer */}
      <Flex
        justify="space-between"
        align="center"
        style={{ padding: '12px 20px', borderTop: '1px solid #f0f0f0' }}
      >
        <AccountMenu />
        {userInfo?.databricksAppUrl && (
          <Tooltip title="Databricks Apps">
            <Button
              type="text"
              icon={<RocketOutlined />}
              onClick={() => window.open(userInfo.databricksAppUrl!, '_blank')}
              style={{ color: '#666' }}
            />
          </Tooltip>
        )}
      </Flex>

      <WorkspaceSelectModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        onSelect={setWorkspacePath}
        initialPath={workspacePath}
      />

      <SettingsModal
        isOpen={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
        isInitialSetup={!hasPermission}
        onPermissionGranted={handlePermissionGranted}
      />
    </Flex>
  );
}
