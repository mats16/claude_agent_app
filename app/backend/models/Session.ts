import { typeid, TypeID } from 'typeid-js';
import path from 'path';
import fs from 'fs';
import type { SelectSession } from '../db/schema.js';
import { paths } from '../config/index.js';

/**
 * SessionDraft - Simple ID generator for new sessions
 * Used during creation to generate TypeID before saving to DB
 * Provides ID-based helper methods
 */
export class SessionDraft {
  private _typeId: TypeID<'session'>; // Internal TypeID instance

  constructor() {
    this._typeId = typeid('session'); // Generate TypeID
  }

  /**
   * Get the session ID as string (format: session_XXXXXXXXXXXXXXXXXXXXXXXXXX)
   */
  get id(): string {
    return this._typeId.toString();
  }

  /**
   * Get the agent's current working directory path
   * Uses TypeID suffix to avoid redundancy (sessionsBase already contains "session")
   * Path format: {SESSIONS_BASE_PATH}/{suffix}
   * Example: /home/app/session/01h455vb4pex5vsknk084sn02q
   */
  cwd(): string {
    return path.join(paths.sessionsBase, this._typeId.getSuffix());
  }

  /**
   * Get app name for Databricks Apps
   * Uses TypeID suffix directly to avoid string manipulation
   * Example: session_01h455vb4pex5vsknk084sn02q → app-01h455vb4pex5vsknk084sn02q (30 chars)
   */
  getAppName(): string {
    return `app-${this._typeId.getSuffix()}`;
  }

  /**
   * Get git branch name
   */
  getBranchName(): string {
    return `claude/${this.id}`;
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
}

/**
 * Session - Represents a persisted session
 * Extends SessionDraft to inherit ID-based helper methods
 */
export class Session extends SessionDraft {
  readonly claudeCodeSessionId: string; // SDK session ID
  readonly userId: string;
  readonly model: string;
  readonly title: string | null;
  readonly summary: string | null;
  readonly databricksWorkspacePath: string | null;
  readonly databricksWorkspaceAutoPush: boolean;
  readonly isArchived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(selectSession: SelectSession) {
    super();

    // Override internal TypeID from DB string ID
    ((this as unknown) as { _typeId: TypeID<'session'> })._typeId = TypeID.fromString(
      selectSession.id
    ) as TypeID<'session'>;

    this.claudeCodeSessionId = selectSession.claudeCodeSessionId;
    this.userId = selectSession.userId;
    this.model = selectSession.model;
    this.title = selectSession.title;
    this.summary = selectSession.summary;
    this.databricksWorkspacePath = selectSession.databricksWorkspacePath;
    this.databricksWorkspaceAutoPush = selectSession.databricksWorkspaceAutoPush;
    this.isArchived = selectSession.isArchived;
    this.createdAt = selectSession.createdAt;
    this.updatedAt = selectSession.updatedAt;
  }
}
