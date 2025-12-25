/**
 * File utilities for handling file uploads
 */

import type { DocumentContent } from '@app/shared';

// Maximum file size (10MB for all file types)
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// PDF mime type
export const PDF_MIME_TYPE = 'application/pdf';

// Supported text-based file types (uploaded to cwd)
export const TEXT_FILE_TYPES = [
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/html',
  'text/xml',
  'application/json',
  'application/xml',
  'application/yaml',
  'text/javascript',
  'text/typescript',
  'text/x-python',
  'application/sql',
  'application/x-sh',
];

// All supported file types
export const SUPPORTED_FILE_TYPES = [PDF_MIME_TYPE, ...TEXT_FILE_TYPES];

/**
 * Check if file is a PDF
 */
export function isPdfFile(file: File): boolean {
  return (
    file.type === PDF_MIME_TYPE || file.name.toLowerCase().endsWith('.pdf')
  );
}

/**
 * Check if file is a text-based file
 */
export function isTextBasedFile(file: File): boolean {
  // Check by mime type
  if (TEXT_FILE_TYPES.includes(file.type)) {
    return true;
  }
  // Check by common text file extensions
  const ext = file.name.toLowerCase().split('.').pop() || '';
  const textExtensions = [
    'txt',
    'csv',
    'md',
    'json',
    'xml',
    'yaml',
    'yml',
    'html',
    'htm',
    'js',
    'ts',
    'jsx',
    'tsx',
    'py',
    'sql',
    'sh',
    'bash',
    'log',
    'css',
    'scss',
    'sass',
    'less',
    'java',
    'c',
    'cpp',
    'h',
    'hpp',
    'go',
    'rs',
    'rb',
    'php',
    'swift',
    'kt',
    'scala',
    'r',
    'lua',
  ];
  return textExtensions.includes(ext);
}

/**
 * Check if file is supported for upload
 */
export function isSupportedFileType(file: File): boolean {
  return isPdfFile(file) || isTextBasedFile(file);
}

/**
 * Check if file size is within limits
 */
export function isWithinSizeLimit(file: File): boolean {
  return file.size <= MAX_FILE_SIZE;
}

/**
 * Get maximum file size for a file type
 */
export function getMaxSizeForFile(_file: File): number {
  return MAX_FILE_SIZE;
}

/**
 * Convert PDF file to base64 DocumentContent
 */
export async function convertPdfToBase64(file: File): Promise<DocumentContent> {
  if (!isPdfFile(file)) {
    throw new Error('File is not a PDF');
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `PDF file too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
    );
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Extract base64 data (remove "data:application/pdf;base64," prefix)
      const base64Data = dataUrl.split(',')[1];

      resolve({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64Data,
        },
      });
    };

    reader.onerror = () => {
      reject(new Error('Failed to read PDF file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get file icon name based on file type
 */
export function getFileIconName(file: File): string {
  if (isPdfFile(file)) return 'FilePdfOutlined';

  const ext = file.name.toLowerCase().split('.').pop() || '';

  // Text-based files
  if (['txt', 'log'].includes(ext)) return 'FileTextOutlined';
  if (['md', 'markdown'].includes(ext)) return 'FileMarkdownOutlined';
  if (['json', 'xml', 'yaml', 'yml'].includes(ext)) return 'FileTextOutlined';
  if (['csv'].includes(ext)) return 'FileExcelOutlined';
  if (
    ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs', 'c', 'cpp'].includes(
      ext
    )
  )
    return 'FileTextOutlined';

  return 'FileOutlined';
}

/**
 * Create preview URL for file (for display purposes)
 */
export function createPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

/**
 * Revoke preview URL to free memory
 */
export function revokePreviewUrl(url: string): void {
  URL.revokeObjectURL(url);
}
