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

// Session-related WebSocket types are in session.ts
import type {
  WSResumeMessage,
  WSUserMessage,
  WSControlRequest,
} from './session.js';

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

// Re-export session types
export * from './session.js';

// Re-export Claude model utilities
export * from './claude-model.js';
