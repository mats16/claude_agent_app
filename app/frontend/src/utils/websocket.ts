/**
 * WebSocket utilities for connection management
 * Extracted from useAgent.ts for reusability and testability
 */

// Reconnection configuration
export const RECONNECT_MAX_ATTEMPTS = 5;
export const RECONNECT_BASE_DELAY = 1000; // 1 second
export const RECONNECT_MAX_DELAY = 30000; // 30 seconds

/**
 * Calculate reconnection delay with exponential backoff
 * @param attempts - Number of reconnection attempts made
 * @returns Delay in milliseconds before next reconnection attempt
 */
export function calculateReconnectDelay(attempts: number): number {
  const delay = RECONNECT_BASE_DELAY * Math.pow(2, attempts);
  return Math.min(delay, RECONNECT_MAX_DELAY);
}

/**
 * Create WebSocket URL for agent session
 * @param sessionId - Session ID to connect to
 * @returns WebSocket URL
 */
export function createAgentWebSocketUrl(sessionId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/v1/sessions/${sessionId}/ws`;
}

/**
 * Create WebSocket URL for session list updates
 * @returns WebSocket URL
 */
export function createSessionsWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/v1/sessions/ws`;
}
