import { useState, useEffect, useRef, useCallback } from 'react';

// Response from GET /api/v1/sessions/:sessionId/app/live-status
export interface AppLiveStatus {
  app_status: {
    state: string;
    message: string;
  } | null;
  deployment_status: {
    deployment_id: string;
    state: string;
    message: string;
  } | null;
}

// Deploying states for app and deployment
const DEPLOYING_APP_STATES = ['STARTING', 'PENDING', 'DEPLOYING'];
const DEPLOYING_DEPLOYMENT_STATES = ['PENDING', 'IN_PROGRESS'];
// Unavailable/Error states
const UNAVAILABLE_APP_STATES = ['UNAVAILABLE', 'ERROR', 'CRASHED'];

export interface UseAppLiveStatusResult {
  status: AppLiveStatus | null;
  isLoading: boolean;
  error: string | null;
  isDeploying: boolean;
  isUnavailable: boolean;
}

export function useAppLiveStatus(
  sessionId: string | undefined,
  enabled: boolean
): UseAppLiveStatusResult {
  const [status, setStatus] = useState<AppLiveStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  // Calculate isDeploying from status
  const isDeploying =
    (status?.app_status?.state &&
      DEPLOYING_APP_STATES.includes(status.app_status.state)) ||
    (status?.deployment_status?.state &&
      DEPLOYING_DEPLOYMENT_STATES.includes(status.deployment_status.state)) ||
    false;

  // Calculate isUnavailable from status
  const isUnavailable =
    (status?.app_status?.state &&
      UNAVAILABLE_APP_STATES.includes(status.app_status.state)) ||
    false;

  const fetchStatus = useCallback(async () => {
    if (!sessionId || !isMountedRef.current) return;

    try {
      const response = await fetch(
        `/api/v1/sessions/${sessionId}/app/live-status`
      );

      if (!isMountedRef.current) return;

      if (response.status === 404) {
        // App not found yet - this is expected when app is not created
        setStatus(null);
        setError(null);
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to fetch app status');
        return;
      }

      const data: AppLiveStatus = await response.json();
      setStatus(data);
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
      setStatus(null);
      setError(null);
      setIsLoading(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial fetch
    setIsLoading(true);
    fetchStatus();

    // Set up polling (every 5 seconds)
    intervalRef.current = setInterval(fetchStatus, 5000);

    // Cleanup
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId, enabled, fetchStatus]);

  return {
    status,
    isLoading,
    error,
    isDeploying,
    isUnavailable,
  };
}
