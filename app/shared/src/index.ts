// ============================================
// Content Block Types (for multimodal messages)
// ============================================

export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/webp' | 'image/jpeg' | 'image/png' | 'image/gif';
    data: string; // base64 encoded
  };
}

export interface DocumentContent {
  type: 'document';
  source: {
    type: 'base64';
    media_type: 'application/pdf';
    data: string; // base64 encoded
  };
}

export interface TextContent {
  type: 'text';
  text: string;
}

export type MessageContent = TextContent | ImageContent | DocumentContent;

// ============================================
// File Upload Types
// ============================================

export interface FileAttachment {
  file_name: string;
  original_name: string;
  size: number;
  mime_type: string;
  uploaded_at: string;
}

export interface FileListResponse {
  files: FileAttachment[];
}

export interface FileUploadResponse {
  file_name: string;
  original_name: string;
  size: number;
  mime_type: string;
}

// ============================================
// WebSocket Message Types (Client -> Server)
// ============================================

export interface WSConnectMessage {
  type: 'connect';
  last_event_uuid?: string;
}

export interface WSResumeMessage {
  type: 'resume';
  session_id: string;
}

export interface WSUserMessage {
  type: 'user_message';
  content: MessageContent[]; // Always array of content blocks
  model?: string;
  session_id?: string;
}

export interface WSControlRequest {
  type: 'control_request';
  request_id: string;
  request: {
    subtype: 'interrupt';
  };
}

export type IncomingWSMessage =
  | WSConnectMessage
  | WSResumeMessage
  | WSUserMessage
  | WSControlRequest;

// ============================================
// WebSocket Message Types (Server -> Client)
// ============================================

export interface WSConnectedResponse {
  type: 'connected';
}

export interface WSErrorResponse {
  type: 'error';
  error: string;
}

// ============================================
// REST API Types
// ============================================

// POST /api/v1/sessions
export interface CreateSessionRequest {
  events: Array<{
    uuid: string;
    session_id: string;
    type: string;
    message: { role: string; content: string };
  }>;
  session_context: {
    model: string;
    workspace_path?: string;
  };
}

export interface CreateSessionResponse {
  session_id: string;
}
