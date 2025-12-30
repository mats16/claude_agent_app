import { typeid, TypeID } from 'typeid-js';
import path from 'path';
import fs from 'fs';
import type { SelectSession } from '../db/schema.js';
import { paths } from '../config/index.js';

/**
 * SessionBase - Abstract base class consolidating TypeID operations and common session fields
 * Eliminates the need for a separate SessionId wrapper class
 */
export abstract class SessionBase {
  protected readonly _typeId: TypeID<'session'>;

  // Common fields for both Draft and Session
  readonly userId: string;
  readonly model: string;
  readonly databricksWorkspacePath: string | null;
  readonly databricksWorkspaceAutoPush: boolean;

  // Discriminator - undefined for Draft, string for Session
  abstract readonly claudeCodeSessionId: string | undefined;

  // Protected constructor - use factory methods or subclass constructors
  protected constructor(params: {
    typeId: TypeID<'session'>;
    userId: string;
    model: string;
    databricksWorkspacePath: string | null;
    databricksWorkspaceAutoPush: boolean;
  }) {
    this._typeId = params.typeId;
    this.userId = params.userId;
    this.model = params.model;
    this.databricksWorkspacePath = params.databricksWorkspacePath;
    this.databricksWorkspaceAutoPush = params.databricksWorkspaceAutoPush;
  }

  /**
   * Public getter: Access the internal TypeID (for factory methods)
   * Read-only access to the TypeID instance
   */
  getTypeId(): TypeID<'session'> {
    return this._typeId;
  }

  /**
   * Protected factory helper: Generate new TypeID
   */
  protected static generateTypeId(): TypeID<'session'> {
    return typeid('session');
  }

  /**
   * Protected factory helper: Restore TypeID from string with validation
   * @throws Error if the ID is not a valid session TypeID
   */
  protected static typeIdFromString(id: string): TypeID<'session'> {
    const typeId = TypeID.fromString(id);

    // Validate that the TypeID has the correct 'session' prefix
    if (typeId.getType() !== 'session') {
      throw new Error(
        `Invalid session ID type: expected 'session', got '${typeId.getType()}'`
      );
    }

    return typeId as TypeID<'session'>;
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

  /**
   * Type guard: Check if this is a SessionDraft
   */
  isDraft(): this is SessionDraft {
    return this.claudeCodeSessionId === undefined;
  }

  /**
   * Type guard: Check if this is a Session
   */
  isSession(): this is Session {
    return this.claudeCodeSessionId !== undefined;
  }
}

/**
 * SessionDraft - Represents a session draft before SDK initialization
 * claudeCodeSessionId is always undefined
 */
export class SessionDraft extends SessionBase {
  readonly claudeCodeSessionId: undefined;
  readonly title: string | null;

  constructor(params: {
    userId: string;
    model: string;
    title?: string | null;
    databricksWorkspacePath?: string | null;
    databricksWorkspaceAutoPush?: boolean;
  }) {
    // Auto-generate TypeID
    super({
      typeId: SessionBase.generateTypeId(),
      userId: params.userId,
      model: params.model,
      databricksWorkspacePath: params.databricksWorkspacePath ?? null,
      databricksWorkspaceAutoPush: params.databricksWorkspaceAutoPush ?? false,
    });

    this.claudeCodeSessionId = undefined;
    this.title = params.title ?? null;
  }
}

/**
 * Session - Represents a persisted session with SDK session ID
 * Uses inheritance instead of composition for cleaner architecture
 */
export class Session extends SessionBase {
  readonly claudeCodeSessionId: string; // Required, non-undefined
  readonly title: string | null;
  readonly summary: string | null;
  readonly isArchived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  // Private constructor - use factory methods
  private constructor(data: {
    typeId: TypeID<'session'>;
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
    super({
      typeId: data.typeId,
      userId: data.userId,
      model: data.model,
      databricksWorkspacePath: data.databricksWorkspacePath,
      databricksWorkspaceAutoPush: data.databricksWorkspaceAutoPush,
    });

    this.claudeCodeSessionId = data.claudeCodeSessionId;
    this.title = data.title;
    this.summary = data.summary;
    this.isArchived = data.isArchived;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  /**
   * Factory: Create Session from DB query result
   */
  static fromSelectSession(selectSession: SelectSession): Session {
    return new Session({
      typeId: SessionBase.typeIdFromString(selectSession.id),
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
   * Factory: Create Session from SessionDraft after receiving SDK session ID
   */
  static fromSessionDraft(
    draft: SessionDraft,
    claudeCodeSessionId: string,
    createdAt: Date = new Date(),
    updatedAt: Date = new Date()
  ): Session {
    return new Session({
      typeId: draft.getTypeId(), // Access via protected getter
      claudeCodeSessionId,
      userId: draft.userId,
      model: draft.model,
      title: draft.title,
      summary: null, // New sessions have no summary
      databricksWorkspacePath: draft.databricksWorkspacePath,
      databricksWorkspaceAutoPush: draft.databricksWorkspaceAutoPush,
      isArchived: false,
      createdAt,
      updatedAt,
    });
  }
}
