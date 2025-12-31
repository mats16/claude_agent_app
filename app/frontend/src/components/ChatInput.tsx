/**
 * Chat input component with unified image and file upload support
 * Single attachment button handles both images and files
 */

import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Flex, message, Select } from 'antd';
import {
  SendOutlined,
  PaperClipOutlined,
  CloseOutlined,
  FileTextOutlined,
  FilePdfOutlined,
  StopOutlined,
  CaretDownOutlined,
} from '@ant-design/icons';
import type { AttachedImage } from './ImageUpload';
import type { AttachedFile } from '../hooks/useFileUpload';
import { stickyInputStyle } from '../styles/common';
import { colors, spacing } from '../styles/theme';
import {
  isSupportedImageType,
  isWithinSizeLimit as isImageWithinSizeLimit,
  createPreviewUrl as createImagePreviewUrl,
  revokePreviewUrl,
} from '../utils/imageUtils';
import {
  isSupportedFileType,
  isWithinSizeLimit as isFileWithinSizeLimit,
  formatFileSize,
  getMaxSizeForFile,
  isPdfFile,
  createPreviewUrl as createFilePreviewUrl,
  revokePreviewUrl as revokeFilePreviewUrl,
} from '../utils/fileUtils';

const { TextArea } = Input;

interface ChatInputProps {
  /** Current input value */
  input: string;
  /** Callback when input changes */
  onInputChange: (value: string) => void;
  /** Attached images */
  attachedImages: AttachedImage[];
  /** Callback when images change */
  onImagesChange: (images: AttachedImage[]) => void;
  /** Attached files */
  attachedFiles?: AttachedFile[];
  /** Callback when files change */
  onFilesChange?: (files: AttachedFile[]) => void;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether image conversion is in progress */
  isConverting?: boolean;
  /** Whether file upload is in progress */
  isUploading?: boolean;
  /** Callback when submit is triggered */
  onSubmit: () => void;
  /** Callback when stop is triggered */
  onStop?: () => void;
  /** Whether the agent is currently processing */
  isAgentProcessing?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Max images allowed */
  maxImages?: number;
  /** Max files allowed */
  maxFiles?: number;
  /** Currently selected model */
  selectedModel?: string;
  /** Callback when model changes */
  onModelChange?: (model: string) => void;
}

