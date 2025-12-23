/**
 * SDK Message type definitions
 * Extracted from useAgent.ts for reusability and testability
 */

import type { ImageContent } from '@app/shared';

// Base interface for all SDK messages
export interface SDKMessageBase {
  type: string;
  session_id: string;
  uuid?: string;
  isSynthetic?: boolean; // Synthetic messages should be hidden from UI
}

// Content block within messages
export interface SDKContentBlock {
  type: string;
  text?: string;
  tool_use_id?: string;
  content?: string | Array<{ type: string; text?: string }>;
  // Image content
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

// User message from SDK
export interface SDKUserMessage extends SDKMessageBase {
  type: 'user';
  message: {
    role: 'user';
    content: string | SDKContentBlock[];
  };
}

// Assistant message from SDK
export interface SDKAssistantMessage extends SDKMessageBase {
  type: 'assistant';
  message: {
    role: 'assistant';
    content: Array<{
      type: string;
      text?: string;
      name?: string;
      id?: string;
      input?: unknown;
    }>;
  };
}

// Result message from SDK
export interface SDKResultMessage extends SDKMessageBase {
  type: 'result';
  subtype: string;
  is_error: boolean;
  result: string;
}

// System message from SDK
export interface SDKSystemMessage extends SDKMessageBase {
  type: 'system';
  subtype: string;
}

// Union type for all SDK messages
export type SDKMessage =
  | SDKUserMessage
  | SDKAssistantMessage
  | SDKResultMessage
  | SDKSystemMessage
  | SDKMessageBase;

// Chat message for UI display
export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  images?: ImageContent[];
  timestamp: Date;
}

// Options for useAgent hook
export interface UseAgentOptions {
  sessionId?: string;
  initialMessage?: string;
  model?: string;
}
