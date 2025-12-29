import { typeid } from 'typeid-js';
import type { Session as DBSession } from '../db/schema.js';

/**
 * SessionDraft - Represents a session before it's saved to DB
 * Used during creation when we don't have claude_code_session_id yet
 */
export class SessionDraft {
  readonly id: string; // TypeID with 'session' prefix
  readonly model: string;
  readonly databricksWorkspacePath: string | null;
  readonly userId: string;
  readonly databricksWorkspaceAutoPush: boolean;
  readonly agentLocalPath: string;

  constructor(params?: {
    model?: string;
    databricksWorkspacePath?: string | null;
    userId?: string;
    databricksWorkspaceAutoPush?: boolean;
    agentLocalPath?: string;
  }) {
    this.id = typeid('session').toString(); // Generate TypeID
    this.model = params?.model ?? '';
    this.databricksWorkspacePath = params?.databricksWorkspacePath ?? null;
    this.userId = params?.userId ?? '';
    this.databricksWorkspaceAutoPush = params?.databricksWorkspaceAutoPush ?? false;
    this.agentLocalPath = params?.agentLocalPath ?? '';
  }

  /**
   * Get app name for Databricks Apps
   * Strips 'session_' prefix to fit 30-char limit
   * Example: session_01h455vb4pex5vsknk084sn02q → app-01h455vb4pex5vsknk084sn02q (30 chars)
   */
  getAppName(): string {
    return `app-${this.id.replace(/^session_/, '')}`;
  }

  /**
   * Get git branch name
   */
  getGitBranch(): string {
    return `claude/${this.id}`;
  }
}

/**
 * Session - Represents a persisted session
 * Extends SessionDraft with claude_code_session_id and metadata
 */
export class Session extends SessionDraft {
  readonly claudeCodeSessionId: string; // SDK session ID
  readonly title: string | null;
  readonly summary: string | null;
  readonly isArchived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(dbSession: DBSession) {
    super({
      model: dbSession.model,
      databricksWorkspacePath: dbSession.databricksWorkspacePath,
      userId: dbSession.userId,
      databricksWorkspaceAutoPush: dbSession.databricksWorkspaceAutoPush,
      agentLocalPath: dbSession.agentLocalPath,
    });

    // Override id from DB (TypeID)
    (this as { id: string }).id = dbSession.id;

    this.claudeCodeSessionId = dbSession.claudeCodeSessionId;
    this.title = dbSession.title;
    this.summary = dbSession.summary;
    this.isArchived = dbSession.isArchived;
    this.createdAt = dbSession.createdAt;
    this.updatedAt = dbSession.updatedAt;
  }
}
