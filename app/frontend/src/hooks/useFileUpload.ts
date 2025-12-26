/**
 * Custom hook for file upload functionality
 * Handles PDF (base64) and text files (upload to server)
 */

import { useState, useCallback, DragEvent } from 'react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import type { DocumentContent, FileUploadResponse } from '@app/shared';
import {
  isPdfFile,
  isTextBasedFile,
  isSupportedFileType,
  isWithinSizeLimit,
  getMaxSizeForFile,
  convertPdfToBase64,
  formatFileSize,
  revokePreviewUrl,
  createPreviewUrl,
} from '../utils/fileUtils';
import {
  isSupportedImageType,
  isWithinSizeLimit as isImageWithinSizeLimit,
  createPreviewUrl as createImagePreviewUrl,
} from '../utils/imageUtils';
import type { AttachedImage } from '../components/ImageUpload';

export interface AttachedFile {
  id: string;
  file: File;
  type: 'pdf' | 'text';
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  previewUrl?: string;
  /** File name after upload (for text files) */
  uploadedFileName?: string;
  /** Error message if upload failed */
  errorMessage?: string;
}

interface UseFileUploadOptions {
  maxFiles?: number;
  /** Callback to check if upload should be disabled */
  isDisabled?: () => boolean;
  /** Callback when text files are added (receives sanitized file names) */
  onTextFilesAdded?: (fileNames: string[]) => void;
  /** Current attached images (for unified drag & drop) */
  currentImages?: AttachedImage[];
  /** Max images allowed (for unified drag & drop) */
  maxImages?: number;
  /** Callback to add images (for unified drag & drop) */
  onImagesChange?: (images: AttachedImage[]) => void;
}

interface UseFileUploadReturn {
  attachedFiles: AttachedFile[];
  setAttachedFiles: React.Dispatch<React.SetStateAction<AttachedFile[]>>;
  isUploading: boolean;
  isDragging: boolean;
  /** Add files from file input or drag & drop */
  addFiles: (files: FileList | File[]) => void;
  /** Remove a file by ID */
  removeFile: (id: string) => void;
  /** Drag over handler for drop zone */
  handleDragOver: (e: DragEvent<HTMLDivElement>) => void;
  /** Drag leave handler for drop zone */
  handleDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  /** Drop handler for drop zone */
  handleDrop: (e: DragEvent<HTMLDivElement>) => void;
  /** Upload text files to server, returns uploaded file names */
  uploadTextFiles: (sessionId: string) => Promise<string[]>;
  /** Convert PDF files to DocumentContent[] */
  convertPdfs: () => Promise<DocumentContent[]>;
  /** Clear all files and revoke preview URLs */
  clearFiles: () => void;
  /** Check if there are any pending PDF files */
  hasPendingPdfs: boolean;
  /** Check if there are any pending text files */
  hasPendingTextFiles: boolean;
}

/**
 * Sanitize filename to match backend behavior
 * This ensures the @filename reference matches the actual uploaded file
 */
