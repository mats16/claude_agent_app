import fp from 'fastify-plugin';
import type { WebSocket as WsWebSocket } from 'ws';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { MessageStream } from '../agent/index.js';

// Session event queue for streaming events to WebSocket
export interface SessionQueue {
  events: SDKMessage[];
  listeners: Set<(event: SDKMessage) => void>;
  completed: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    sessionQueues: Map<string, SessionQueue>;
    sessionMessageStreams: Map<string, MessageStream>;
    sessionWebSockets: Map<string, Set<WsWebSocket>>;
    userSessionListeners: Map<string, Set<WsWebSocket>>;
    notifySessionCreated: (
      userId: string,
      session: {
        id: string;
        title: string;
        workspacePath: string | null;
        workspaceAutoPush: boolean;
        updatedAt: string;
      }
    ) => void;
  }
}

export default fp(
  async (fastify) => {
    // Session event queues
    const sessionQueues = new Map<string, SessionQueue>();
    fastify.decorate('sessionQueues', sessionQueues);

    // MessageStream management for interactive sessions
    const sessionMessageStreams = new Map<string, MessageStream>();
    fastify.decorate('sessionMessageStreams', sessionMessageStreams);

    // Track active WebSocket connections per session
    const sessionWebSockets = new Map<string, Set<WsWebSocket>>();
    fastify.decorate('sessionWebSockets', sessionWebSockets);

    // User session list WebSocket connections (for real-time session list updates)
    const userSessionListeners = new Map<string, Set<WsWebSocket>>();
    fastify.decorate('userSessionListeners', userSessionListeners);

    // Notify user's session list listeners about session creation
    const notifySessionCreated = (
      userId: string,
      session: {
        id: string;
        title: string;
        workspacePath: string | null;
        workspaceAutoPush: boolean;
        updatedAt: string;
      }
    ) => {
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
    };
    fastify.decorate('notifySessionCreated', notifySessionCreated);
  },
  {
    name: 'session-state',
    dependencies: ['websocket'],
  }
);
