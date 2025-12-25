/**
 * Custom hook for modal state management
 * Handles loading states, error/success messages for modal forms
 */

import { useState, useCallback } from 'react';

export interface ModalMessage {
  type: 'success' | 'error';
  text: string;
}

interface UseModalStateReturn {
  /** Whether a save operation is in progress */
  isSaving: boolean;
  /** Current message (success/error) to display */
  message: ModalMessage | null;
  /** Clear the current message */
  clearMessage: () => void;
  /** Set a success message */
  setSuccess: (text: string) => void;
  /** Set an error message */
  setError: (text: string) => void;
  /** Wrap an async function with loading state management */
  withSaving: <T>(fn: () => Promise<T>) => Promise<T | null>;
}

/**
 * Hook for managing modal form states
 *
 * @example
 * ```tsx
 * const { isSaving, message, clearMessage, withSaving, setSuccess, setError } = useModalState();
 *
 * const handleSave = async () => {
 *   const result = await withSaving(async () => {
 *     const response = await fetch('/api/save', { method: 'POST' });
 *     if (!response.ok) throw new Error('Failed');
 *     return response.json();
 *   });
 *
 *   if (result) {
 *     setSuccess(t('saved'));
 *   }
 * };
 *
 * // In JSX:
 * {message && <Alert type={message.type} message={message.text} />}
 * <Button loading={isSaving} onClick={handleSave}>Save</Button>
 * ```
 */
export function useModalState(): UseModalStateReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<ModalMessage | null>(null);

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, []);

  const setSuccess = useCallback((text: string) => {
    setMessage({ type: 'success', text });
  }, []);

  const setError = useCallback((text: string) => {
    setMessage({ type: 'error', text });
  }, []);

  const withSaving = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | null> => {
      setIsSaving(true);
      setMessage(null);
      try {
        return await fn();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        setMessage({ type: 'error', text: errorMessage });
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  return {
    isSaving,
    message,
    clearMessage,
    setSuccess,
    setError,
    withSaving,
  };
}

/**
 * Hook for managing multiple loading states in a modal
 * Useful when a modal has multiple async operations (e.g., save and pull)
 */
interface UseMultiLoadingReturn {
  /** Check if a specific operation is loading */
  isLoading: (key: string) => boolean;
  /** Check if any operation is loading */
  isAnyLoading: boolean;
  /** Wrap an async function with named loading state */
  withLoading: <T>(key: string, fn: () => Promise<T>) => Promise<T>;
}

export function useMultiLoading(): UseMultiLoadingReturn {
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());

  const isLoading = useCallback(
    (key: string) => loadingKeys.has(key),
    [loadingKeys]
  );

  const isAnyLoading = loadingKeys.size > 0;

  const withLoading = useCallback(
    async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
      setLoadingKeys((prev) => new Set(prev).add(key));
      try {
        return await fn();
      } finally {
        setLoadingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    []
  );

  return {
    isLoading,
    isAnyLoading,
    withLoading,
  };
}
