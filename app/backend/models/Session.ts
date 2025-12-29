import fs from 'fs';
import path from 'path';
import { typeid, TypeID } from 'typeid-js';
import { paths } from '../config/index.js';

/**
 * Common interface for Session and SessionDraft
 */
export interface ISession {
  readonly id: string;
  readonly suffix: string;
  readonly shortSuffix: string;
  readonly localPath: string;
  readonly appName: string;
  readonly gitBranch: string;
  ensureLocalDir(): void;
}

/**
 * Data required to construct a Session (decoupled from ORM)
 */
export interface SessionData {
  id: string;
  claudeCodeSessionId: string;
  title: string | null;
  summary: string | null;
  model: string;
  databricksWorkspacePath: string | null;
  userId: string;
  databricksWorkspaceAutoPush: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Base class for session models using TypeID format (session_ + UUIDv7 Base32)
 *
 * Example ID: session_01h455vb4pex5vsknk084sn02q
 */
abstract class SessionBase implements ISession {
  protected readonly _id: TypeID<'session'>;

  protected constructor(id?: string) {
    if (id) {
      const parsed = TypeID.fromString(id);
      if (parsed.getType() !== 'session') {
        throw new Error(
          `Invalid session ID prefix: expected 'session', got '${parsed.getType()}'`
        );
      }
      this._id = parsed as TypeID<'session'>;
    } else {
      this._id = typeid('session');
    }
  }

  /**
   * Full TypeID string (e.g., "session_01h455vb4pex5vsknk084sn02q")
   */
  get id(): string {
    return this._id.toString();
  }

  /**
   * UUIDv7 Base32 suffix without prefix (e.g., "01h455vb4pex5vsknk084sn02q")
   */
  get suffix(): string {
    return this._id.getSuffix();
  }

  /**
   * Short suffix (last 12 characters of UUIDv7 Base32)
   * Used for: local directory name, git branch name
   *
   * 12 characters provide ~60 bits of entropy (5 bits per Base32 char).
   * Collision probability is negligible for practical use cases.
   */
  get shortSuffix(): string {
    return this.suffix.slice(-12);
  }

  /**
   * Local working directory path: $HOME/ws/{shortSuffix}
   */
  get localPath(): string {
    return path.join(paths.sessionsBase, this.shortSuffix);
  }

  /**
   * Databricks App name: dev-{suffix}
   * Uses full UUIDv7 Base32 suffix for uniqueness
   * Prefix 'dev-' keeps total length under 30 chars (4 + 26 = 30)
   */
  get appName(): string {
    return `dev-${this.suffix}`;
  }

  /**
   * Git branch name: claude/session-{shortSuffix}
   */
  get gitBranch(): string {
    return `claude/session-${this.shortSuffix}`;
  }

  /**
   * Ensure local working directory exists
   * Creates: $HOME/ws/{shortSuffix}
   */
  ensureLocalDir(): void {
    fs.mkdirSync(this.localPath, { recursive: true });
  }

  /**
   * Validate if a string is a valid session TypeID
   */
  static isValidId(id: string): boolean {
    try {
      const parsed = TypeID.fromString(id);
      return parsed.getType() === 'session';
    } catch {
      return false;
    }
  }
}

/**
 * Draft session before SDK init (no claudeCodeSessionId)
 *
 * Use this when creating a new session. After receiving the SDK init message,
 * create a full Session via createSession() which saves to DB and returns Session.
 */
export class SessionDraft extends SessionBase {
  constructor() {
    super();
  }
}

/**
 * Immutable session with all fields
 *
 * Created after SDK init when session is saved to DB, or loaded from DB.
 */
export class Session extends SessionBase {
  readonly claudeCodeSessionId: string;
  readonly title: string | null;
  readonly summary: string | null;
  readonly model: string;
  readonly databricksWorkspacePath: string | null;
  readonly userId: string;
  readonly databricksWorkspaceAutoPush: boolean;
  readonly isArchived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(data: SessionData) {
    super(data.id);
    this.claudeCodeSessionId = data.claudeCodeSessionId;
    this.title = data.title;
    this.summary = data.summary;
    this.model = data.model;
    this.databricksWorkspacePath = data.databricksWorkspacePath;
    this.userId = data.userId;
    this.databricksWorkspaceAutoPush = data.databricksWorkspaceAutoPush;
    this.isArchived = data.isArchived;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  /**
   * Create Session from data
   */
  static fromData(data: SessionData): Session {
    return new Session(data);
  }
}
