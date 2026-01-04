import fs from 'fs';
import path from 'path';

/**
 * User paths (shared interface for local and remote)
 */
export interface UserPaths {
  /** User home directory */
  homeDir: string;
  /** Claude config directory */
  claudeConfigDir: string;
}

/**
 * Headers type for RequestUser.fromHeaders
 */
export type HeadersLike = {
  [key: string]: string | string[] | undefined;
};

/**
 * User class extracted from request headers
 */
export class RequestUser {
  /** User identifier from IdP (X-Forwarded-User) */
  readonly sub: string;
  /** User email (X-Forwarded-Email) */
  readonly email: string;
  /** User display name (X-Forwarded-Preferred-Username) */
  readonly preferredUsername: string;
  /** Username extracted from email (part before @) */
  readonly name: string;
  /** OBO access token (X-Forwarded-Access-Token) */
  readonly accessToken: string;
  /** Local paths (on application server): $HOME/users/{name} */
  readonly local: UserPaths;
  /** Remote paths (on Databricks Workspace): /Workspace/Users/{email} */
  readonly remote: UserPaths;

  private constructor(params: {
    sub: string;
    email: string;
    preferredUsername: string;
    name: string;
    accessToken: string;
    local: UserPaths;
    remote: UserPaths;
  }) {
    this.sub = params.sub;
    this.email = params.email;
    this.preferredUsername = params.preferredUsername;
    this.name = params.name;
    this.accessToken = params.accessToken;
    this.local = params.local;
    this.remote = params.remote;
  }

  /**
   * Create User instance from request headers
   * @param headers - Request headers containing X-Forwarded-* values
   * @param usersBase - Base directory for user files (from config)
   * @returns User instance
   * @throws Error if required headers are missing
   */
  static fromHeaders(headers: HeadersLike, usersBase: string): RequestUser {
    const sub = headers['x-forwarded-user'] as string | undefined;
    const preferredUsername = headers['x-forwarded-preferred-username'] as
      | string
      | undefined;
    const email = headers['x-forwarded-email'] as string | undefined;
    const oboAccessToken = headers['x-forwarded-access-token'] as
      | string
      | undefined;
    if (!sub || !preferredUsername || !email || !oboAccessToken) {
      throw new Error(
        'User authentication required. Missing x-forwarded-user, x-forwarded-preferred-username, x-forwarded-email, or x-forwarded-access-token headers.'
      );
    }
    const username = email.split('@')[0];

    return new RequestUser({
      sub,
      email,
      preferredUsername,
      name: username,
      accessToken: oboAccessToken,
      local: {
        homeDir: path.join(usersBase, username),
        claudeConfigDir: path.join(usersBase, username, '.claude'),
      },
      remote: {
        homeDir: path.join('/Workspace/Users', email),
        claudeConfigDir: path.join('/Workspace/Users', email, '.claude'),
      },
    });
  }

  /** Local skills directory path */
  get skillsPath(): string {
    return path.join(this.local.claudeConfigDir, 'skills');
  }

  /** Local agents directory path */
  get agentsPath(): string {
    return path.join(this.local.claudeConfigDir, 'agents');
  }

  /** Remote skills directory path (on Databricks Workspace) */
  get remoteSkillsPath(): string {
    return path.join(this.remote.claudeConfigDir, 'skills');
  }

  /** Remote agents directory path (on Databricks Workspace) */
  get remoteAgentsPath(): string {
    return path.join(this.remote.claudeConfigDir, 'agents');
  }

  /**
   * Ensure user's local directory structure exists
   * Creates: /home/app/users/{user.name}/.claude/skills
   *          /home/app/users/{user.name}/.claude/agents
   */
  ensureLocalDirs(): void {
    fs.mkdirSync(this.skillsPath, { recursive: true });
    fs.mkdirSync(this.agentsPath, { recursive: true });
  }
}