function sanitizeFileName(fileName: string): string {
  // Extract just the filename (no path)
  const baseName = fileName.split('/').pop() || fileName;
  // Replace non-alphanumeric characters except . _ -
  return baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Hook for managing file uploads with support for PDF (base64) and text files (server upload)
 */
export function useFileUpload(
  options: UseFileUploadOptions = {}
): UseFileUploadReturn {
  const {
    maxFiles = 10,
    isDisabled,
    onTextFilesAdded,
    currentImages = [],
    maxImages = 5,
    onImagesChange,
  } = options;
  const { t } = useTranslation();

  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      if (isDisabled?.()) return;

      const fileArray = Array.from(files);
      const validFiles: AttachedFile[] = [];

      for (const file of fileArray) {
        if (attachedFiles.length + validFiles.length >= maxFiles) {
          message.warning(t('fileUpload.maxFilesReached', { max: maxFiles }));
          break;
        }

        if (!isSupportedFileType(file)) {
          message.error(t('fileUpload.unsupportedType', { name: file.name }));
          continue;
        }

        if (!isWithinSizeLimit(file)) {
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

        validFiles.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          file,
          type: fileType,
          status: 'pending',
          previewUrl: createPreviewUrl(file),
        });
      }

      if (validFiles.length > 0) {
        setAttachedFiles((prev) => [...prev, ...validFiles]);

        // Notify about added text files with sanitized names
        const textFileNames = validFiles
          .filter((f) => f.type === 'text')
          .map((f) => sanitizeFileName(f.file.name));

        if (textFileNames.length > 0 && onTextFilesAdded) {
          onTextFilesAdded(textFileNames);
        }
      }
    },
    [attachedFiles, isDisabled, maxFiles, onTextFilesAdded, t]
  );

  const removeFile = useCallback((id: string) => {
    setAttachedFiles((prev) => {
      const fileToRemove = prev.find((f) => f.id === id);
      if (fileToRemove?.previewUrl) {
        revokePreviewUrl(fileToRemove.previewUrl);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
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
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (isDisabled?.()) return;

      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);
      const imageFiles: File[] = [];
      const otherFiles: File[] = [];

      // Separate images from other files
      for (const file of fileArray) {
        if (isSupportedImageType(file)) {
          imageFiles.push(file);
        } else {
          otherFiles.push(file);
        }
      }

      // Handle image files
      if (imageFiles.length > 0 && onImagesChange) {
        const validImages: AttachedImage[] = [];

        for (const file of imageFiles) {
          if (currentImages.length + validImages.length >= maxImages) {
            message.warning(
              t('imageUpload.maxImagesReached', { max: maxImages })
            );
            break;
          }

          if (!isImageWithinSizeLimit(file)) {
            message.error(t('imageUpload.fileTooLarge', { name: file.name }));
            continue;
          }

          validImages.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            file,
            previewUrl: createImagePreviewUrl(file),
          });
        }

        if (validImages.length > 0) {
          onImagesChange([...currentImages, ...validImages]);
        }
      }

      // Handle other files (PDF, text, etc.)
      if (otherFiles.length > 0) {
        addFiles(otherFiles);
      }
    },
    [addFiles, isDisabled, currentImages, maxImages, onImagesChange, t]
  );

  const uploadTextFiles = useCallback(
    async (sessionId: string): Promise<string[]> => {
      const textFiles = attachedFiles.filter(
        (f) => f.type === 'text' && f.status === 'pending'
      );

      if (textFiles.length === 0) return [];

      setIsUploading(true);
      const uploadedNames: string[] = [];

      try {
        for (const attachedFile of textFiles) {
          // Update status to uploading
          setAttachedFiles((prev) =>
            prev.map((f) =>
              f.id === attachedFile.id
                ? { ...f, status: 'uploading' as const }
                : f
            )
          );

          try {
            // Read file as ArrayBuffer for raw body upload
            const arrayBuffer = await attachedFile.file.arrayBuffer();
            const encodedPath = encodeURIComponent(attachedFile.file.name);

            const response = await fetch(
              `/api/v1/sessions/${sessionId}/files?path=${encodedPath}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type':
                    attachedFile.file.type || 'application/octet-stream',
                },
                body: arrayBuffer,
              }
            );

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || 'Upload failed');
            }

            const result: FileUploadResponse = await response.json();

            // Extract filename from path
            const uploadedFileName = result.path.split('/').pop() || result.path;

            // Update status to uploaded
            setAttachedFiles((prev) =>
              prev.map((f) =>
                f.id === attachedFile.id
                  ? {
                      ...f,
                      status: 'uploaded' as const,
                      uploadedFileName,
                    }
                  : f
              )
            );

            uploadedNames.push(uploadedFileName);
          } catch (error: any) {
            // Update status to error
            setAttachedFiles((prev) =>
              prev.map((f) =>
                f.id === attachedFile.id
                  ? {
                      ...f,
                      status: 'error' as const,
                      errorMessage: error.message,
                    }
                  : f
              )
            );
            message.error(
              t('fileUpload.uploadFailed', { name: attachedFile.file.name })
            );
          }
        }

        return uploadedNames;
      } finally {
        setIsUploading(false);
      }
    },
    [attachedFiles, t]
  );

  const convertPdfs = useCallback(async (): Promise<DocumentContent[]> => {
    const pdfFiles = attachedFiles.filter(
      (f) => f.type === 'pdf' && f.status === 'pending'
    );

    if (pdfFiles.length === 0) return [];

    const documents: DocumentContent[] = [];

    for (const attachedFile of pdfFiles) {
      try {
        const doc = await convertPdfToBase64(attachedFile.file);
        documents.push(doc);

        // Update status to uploaded (for PDFs, this means converted)
        setAttachedFiles((prev) =>
          prev.map((f) =>
            f.id === attachedFile.id ? { ...f, status: 'uploaded' as const } : f
          )
        );
      } catch (error: any) {
        setAttachedFiles((prev) =>
          prev.map((f) =>
            f.id === attachedFile.id
              ? { ...f, status: 'error' as const, errorMessage: error.message }
              : f
          )
        );
        message.error(
          t('fileUpload.pdfConversionFailed', { name: attachedFile.file.name })
        );
      }
    }

    return documents;
  }, [attachedFiles, t]);

  const clearFiles = useCallback(() => {
    attachedFiles.forEach((f) => {
      if (f.previewUrl) {
        revokePreviewUrl(f.previewUrl);
      }
    });
    setAttachedFiles([]);
  }, [attachedFiles]);

  const hasPendingPdfs = attachedFiles.some(
    (f) => f.type === 'pdf' && f.status === 'pending'
  );

  const hasPendingTextFiles = attachedFiles.some(
    (f) => f.type === 'text' && f.status === 'pending'
  );

  return {
    attachedFiles,
    setAttachedFiles,
    isUploading,
    isDragging,
    addFiles,
    removeFile,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    uploadTextFiles,
    convertPdfs,
    clearFiles,
    hasPendingPdfs,
    hasPendingTextFiles,
  };
}
