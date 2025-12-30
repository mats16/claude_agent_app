import { typeid } from 'typeid-js';
import path from 'path';
import fs from 'fs';
import type { SelectSession } from '../db/schema.js';
import { paths } from '../config/index.js';

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

  constructor(params?: {
    model?: string;
    databricksWorkspacePath?: string | null;
    userId?: string;
    databricksWorkspaceAutoPush?: boolean;
  }) {
    this.id = typeid('session').toString(); // Generate TypeID
    this.model = params?.model ?? '';
    this.databricksWorkspacePath = params?.databricksWorkspacePath ?? null;
    this.userId = params?.userId ?? '';
    this.databricksWorkspaceAutoPush = params?.databricksWorkspaceAutoPush ?? false;
  }

  /**
   * Get the agent's current working directory path
   * Computed from session ID: {SESSIONS_BASE_PATH}/{session_id}
   */
  cwd(): string {
    return path.join(paths.sessionsBase, this.id);
  }

  /**
   * Create working directory structure for this session
   * Creates:
   * - Session working directory at {SESSIONS_BASE_PATH}/{session_id}
   * - .claude config subdirectory
   *
   * @returns The absolute path to the created working directory
   * @throws Error if directory creation fails
   */
  createWorkingDirectory(): string {
    const workDir = this.cwd();
    const claudeConfigDir = path.join(workDir, '.claude');

    try {
      // Create session working directory
      fs.mkdirSync(workDir, { recursive: true });

      // Create .claude config subdirectory
      fs.mkdirSync(claudeConfigDir, { recursive: true });

      return workDir;
    } catch (error) {
      const err = error as Error;
      throw new Error(
        `Failed to create working directory for session ${this.id}: ${err.message}`
      );
    }
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

  constructor(selectSession: SelectSession) {
    super({
      model: selectSession.model,
      databricksWorkspacePath: selectSession.databricksWorkspacePath,
      userId: selectSession.userId,
      databricksWorkspaceAutoPush: selectSession.databricksWorkspaceAutoPush,
    });

    // Override id from DB (TypeID)
    (this as { id: string }).id = selectSession.id;

    this.claudeCodeSessionId = selectSession.claudeCodeSessionId;
    this.title = selectSession.title;
    this.summary = selectSession.summary;
    this.isArchived = selectSession.isArchived;
    this.createdAt = selectSession.createdAt;
    this.updatedAt = selectSession.updatedAt;
  }
}
