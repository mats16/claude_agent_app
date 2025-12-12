// Agent message types sent to frontend
export interface AgentMessage {
  type: 'assistant_message' | 'tool_use' | 'result' | 'error';
  content?: string;
  toolName?: string;
  toolId?: string;
  toolInput?: any;
  success?: boolean;
  error?: string;
}

// WebSocket incoming messages from frontend
export interface WSInitMessage {
  type: 'init';
}

export interface WSChatMessage {
  type: 'message';
  content: string;
  model?: string;
}

export type IncomingWSMessage = WSInitMessage | WSChatMessage;

// WebSocket outgoing messages to frontend
export interface WSInitResponse {
  type: 'init';
  status: 'ready';
  workspacePath: string;
}

export interface WSErrorResponse {
  type: 'error';
  error: string;
}

export type OutgoingWSMessage = WSInitResponse | WSErrorResponse | AgentMessage;
