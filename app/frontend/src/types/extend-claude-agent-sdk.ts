/**
 * Extended types for @anthropic-ai/claude-agent-sdk
 * Re-exports SDK types and provides extended versions with proper typing
 */

import type { ImageContent } from '@app/shared';
import type { SDKUserMessage as SDKUserMessageBase } from '@anthropic-ai/claude-agent-sdk';

// ============================================
// Re-export SDK Message Types
// ============================================

export type {
  SDKAssistantMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';

// ============================================
// Edit Tool Result Types
// ============================================

export interface StructuredPatchHunk {
  lines: string[];
  newLines: number;
  newStart: number;
  oldLines: number;
  oldStart: number;
}

export interface EditToolUseResult {
  filePath: string;
  oldString: string;
  newString: string;
  structuredPatch?: StructuredPatchHunk[];
}

// ============================================
// TodoWrite Tool Result Types
// ============================================

export interface TodoItem {
  status: 'pending' | 'in_progress' | 'completed';
  content: string;
  activeForm: string;
}

export interface TodoWriteResult {
  newTodos: TodoItem[];
  oldTodos: TodoItem[];
}

// ============================================
// Extended SDK Message Types
// ============================================

/**
 * Extended SDKUserMessage with properly typed tool_use_result
 * Original SDK type has tool_use_result?: unknown
 */
export interface SDKUserMessage extends Omit<
  SDKUserMessageBase,
  'tool_use_result'
> {
  tool_use_result?: EditToolUseResult | TodoWriteResult;
}

// ============================================
// Simplified Content Block (for processing SDK messages)
// ============================================

export interface SDKContentBlock {
  type: string;
  text?: string;
  tool_use_id?: string;
  content?: string | Array<{ type: string; text?: string }>;
  name?: string;
  id?: string;
  input?: unknown;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

// ============================================
// Frontend-specific Types
// ============================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  images?: ImageContent[];
  timestamp: Date;
}

export interface UseAgentOptions {
  sessionId?: string;
  initialMessage?: string;
  model?: string;
}
