import fs from 'fs';
import path from 'path';
import { typeid, TypeID } from 'typeid-js';
import { paths } from '../config/index.js';

/**
 * Session model using TypeID format (session_ + UUIDv7 Base32)
 *
 * Example ID: session_01h455vb4pex5vsknk084sn02q
 */
export class Session {
  private readonly _id: TypeID<'session'>;
  private _claudeCodeSessionId: string | null = null;

  /**
   * Create a new Session or restore from existing ID
   * @param id - Optional existing TypeID string to restore
   */
  constructor(id?: string) {
    if (id) {
      this._id = TypeID.fromString(id) as TypeID<'session'>;
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
   * Short suffix for App name and directory (last 8 characters)
   * Used for: app-by-claude-{shortSuffix}, directory name
   */
  get shortSuffix(): string {
    return this.suffix.slice(-8);
  }

  /**
   * Claude Code internal session ID (set after init message)
   */
  get claudeCodeSessionId(): string | null {
    return this._claudeCodeSessionId;
  }

  /**
   * Local working directory path: $HOME/ws/{shortSuffix}
   */
  get localPath(): string {
    return path.join(paths.sessionsBase, this.shortSuffix);
  }

  /**
   * Databricks App name: app-by-claude-{shortSuffix}
   * Fits within 30-char limit
   */
  get appName(): string {
    return `app-by-claude-${this.shortSuffix}`;
  }

  /**
   * Git branch name: claude/session-{shortSuffix}
   */
  get gitBranch(): string {
    return `claude/session-${this.shortSuffix}`;
  }

  /**
   * Set Claude Code internal session ID (from init message)
   */
  setClaudeCodeSessionId(sessionId: string): void {
    this._claudeCodeSessionId = sessionId;
  }

  /**
   * Ensure local working directory exists
   * Creates: $HOME/ws/{shortSuffix}
   */
  ensureLocalDir(): void {
    fs.mkdirSync(this.localPath, { recursive: true });
  }

  /**
   * Create Session from existing TypeID string
   */
  static fromString(id: string): Session {
    return new Session(id);
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
