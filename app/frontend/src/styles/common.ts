/**
 * Common style patterns used across components
 * Import these to maintain consistent styling
 */

import type { CSSProperties } from 'react';
import { colors, spacing, borderRadius, shadows } from './theme';

// Card styles
export const cardStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: borderRadius.lg,
  background: colors.background,
  padding: spacing.lg,
};

// Input container style (like chat input box)
export const inputContainerStyle: CSSProperties = {
  border: `1px solid ${colors.borderDark}`,
  borderRadius: borderRadius.lg,
  background: colors.background,
  padding: spacing.md,
};

// Drop zone style generator
export const getDropZoneStyle = (isDragging: boolean): CSSProperties => ({
  border: isDragging ? `2px dashed ${colors.brand}` : `1px solid transparent`,
  background: isDragging ? colors.brandLight : 'transparent',
  transition: 'all 0.2s ease',
});

// Drop zone overlay style
export const dropZoneOverlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: colors.brandLight,
  zIndex: 10,
  pointerEvents: 'none',
};

// Ellipsis text overflow style
export const ellipsisStyle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

// Sticky input form style
export const stickyInputStyle: CSSProperties = {
  position: 'sticky',
  bottom: spacing.xxl,
  margin: `0 auto ${spacing.xxl}px`,
  maxWidth: 768,
  width: 'calc(100% - 48px)',
  background: colors.background,
  border: `1px solid ${colors.borderDark}`,
  borderRadius: borderRadius.lg,
  boxShadow: shadows.lg,
  padding: `${spacing.md}px ${spacing.lg}px`,
};

// Section header style
export const sectionHeaderStyle: CSSProperties = {
  height: 50,
  padding: `0 ${spacing.xl}px`,
  borderBottom: `1px solid ${colors.border}`,
  background: colors.background,
  display: 'flex',
  alignItems: 'center',
};

// Footer style
export const footerStyle: CSSProperties = {
  padding: `${spacing.md}px ${spacing.xl}px`,
  borderTop: `1px solid ${colors.border}`,
};

// Message bubble style for user messages
export const userMessageBubbleStyle: CSSProperties = {
  background: colors.backgroundSecondary,
  borderRadius: borderRadius.lg,
  padding: `${spacing.md}px ${spacing.lg}px`,
};

// Status indicator colors
export const getStatusColor = (
  isConnected: boolean,
  isReconnecting: boolean
): string => {
  if (isConnected) return colors.success;
  if (isReconnecting) return colors.warning;
  return colors.error;
};

// Loading spinner container style
export const loadingContainerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: spacing.xxl,
};

// Modal body padding
export const modalBodyStyle: CSSProperties = {
  padding: spacing.lg,
};
