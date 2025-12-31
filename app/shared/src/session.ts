import type { MessageContent } from './index.js';

// ============================================
// Session Types
// ============================================

// POST /api/v1/sessions request
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

// POST /api/v1/sessions response
export interface CreateSessionResponse {
  session_id: string;
}

/**
 * Session item in list response (minimal data)
 * GET /api/v1/sessions
 */
export interface SessionListItem {
  id: string;
  title: string | null;
  workspace_path: string | null;
  workspace_auto_push: boolean;
  app_auto_deploy: boolean;
  updated_at: string;
  is_archived: boolean;
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

// ============================================
// Session WebSocket Types
// ============================================

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