export default function ChatInput({
  input,
  onInputChange,
  attachedImages,
  onImagesChange,
  attachedFiles = [],
  onFilesChange,
  disabled = false,
  isConverting = false,
  isUploading = false,
  onSubmit,
  onStop,
  isAgentProcessing = false,
  placeholder,
  maxImages = 5,
  maxFiles = 10,
  selectedModel,
  onModelChange,
}: ChatInputProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit]
  );

  // Unified file handler - routes to image or file based on type
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
          onImagesChange([...attachedImages, newImage]);
        }
        // Check if it's a supported file type (PDF, text, etc.)
        else if (isSupportedFileType(file)) {
          if (!onFilesChange) continue;

          if (attachedFiles.length >= maxFiles) {
            message.warning(t('fileUpload.maxFilesReached', { max: maxFiles }));
            continue;
          }

          if (!isFileWithinSizeLimit(file)) {
            const maxSize = formatFileSize(getMaxSizeForFile(file));
            if (isPdfFile(file)) {
              message.error(
                t('fileUpload.pdfTooLarge', { name: file.name, max: maxSize })
              );
            } else {
              message.error(
                t('fileUpload.fileTooLarge', { name: file.name, max: maxSize })
              );
            }
            continue;
          }

          const fileType = isPdfFile(file) ? 'pdf' : 'text';
          const newFile: AttachedFile = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            file,
            type: fileType,
            status: 'pending',
            previewUrl: createFilePreviewUrl(file),
          };
          onFilesChange([...attachedFiles, newFile]);
        } else {
          message.error(t('fileUpload.unsupportedType', { name: file.name }));
        }
      }
    },
    [
      attachedImages,
      attachedFiles,
      maxImages,
      maxFiles,
      onImagesChange,
      onFilesChange,
      t,
    ]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        handleFiles(imageFiles);
      }
    },
    [handleFiles]
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

  const handleRemoveImage = useCallback(
    (id: string) => {
      const image = attachedImages.find((img) => img.id === id);
      if (image) {
        revokePreviewUrl(image.previewUrl);
      }
      onImagesChange(attachedImages.filter((img) => img.id !== id));
    },
    [attachedImages, onImagesChange]
  );

  const handleRemoveFile = useCallback(
    (id: string) => {
      if (!onFilesChange) return;
      const file = attachedFiles.find((f) => f.id === id);
      if (file?.previewUrl) {
        revokeFilePreviewUrl(file.previewUrl);
      }
      onFilesChange(attachedFiles.filter((f) => f.id !== id));
    },
    [attachedFiles, onFilesChange]
  );

  const getFileIcon = (file: AttachedFile) => {
    if (isPdfFile(file.file)) {
      return <FilePdfOutlined style={{ fontSize: 20, color: colors.danger }} />;
    }
    return <FileTextOutlined style={{ fontSize: 20, color: colors.info }} />;
  };

  const isProcessing = isConverting || isUploading;
  const hasAttachments = attachedImages.length > 0 || attachedFiles.length > 0;
  const isSubmitDisabled =
    disabled || isProcessing || (!input.trim() && !hasAttachments);

  // Show stop button when: agent is processing AND input is empty AND no attachments
  const showStopButton = isAgentProcessing && !input.trim() && !hasAttachments;

  // Accept types for unified file input
  const acceptTypes = [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    // Documents
    'application/pdf',
    'text/plain',
    'text/csv',
    'text/markdown',
    'application/json',
    '.txt',
    '.csv',
    '.md',
    '.json',
    '.xml',
    '.yaml',
    '.yml',
    '.js',
    '.ts',
    '.py',
    '.sql',
    '.sh',
    '.log',
  ].join(',');

  return (
    <div style={stickyInputStyle}>
      {/* Hidden unified file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptTypes}
        multiple
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />

      <Flex vertical gap={spacing.sm}>
        {/* Unified attachment previews */}
        {hasAttachments && (
          <Flex gap={8} wrap="wrap" style={{ width: '100%' }}>
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
                  border: `1px solid ${colors.borderDark}`,
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
                    background: colors.overlayDark,
                    color: colors.background,
                    borderRadius: '0 0 0 4px',
                  }}
                />
              </div>
            ))}

            {/* File previews */}
            {attachedFiles.map((file) => (
              <div
                key={file.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: `1px solid ${colors.borderDark}`,
                  background:
                    file.status === 'error'
                      ? colors.errorBg
                      : colors.backgroundTertiary,
                  maxWidth: 200,
                }}
              >
                {getFileIcon(file)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={file.file.name}
                  >
                    {file.file.name}
                  </div>
                  <div style={{ fontSize: 10, color: colors.textMuted }}>
                    {formatFileSize(file.file.size)}
                    {file.type === 'pdf' && ' (PDF)'}
                  </div>
                </div>
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined style={{ fontSize: 10 }} />}
                  onClick={() => handleRemoveFile(file.id)}
                  disabled={file.status === 'uploading'}
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

        {/* Input row - TextArea */}
        <TextArea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder || t('sessionPage.typeMessage')}
          disabled={disabled || isProcessing}
          variant="borderless"
          autoSize={{ minRows: 1, maxRows: 9 }}
          style={{ padding: 0 }}
        />

        {/* Action row - Attachment button left, Model selector center, Send button right */}
        <Flex justify="space-between" align="center">
          {/* Unified attachment button */}
          <Button
            type="text"
            icon={<PaperClipOutlined />}
            onClick={handleAttachClick}
            disabled={
              disabled ||
              isProcessing ||
              (attachedImages.length >= maxImages &&
                attachedFiles.length >= maxFiles)
            }
            title={t('fileUpload.attachFile')}
          />
          <div style={{ flex: 1 }} />
          {/* Model selector */}
          {selectedModel && onModelChange && (
            <Select
              value={selectedModel}
              onChange={onModelChange}
              style={{
                width: 'auto',
                minWidth: 100,
                background: 'transparent',
              }}
              size="small"
              variant="borderless"
              popupMatchSelectWidth={240}
              placement="topLeft"
              suffixIcon={<CaretDownOutlined />}
              optionRender={(option) => (
                <div>
                  <div style={{ fontWeight: 500 }}>{option.label}</div>
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>
                    {option.data.description}
                  </div>
                </div>
              )}
              options={[
                {
                  value: 'opus',
                  label: t('models.opus'),
                  description: t('models.opusDescription'),
                },
                {
                  value: 'sonnet',
                  label: t('models.sonnet'),
                  description: t('models.sonnetDescription'),
                },
                {
                  value: 'haiku',
                  label: t('models.haiku'),
                  description: t('models.haikuDescription'),
                },
              ]}
            />
          )}
          {showStopButton ? (
            <Button
              type="default"
              icon={<StopOutlined />}
              onClick={onStop}
              style={{ borderRadius: 8 }}
            />
          ) : (
            <Button
              type="primary"
              icon={<SendOutlined />}
              disabled={isSubmitDisabled}
              loading={isProcessing}
              onClick={onSubmit}
              style={{ borderRadius: 8 }}
            />
          )}
        </Flex>
      </Flex>
    </div>
  );
}
