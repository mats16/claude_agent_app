import { useRef, useCallback, useState, DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, message, Flex } from 'antd';
import { PictureOutlined, CloseOutlined } from '@ant-design/icons';
import {
  isSupportedImageType,
  isWithinSizeLimit,
  createPreviewUrl,
  revokePreviewUrl,
} from '../utils/imageUtils';
import { colors, typography } from '../styles/theme';

export interface AttachedImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface ImageUploadProps {
  images: AttachedImage[];
  onImagesChange: (images: AttachedImage[]) => void;
  disabled?: boolean;
  maxImages?: number;
  showButtonOnly?: boolean; // true: show only button, false: show only previews
}

export default function ImageUpload({
  images,
  onImagesChange,
  disabled = false,
  maxImages = 5,
  showButtonOnly,
}: ImageUploadProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const validFiles: AttachedImage[] = [];

      for (const file of fileArray) {
        if (images.length + validFiles.length >= maxImages) {
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
        onImagesChange([...images, ...validFiles]);
      }
    },
    [images, onImagesChange, maxImages, t]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
        // Reset input so same file can be selected again
        e.target.value = '';
      }
    },
    [handleFiles]
  );

  const handleRemove = useCallback(
    (id: string) => {
      const image = images.find((img) => img.id === id);
      if (image) {
        revokePreviewUrl(image.previewUrl);
      }
      onImagesChange(images.filter((img) => img.id !== id));
    },
    [images, onImagesChange]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleFiles(files);
      }
    },
    [disabled, handleFiles]
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        position: 'relative',
        border: isDragging ? `2px dashed ${colors.brand}` : 'none',
        borderRadius: 8,
        padding: isDragging ? 4 : 0,
        transition: 'all 0.2s ease',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />

      <Flex align="center" gap={8}>
        {/* Show button when showButtonOnly is true or undefined (default behavior) */}
        {(showButtonOnly === true || showButtonOnly === undefined) && (
          <Button
            type="text"
            icon={<PictureOutlined />}
            onClick={handleClick}
            disabled={disabled || images.length >= maxImages}
            title={t('imageUpload.attachImage')}
          />
        )}

        {/* Show previews when showButtonOnly is false or undefined (default behavior) */}
        {(showButtonOnly === false || showButtonOnly === undefined) &&
          images.length > 0 && (
            <Flex gap={8} wrap="wrap" style={{ maxWidth: 'calc(100% - 40px)' }}>
              {images.map((image) => (
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
                    onClick={() => handleRemove(image.id)}
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
            </Flex>
          )}
      </Flex>

      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: colors.brandLight,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
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
    </div>
  );
}
