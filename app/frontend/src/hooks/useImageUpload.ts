/**
 * Custom hook for image upload functionality
 * Handles drag & drop, image validation, and conversion to WebP
 */

import { useState, useCallback, DragEvent } from 'react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import type { ImageContent } from '@app/shared';
import {
  convertToWebP,
  revokePreviewUrl,
  isSupportedImageType,
  isWithinSizeLimit,
  createPreviewUrl,
} from '../utils/imageUtils';

// Re-export AttachedImage type for convenience
import type { AttachedImage } from '../components/ImageUpload';
export type { AttachedImage };

interface UseImageUploadOptions {
  maxImages?: number;
  /** Callback to check if upload should be disabled */
  isDisabled?: () => boolean;
}

interface UseImageUploadReturn {
  attachedImages: AttachedImage[];
  setAttachedImages: React.Dispatch<React.SetStateAction<AttachedImage[]>>;
  isConverting: boolean;
  isDragging: boolean;
  /** Drag over handler for drop zone */
  handleDragOver: (e: DragEvent<HTMLDivElement>) => void;
  /** Drag leave handler for drop zone */
  handleDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  /** Drop handler for drop zone */
  handleDrop: (e: DragEvent<HTMLDivElement>) => void;
  /** Convert attached images to ImageContent[] for API submission */
  convertImages: () => Promise<ImageContent[]>;
  /** Clear all images and revoke preview URLs */
  clearImages: () => void;
  /** Remove a single image by ID */
  removeImage: (id: string) => void;
}

/**
 * Hook for managing image uploads with drag & drop support
 *
 * @example
 * ```tsx
 * const {
 *   attachedImages,
 *   setAttachedImages,
 *   isConverting,
 *   isDragging,
 *   handleDragOver,
 *   handleDragLeave,
 *   handleDrop,
 *   convertImages,
 *   clearImages,
 * } = useImageUpload({ maxImages: 5 });
 *
 * const handleSubmit = async () => {
 *   const images = await convertImages();
 *   sendMessage(text, images);
 *   clearImages();
 * };
 * ```
 */
export function useImageUpload(
  options: UseImageUploadOptions = {}
): UseImageUploadReturn {
  const { maxImages = 5, isDisabled } = options;
  const { t } = useTranslation();

  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

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

      // Check if disabled
      if (isDisabled?.()) return;

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
    [attachedImages, isDisabled, t, maxImages]
  );

  const convertImages = useCallback(async (): Promise<ImageContent[]> => {
    if (attachedImages.length === 0) return [];

    setIsConverting(true);
    try {
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
      return imageContents;
    } finally {
      setIsConverting(false);
    }
  }, [attachedImages]);

  const clearImages = useCallback(() => {
    // Revoke preview URLs to free memory
    attachedImages.forEach((img) => revokePreviewUrl(img.previewUrl));
    setAttachedImages([]);
  }, [attachedImages]);

  const removeImage = useCallback((id: string) => {
    setAttachedImages((prev) => {
      const imageToRemove = prev.find((img) => img.id === id);
      if (imageToRemove) {
        revokePreviewUrl(imageToRemove.previewUrl);
      }
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  return {
    attachedImages,
    setAttachedImages,
    isConverting,
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    convertImages,
    clearImages,
    removeImage,
  };
}
