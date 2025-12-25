/**
 * Image utilities for converting and resizing images to WebP format
 */

// Maximum dimension for images (Claude API recommends 1568px max)
const MAX_DIMENSION = 1568;
// Maximum file size in bytes (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;
// Supported image types
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export interface ConvertedImage {
  data: string; // base64 encoded
  media_type: 'image/webp';
}

/**
 * Check if the file is a supported image type
 */
export function isSupportedImageType(file: File): boolean {
  return SUPPORTED_TYPES.includes(file.type);
}

/**
 * Check if the file size is within limits
 */
export function isWithinSizeLimit(file: File): boolean {
  return file.size <= MAX_FILE_SIZE;
}

/**
 * Load an image from a File object
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Calculate new dimensions while maintaining aspect ratio
 */
function calculateDimensions(
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  const aspectRatio = width / height;

  if (width > height) {
    return {
      width: maxDimension,
      height: Math.round(maxDimension / aspectRatio),
    };
  } else {
    return {
      width: Math.round(maxDimension * aspectRatio),
      height: maxDimension,
    };
  }
}

/**
 * Convert an image file to WebP format with optional resizing
 * Returns base64 encoded data without the data URL prefix
 */
export async function convertToWebP(
  file: File,
  quality: number = 0.85
): Promise<ConvertedImage> {
  if (!isSupportedImageType(file)) {
    throw new Error(
      `Unsupported image type: ${file.type}. Supported types: ${SUPPORTED_TYPES.join(', ')}`
    );
  }

  const img = await loadImage(file);
  const { width, height } = calculateDimensions(
    img.width,
    img.height,
    MAX_DIMENSION
  );

  // Create canvas and draw resized image
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Use better image smoothing for downscaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  // Convert to WebP
  const dataUrl = canvas.toDataURL('image/webp', quality);

  // Extract base64 data (remove "data:image/webp;base64," prefix)
  const base64Data = dataUrl.split(',')[1];

  return {
    data: base64Data,
    media_type: 'image/webp',
  };
}

/**
 * Create a preview URL for an image file
 */
export function createPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

/**
 * Revoke a preview URL to free memory
 */
export function revokePreviewUrl(url: string): void {
  URL.revokeObjectURL(url);
}

/**
 * Get a human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
