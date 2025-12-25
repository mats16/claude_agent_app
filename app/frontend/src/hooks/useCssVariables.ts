import { useEffect } from 'react';
import { generateCssVariables } from '../styles/theme';

/**
 * Hook to inject CSS custom properties from theme.ts into the document
 * This enables CSS files to use var(--color-xxx) syntax
 */
export function useCssVariables(): void {
  useEffect(() => {
    const styleId = 'theme-css-variables';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = generateCssVariables();

    return () => {
      styleEl?.remove();
    };
  }, []);
}
