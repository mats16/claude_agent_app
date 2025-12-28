/**
 * Theme constants for consistent styling across the application
 * Based on brand guidelines and existing patterns
 *
 * This is the single source of truth for all colors in the application.
 * - CSS variables are generated from this file for use in CSS
 * - Ant Design theme configuration is exported for ConfigProvider
 * - Components should import colors from this file
 */

// Brand colors
export const colors = {
  // Primary brand color (Orange/Gold)
  brand: '#f5a623',
  brandLight: 'rgba(245, 166, 35, 0.1)',
  brandDark: '#d4890c',
  brandBg: '#fff8e6',
  brandBgAlt: '#fffbf0',

  // Backgrounds
  background: '#FFFFFF',
  backgroundSecondary: '#F7F7F7',
  backgroundTertiary: '#fafafa',
  backgroundHover: '#f5f5f5',
  sidebarBg: '#F7F7F7',
  errorBg: '#fff2f0',

  // Borders
  border: '#f0f0f0',
  borderDark: '#e5e5e5',
  borderAntd: '#d9d9d9',

  // Text colors
  textPrimary: '#1a1a1a',
  textSecondary: '#666666',
  textMuted: '#999999',
  textDisabled: '#cccccc',
  textCode: '#d63384',
  textHeading: '#262626',
  textBody: '#333333',

  // Status colors (Ant Design compatible)
  success: '#52c41a',
  warning: '#ff9800',
  error: '#f44336',
  info: '#1890ff',
  danger: '#ff4d4f',

  // Info banner colors (Ant Design info palette)
  infoBg: '#e6f4ff',
  infoBorder: '#91caff',
  infoPrimary: '#1677ff',

  // UI specific
  link: '#0066cc',
  linkAntd: '#1677ff',

  // Overlays
  overlayDark: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.05)',

  // Code blocks
  codeBlockBg: '#1e1e1e',
  codeBlockText: '#d4d4d4',
  inlineCodeBg: '#f5f5f5',

  // Scrollbar
  scrollbarTrack: '#f5f5f5',
  scrollbarThumb: '#dddddd',
  scrollbarThumbHover: '#cccccc',

  // Session specific
  sessionActiveBg: '#E8EEF2',
} as const;

// Spacing scale (in pixels)
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// Border radius scale
export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

// Shadows
export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px rgba(0, 0, 0, 0.07)',
  lg: '0 4px 12px rgba(0, 0, 0, 0.08)',
  xl: '0 10px 15px rgba(0, 0, 0, 0.1)',
} as const;

// Typography
export const typography = {
  fontFamily:
    "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif",
  fontFamilyMono: "'Monaco', 'Menlo', 'Courier New', monospace",
  fontSizeSmall: 12,
  fontSizeBase: 14,
  fontSizeLarge: 16,
  fontWeightNormal: 400,
  fontWeightMedium: 500,
  fontWeightBold: 700,
} as const;

// Z-index layers
export const zIndex = {
  dropdown: 100,
  sticky: 200,
  modal: 1000,
  overlay: 1100,
  tooltip: 1200,
} as const;

// Layout constants
export const layout = {
  maxContentWidth: 768,
  sidebarWidth: 280,
  headerHeight: 56,
} as const;

// Helper function to convert camelCase to kebab-case
function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Generate CSS custom properties from theme constants
 * @returns CSS string with :root variables
 */
export function generateCssVariables(): string {
  const cssVars: string[] = [];

  // Generate color variables
  for (const [key, value] of Object.entries(colors)) {
    const cssVarName = `--color-${camelToKebab(key)}`;
    cssVars.push(`${cssVarName}: ${value};`);
  }

  // Generate spacing variables
  for (const [key, value] of Object.entries(spacing)) {
    cssVars.push(`--spacing-${key}: ${value}px;`);
  }

  // Generate border radius variables
  for (const [key, value] of Object.entries(borderRadius)) {
    const pxValue = key === 'full' ? `${value}px` : `${value}px`;
    cssVars.push(`--radius-${key}: ${pxValue};`);
  }

  // Generate shadow variables
  for (const [key, value] of Object.entries(shadows)) {
    cssVars.push(`--shadow-${key}: ${value};`);
  }

  // Generate typography variables
  cssVars.push(`--font-family: ${typography.fontFamily};`);
  cssVars.push(`--font-family-mono: ${typography.fontFamilyMono};`);

  return `:root {\n  ${cssVars.join('\n  ')}\n}`;
}

/**
 * Ant Design theme configuration
 * Use this in ConfigProvider theme prop
 */
export const antdTheme = {
  token: {
    colorPrimary: colors.brand,
    colorSuccess: colors.success,
    colorError: colors.error,
    colorWarning: colors.warning,
    colorInfo: colors.info,
    borderRadius: borderRadius.md,
    fontFamily: typography.fontFamily,
  },
  components: {
    Button: {
      primaryShadow: 'none',
    },
    Input: {
      activeBorderColor: colors.brand,
      hoverBorderColor: colors.brand,
    },
    Modal: {
      borderRadiusLG: borderRadius.lg,
    },
  },
};

// Type exports for TypeScript
export type Colors = typeof colors;
export type Spacing = typeof spacing;
export type BorderRadius = typeof borderRadius;
