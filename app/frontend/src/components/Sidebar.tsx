import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Select, Tooltip, Typography, Flex, message } from 'antd';
import {
  SendOutlined,
  RocketOutlined,
  PaperClipOutlined,
  CloseOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import SessionList from './SessionList';
import AccountMenu from './AccountMenu';
import WorkspaceSelectModal from './WorkspaceSelectModal';
import WorkspacePathSelector from './WorkspacePathSelector';
import SettingsModal from './SettingsModal';
import MarkdownEditor from './MarkdownEditor';
import type { AttachedImage } from './ImageUpload';
import { useUser } from '../contexts/UserContext';
import type { MessageContent, DocumentContent } from '@app/shared';
import { colors, spacing, typography } from '../styles/theme';
import {
  inputContainerStyle,
  getDropZoneStyle,
  dropZoneOverlayStyle,
  footerStyle,
} from '../styles/common';
import {
  isSupportedImageType,
  isWithinSizeLimit as isImageWithinSizeLimit,
  createPreviewUrl as createImagePreviewUrl,
  revokePreviewUrl,
  convertToWebP,
} from '../utils/imageUtils';
import {
  isPdfFile,
  isWithinSizeLimit as isPdfWithinSizeLimit,
  getMaxSizeForFile,
  formatFileSize,
  convertPdfToBase64,
} from '../utils/fileUtils';

interface AttachedPdf {
  id: string;
  file: File;
  previewUrl?: string;
}

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
  const [autoWorkspacePush, setAutoWorkspacePush] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxImages = 5;
  const maxPdfs = 5;

  // Attachment state
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [attachedPdfs, setAttachedPdfs] = useState<AttachedPdf[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const hasPermission = userInfo?.hasWorkspacePermission ?? null;

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

  // Unified file handler - handles images and PDFs only
  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);

      for (const file of fileArray) {
        // Check if it's an image
        if (isSupportedImageType(file)) {
          if (attachedImages.length >= maxImages) {
            message.warning(
              t('imageUpload.maxImagesReached', { max: maxImages })
            );
            continue;
          }

          if (!isImageWithinSizeLimit(file)) {
            message.error(t('imageUpload.fileTooLarge', { name: file.name }));
            continue;
          }

          const newImage: AttachedImage = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            file,
            previewUrl: createImagePreviewUrl(file),
          };
          setAttachedImages((prev) => [...prev, newImage]);
        }
        // Check if it's a PDF
        else if (isPdfFile(file)) {
          if (attachedPdfs.length >= maxPdfs) {
            message.warning(t('fileUpload.maxFilesReached', { max: maxPdfs }));
            continue;
          }

          if (!isPdfWithinSizeLimit(file)) {
            const maxSize = formatFileSize(getMaxSizeForFile(file));
            message.error(
              t('fileUpload.pdfTooLarge', { name: file.name, max: maxSize })
            );
            continue;
          }

          const newPdf: AttachedPdf = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            file,
          };
          setAttachedPdfs((prev) => [...prev, newPdf]);
        } else {
          // Text files not supported in sidebar (no session to upload to)
          message.warning(t('fileUpload.unsupportedType', { name: file.name }));
        }
      }
    },
    [attachedImages.length, attachedPdfs.length, t]
  );

  // Drag handlers
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (isSubmitting || isConverting) return;

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleFiles(files);
      }
    },
    [handleFiles, isSubmitting, isConverting]
  );

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
        e.target.value = '';
      }
    },
    [handleFiles]
  );

  const handleRemoveImage = useCallback((id: string) => {
    setAttachedImages((prev) => {
      const image = prev.find((img) => img.id === id);
      if (image) {
        revokePreviewUrl(image.previewUrl);
      }
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  const handleRemovePdf = useCallback((id: string) => {
    setAttachedPdfs((prev) => prev.filter((pdf) => pdf.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    attachedImages.forEach((img) => revokePreviewUrl(img.previewUrl));
    setAttachedImages([]);
    setAttachedPdfs([]);
  }, [attachedImages]);

  const handleSubmit = async () => {
    const hasContent =
      input.trim() || attachedImages.length > 0 || attachedPdfs.length > 0;
    if (!hasContent || isSubmitting || isConverting) return;

    setIsSubmitting(true);
    setIsConverting(true);

    try {
      // Convert attached images to WebP format
      const imageContents: MessageContent[] = [];
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

      // Convert PDFs to base64
      const pdfContents: DocumentContent[] = [];
      for (const pdf of attachedPdfs) {
        const converted = await convertPdfToBase64(pdf.file);
        pdfContents.push(converted);
      }

      // Build message content array
      const messageContent: MessageContent[] = [];
      if (input.trim()) {
        messageContent.push({ type: 'text', text: input.trim() });
      }
      messageContent.push(...imageContents);
      messageContent.push(...pdfContents);

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
      clearAttachments();
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

  const handlePermissionGranted = () => {
    setShowPermissionModal(false);
  };

  // Handle workspace path change: enable auto sync when path is set, disable when cleared
  const handleWorkspacePathChange = (path: string) => {
    setWorkspacePath(path);
    setAutoWorkspacePush(path.trim().length > 0);
  };

  const isProcessing = isSubmitting || isConverting;
  const hasAttachments = attachedImages.length > 0 || attachedPdfs.length > 0;
  const isSubmitDisabled =
    (!input.trim() && !hasAttachments) || !hasPermission || isProcessing;

  // Accept types for file input (images and PDFs only for sidebar)
  const acceptTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
  ].join(',');

  return (
    <Flex
      vertical
      style={{
        height: '100%',
        background: colors.sidebarBg,
      }}
    >
      {/* Hidden unified file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptTypes}
        multiple
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />

      {/* Header */}
      <div style={{ padding: `${spacing.lg}px ${spacing.xl}px` }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Typography.Title
            level={5}
            style={{
              margin: 0,
              color: colors.textPrimary,
              fontWeight: typography.fontWeightBold,
            }}
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
          padding: `${spacing.lg}px ${spacing.xl}px`,
          borderBottom: `1px solid ${colors.border}`,
          position: 'relative',
          background: isDragging ? colors.brandLight : 'transparent',
          ...getDropZoneStyle(isDragging),
        }}
      >
        {isDragging && (
          <div style={dropZoneOverlayStyle}>
            <span
              style={{
                color: colors.brand,
                fontWeight: typography.fontWeightMedium,
              }}
            >
              {t('imageUpload.dropHere')}
            </span>
          </div>
        )}
        <div style={inputContainerStyle}>
          {/* Attachment previews */}
          {hasAttachments && (
            <Flex gap={8} wrap="wrap" style={{ marginBottom: spacing.sm }}>
              {/* Image previews */}
              {attachedImages.map((image) => (
                <div
                  key={image.id}
                  style={{
                    position: 'relative',
                    width: 48,
                    height: 48,
                    borderRadius: 6,
                    overflow: 'hidden',
                    border: '1px solid #e5e5e5',
                  }}
                >
                  <img
                    src={image.previewUrl}
                    alt="preview"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined style={{ fontSize: 10 }} />}
                    onClick={() => handleRemoveImage(image.id)}
                    disabled={isProcessing}
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      padding: 2,
                      minWidth: 16,
                      height: 16,
                      background: 'rgba(0, 0, 0, 0.5)',
                      color: '#fff',
                      borderRadius: '0 0 0 4px',
                    }}
                  />
                </div>
              ))}

              {/* PDF previews */}
              {attachedPdfs.map((pdf) => (
                <div
                  key={pdf.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1px solid #e5e5e5',
                    background: '#fafafa',
                    maxWidth: 160,
                  }}
                >
                  <FilePdfOutlined style={{ fontSize: 20, color: '#ff4d4f' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={pdf.file.name}
                    >
                      {pdf.file.name}
                    </div>
                    <div style={{ fontSize: 10, color: '#999' }}>
                      {formatFileSize(pdf.file.size)}
                    </div>
                  </div>
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined style={{ fontSize: 10 }} />}
                    onClick={() => handleRemovePdf(pdf.id)}
                    disabled={isProcessing}
                    style={{
                      padding: 2,
                      minWidth: 16,
                      height: 16,
                    }}
                  />
                </div>
              ))}
            </Flex>
          )}

          <div className="sidebar-editor">
            <MarkdownEditor
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              placeholder={t('sidebar.placeholder')}
              disabled={isProcessing}
            />
          </div>
          <Flex justify="flex-end" align="center" gap={spacing.sm}>
            {/* Unified attachment button */}
            <Button
              type="text"
              icon={<PaperClipOutlined />}
              onClick={handleAttachClick}
              disabled={
                isProcessing ||
                (attachedImages.length >= maxImages &&
                  attachedPdfs.length >= maxPdfs)
              }
              title={t('fileUpload.attachFile')}
            />
            <Select
              value={selectedModel}
              onChange={setSelectedModel}
              disabled={isProcessing}
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
                loading={isProcessing}
                disabled={isSubmitDisabled}
                onClick={handleSubmit}
              />
            </Tooltip>
          </Flex>
        </div>

        <div style={{ marginTop: spacing.sm }}>
          <WorkspacePathSelector
            workspacePath={workspacePath}
            onPathChange={handleWorkspacePathChange}
            autoWorkspacePush={autoWorkspacePush}
            onAutoWorkspacePushChange={setAutoWorkspacePush}
            onOpenModal={() => setIsWorkspaceModalOpen(true)}
            disabled={isSubmitting}
          />
        </div>
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
        <SessionList />
      </div>

      {/* Footer */}
      <Flex justify="space-between" align="center" style={footerStyle}>
        <AccountMenu />
        {userInfo?.databricksAppUrl && (
          <Tooltip title="Databricks Apps">
            <Button
              type="text"
              icon={<RocketOutlined />}
              onClick={() => window.open(userInfo.databricksAppUrl!, '_blank')}
              style={{ color: colors.textSecondary }}
            />
          </Tooltip>
        )}
      </Flex>

      <WorkspaceSelectModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        onSelect={handleWorkspacePathChange}
        initialPath={workspacePath || userInfo?.workspaceHome}
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
