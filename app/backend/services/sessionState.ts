import type { WebSocket as WsWebSocket } from 'ws';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { MessageContent } from '@app/shared';
import { MessageStream } from '../agent/index.js';

// Session event queue for streaming events to WebSocket
export interface SessionQueue {
  events: SDKMessage[];
  listeners: Set<(event: SDKMessage) => void>;
  completed: boolean;
}

// In-memory state
export const sessionQueues = new Map<string, SessionQueue>();
export const sessionMessageStreams = new Map<string, MessageStream>();
export const sessionWebSockets = new Map<string, Set<WsWebSocket>>();
export const userSessionListeners = new Map<string, Set<WsWebSocket>>();

// Notify user's session list listeners about session creation
export function notifySessionCreated(
  userId: string,
  session: {
    id: string;
    title: string;
    workspacePath: string | null;
    workspaceAutoPush: boolean;
    appAutoDeploy: boolean;
    updatedAt: string;
  }
) {
  const listeners = userSessionListeners.get(userId);
  if (!listeners) return;

  const message = JSON.stringify({
    type: 'session_created',
    session,
  });

  for (const ws of listeners) {
    try {
      ws.send(message);
    } catch (error) {
      console.error('Failed to send session_created notification:', error);
    }
  }
}

export function getOrCreateQueue(sessionId: string): SessionQueue {
  let queue = sessionQueues.get(sessionId);
  if (!queue) {
    queue = { events: [], listeners: new Set(), completed: false };
    sessionQueues.set(sessionId, queue);
  }
  return queue;
}

export function addEventToQueue(sessionId: string, event: SDKMessage) {
  const queue = getOrCreateQueue(sessionId);
  queue.events.push(event);
  // Notify all listeners
  queue.listeners.forEach((listener) => listener(event));
}

export function markQueueCompleted(sessionId: string) {
  const queue = sessionQueues.get(sessionId);
  if (queue) {
    queue.completed = true;
  }
}

// Generate short random ID for control requests
function generateRequestId(): string {
  return Math.random().toString(36).slice(2, 13);
}

// Create control_request message (for interrupt, etc.)
export function createControlRequest(
  sessionId: string,
  subtype: 'interrupt'
): { message: SDKMessage; requestId: string } {
  const requestId = generateRequestId();
  const message = {
    type: 'control_request',
    session_id: sessionId,
    uuid: crypto.randomUUID(),
    request_id: requestId,
    request: {
      subtype,
    },
  } as unknown as SDKMessage;
  return { message, requestId };
}

// Create control_response message
export function createControlResponse(
  requestId: string,
  subtype: 'success' | 'error'
): object {
  return {
    type: 'control_response',
    response: {
      request_id: requestId,
      subtype,
    },
  };
}

// Create result message (for completion or interruption)
export function createResultMessage(
  sessionId: string,
  subtype: 'success' | 'interrupted',
  result: string = ''
): SDKMessage {
  return {
    type: 'result',
    session_id: sessionId,
    uuid: crypto.randomUUID(),
    subtype,
    is_error: false,
    result,
  } as SDKMessage;
}

// Create SDKMessage for user message (supports text, image, and document content)
export function createUserMessage(
  sessionId: string,
  content: MessageContent[]
): SDKMessage {
  // Convert MessageContent[] to API format
  const apiContent = content.map((c) => {
    if (c.type === 'text') {
      return { type: 'text' as const, text: c.text };
    } else if (c.type === 'image') {
      return {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: c.source.media_type,
          data: c.source.data,
        },
      };
    } else if (c.type === 'document') {
      // Document content (PDF) - pass through as-is
      return {
        type: 'document' as const,
        source: {
          type: 'base64' as const,
          media_type: c.source.media_type,
          data: c.source.data,
        },
      };
    } else {
      // Unknown type - pass through
      return c;
    }
  });

  return {
    type: 'user',
    session_id: sessionId,
    uuid: crypto.randomUUID(),
    message: {
      role: 'user',
      content: apiContent,
    },
  } as SDKMessage;
}
