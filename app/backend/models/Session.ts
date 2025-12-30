import { typeid, TypeID } from 'typeid-js';
import path from 'path';
import fs from 'fs';
import type { SelectSession } from '../db/schema.js';
import { paths } from '../config/index.js';

/**
 * SessionId - Wrapper around TypeID<'session'> with domain-specific utilities
 * Uses composition pattern since TypeID is an external library
 * Factory methods prevent direct instantiation
 */
export class SessionId {
  private readonly _typeId: TypeID<'session'>;

  // Private constructor - use factory methods
  private constructor(typeId: TypeID<'session'>) {
    this._typeId = typeId;
  }

  /**
   * Factory: Generate new session ID
   */
  static generate(): SessionId {
    return new SessionId(typeid('session'));
  }

  /**
   * Factory: Restore from DB string
   */
  static fromString(id: string): SessionId {
    return new SessionId(TypeID.fromString(id) as TypeID<'session'>);
  }

  /**
   * TypeID proxy methods
   */
  toString(): string {
    return this._typeId.toString();
  }

  getSuffix(): string {
    return this._typeId.getSuffix();
  }

  /**
   * Get the agent's current working directory path
   * Uses TypeID suffix to avoid redundancy (sessionsBase already contains "session")
   * Path format: {SESSIONS_BASE_PATH}/{suffix}
   * Example: /home/app/session/01h455vb4pex5vsknk084sn02q
   */
  cwd(): string {
    return path.join(paths.sessionsBase, this.getSuffix());
  }

  /**
   * Get app name for Databricks Apps
   * Uses TypeID suffix directly to avoid string manipulation
   * Example: session_01h455vb4pex5vsknk084sn02q → app-01h455vb4pex5vsknk084sn02q (30 chars)
   */
  getAppName(): string {
    return `app-${this.getSuffix()}`;
  }

  /**
   * Get git branch name
   */
  getBranchName(): string {
    return `claude/${this.toString()}`;
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
        `Failed to create working directory for session ${this.toString()}: ${err.message}`
      );
    }
  }
}

/**
 * Session - Represents a persisted session
 * Uses composition with SessionId for ID-based operations
 */
export class Session {
  readonly id: SessionId; // Composition, not inheritance
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

  // Private constructor - use factory methods
  private constructor(data: {
    id: SessionId;
    claudeCodeSessionId: string;
    userId: string;
    model: string;
    title: string | null;
    summary: string | null;
    databricksWorkspacePath: string | null;
    databricksWorkspaceAutoPush: boolean;
    isArchived: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = data.id;
    this.claudeCodeSessionId = data.claudeCodeSessionId;
    this.userId = data.userId;
    this.model = data.model;
    this.title = data.title;
    this.summary = data.summary;
    this.databricksWorkspacePath = data.databricksWorkspacePath;
    this.databricksWorkspaceAutoPush = data.databricksWorkspaceAutoPush;
    this.isArchived = data.isArchived;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  /**
   * Factory: Create Session from DB query result
   */
  static fromSelectSession(selectSession: SelectSession): Session {
    return new Session({
      id: SessionId.fromString(selectSession.id),
      claudeCodeSessionId: selectSession.claudeCodeSessionId,
      userId: selectSession.userId,
      model: selectSession.model,
      title: selectSession.title,
      summary: selectSession.summary,
      databricksWorkspacePath: selectSession.databricksWorkspacePath,
      databricksWorkspaceAutoPush: selectSession.databricksWorkspaceAutoPush,
      isArchived: selectSession.isArchived,
      createdAt: selectSession.createdAt,
      updatedAt: selectSession.updatedAt,
    });
  }

  /**
   * Delegate path methods to SessionId
   */
  cwd(): string {
    return this.id.cwd();
  }

  getAppName(): string {
    return this.id.getAppName();
  }

  getBranchName(): string {
    return this.id.getBranchName();
  }

  createWorkingDirectory(): string {
    return this.id.createWorkingDirectory();
  }
}
