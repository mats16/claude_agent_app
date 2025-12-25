import { useState, useEffect, useRef, useCallback } from 'react';

export interface Deployment {
  deployment_id: string;
  create_time: string;
  update_time: string;
  source_code_path?: string;
  status: {
    state: string;
    message?: string;
  };
}

interface DeploymentsResponse {
  app_deployments?: Deployment[];
}

export interface UseAppDeploymentsResult {
  deployments: Deployment[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAppDeployments(
  sessionId: string | undefined,
  enabled: boolean
): UseAppDeploymentsResult {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  const fetchDeployments = useCallback(async () => {
    if (!sessionId || !isMountedRef.current) return;

    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/v1/sessions/${sessionId}/app/deployments`
      );

      if (!isMountedRef.current) return;

      if (response.status === 404) {
        // App not found yet
        setDeployments([]);
        setError(null);
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to fetch deployments');
        return;
      }

      const data: DeploymentsResponse = await response.json();
      // Sort by create_time descending (newest first)
      const sorted = (data.app_deployments || []).sort(
        (a, b) =>
          new Date(b.create_time).getTime() - new Date(a.create_time).getTime()
      );
      setDeployments(sorted);
      setError(null);
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setError(err.message || 'Network error');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    isMountedRef.current = true;

    // Clear previous state when sessionId changes or polling is disabled
    if (!enabled || !sessionId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial fetch
    fetchDeployments();

    // Set up polling while expanded (every 5 seconds)
    intervalRef.current = setInterval(fetchDeployments, 5000);

    // Cleanup
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId, enabled, fetchDeployments]);

  return {
    deployments,
    isLoading,
    error,
    refetch: fetchDeployments,
  };
}
