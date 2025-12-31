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
  fileName: string;
  originalName: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}

export interface FileListResponse {
  files: FileAttachment[];
}

export interface FileUploadResponse {
  path: string;
  size: number;
  mime_type: string;
}

export interface FileDeleteResponse {
  success: boolean;
  path: string;
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
  sessionId: string;
}

export interface WSUserMessage {
  type: 'user_message';
  content: MessageContent[]; // Always array of content blocks
  model?: string;
  sessionId?: string;
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
    workspacePath?: string;
  };
}

export interface CreateSessionResponse {
  session_id: string;
}

// ============================================
// Session Response Types
// ============================================

/**
 * Session item in list response (minimal data)
 */
export interface SessionListItem {
  id: string;
  title: string | null;
  workspacePath: string | null;
  workspaceAutoPush: boolean;
  appAutoDeploy: boolean;
  updatedAt: string;
  isArchived: boolean;
}

/**
 * GET /api/v1/sessions response
 */
export interface SessionListResponse {
  sessions: SessionListItem[];
}

/**
 * GET /api/v1/sessions/:id response (detailed session data)
 */
export interface SessionResponse {
  id: string;
  title: string | null;
  summary: string | null;
  workspace_path: string | null;
  workspace_url: string | null;
  workspace_auto_push: boolean;
  local_path: string;
  is_archived: boolean;
  last_used_model: string | null;
  created_at: string;
  updated_at: string;
}
