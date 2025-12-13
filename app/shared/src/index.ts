// ============================================
// WebSocket Message Types
// ============================================

// Client -> Server messages
export interface WSConnectMessage {
  type: 'connect';
}

export interface WSResumeMessage {
  type: 'resume';
  sessionId: string;
}

export interface WSUserMessage {
  type: 'user_message';
  content: string;
  model?: string;
  sessionId?: string;
}

export type IncomingWSMessage =
  | WSConnectMessage
  | WSResumeMessage
  | WSUserMessage;

// Server -> Client messages
export interface WSConnectedResponse {
  type: 'connected';
}

export interface WSInitResponse {
  type: 'init';
  sessionId: string;
  version: string;
  model: string;
}

export interface WSHistoryResponse {
  type: 'history';
  messages: any[];
}

export interface WSAssistantMessage {
  type: 'assistant_message';
  content: string;
}

export interface WSToolUseMessage {
  type: 'tool_use';
  toolName: string;
  toolId?: string;
  toolInput?: any;
}

export interface WSResultMessage {
  type: 'result';
  success: boolean;
}

export interface WSErrorMessage {
  type: 'error';
  error: string;
}

export type OutgoingWSMessage =
  | WSConnectedResponse
  | WSInitResponse
  | WSHistoryResponse
  | WSAssistantMessage
  | WSToolUseMessage
  | WSResultMessage
  | WSErrorMessage;

// Agent message type (used internally by backend)
export type AgentMessage =
  | WSInitResponse
  | WSAssistantMessage
  | WSToolUseMessage
  | WSResultMessage
  | WSErrorMessage;
