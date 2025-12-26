import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { createDatabricksMcpServer } from './mcp/databricks.js';
import fs from 'fs';
import path from 'path';
import type { MessageContent } from '@app/shared';
import { databricks, warehouseIds, agentEnv } from '../config/index.js';
import type { RequestUser } from '../models/RequestUser.js';

export type { SDKMessage };

// Token cache for service principal
let cachedToken: { token: string; expiresAt: number } | null = null;

// Get service principal access token from Databricks OAuth2
export async function getOidcAccessToken(): Promise<string | undefined> {
  // Check if cached token is still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  if (!databricks.clientId || !databricks.clientSecret) {
    return undefined;
  }

  // Request token from Databricks OAuth2 endpoint
  const tokenUrl = `https://${databricks.host}/oidc/v1/token`;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: databricks.clientId,
      client_secret: databricks.clientSecret,
      scope: 'all-apis',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get service principal token: ${response.status} ${errorText}`
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in?: number;
  };
  const expiresIn = data.expires_in || 3600; // Default to 1 hour

  // Cache token with 5 minute buffer before expiration
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (expiresIn - 300) * 1000,
  };

  return data.access_token;
}

// Get access token (Service Principal only)
export async function getAccessToken(): Promise<string> {
  const spToken = await getOidcAccessToken();
  if (!spToken) {
    throw new Error(
      'No access token available. Set DATABRICKS_CLIENT_ID/DATABRICKS_CLIENT_SECRET.'
    );
  }
  return spToken;
}

// Options for processAgentRequest
export interface ProcessAgentRequestOptions {
  workspaceAutoPush?: boolean; // workspace pushを実行
  claudeConfigAutoPush?: boolean; // claude config pull/push
  agentLocalPath?: string; // agent working directory path (created before agent starts)
  waitForReady?: Promise<void>; // Promise to wait for before processing first message (e.g., workspace pull)
  appAutoDeploy?: boolean; // Flag to enable auto-deploy to Databricks Apps via hooks
  sessionStub: string; // 8-char hex session identifier (required for SESSION_APP_NAME, GIT_BRANCH)
}

// MessageStream: Manages message queue for streaming input
// Allows external code to add messages to the agent session dynamically
export class MessageStream {
  private queue: MessageContent[][] = [];
  private resolvers: Array<() => void> = [];
  private isDone = false;
  private waitForReady?: Promise<void>;
  private _abortController: AbortController;

  constructor(initialMessage: MessageContent[], waitForReady?: Promise<void>) {
    this.queue.push(initialMessage);
    this.waitForReady = waitForReady;
    this._abortController = new AbortController();
  }

  // Get the AbortController for SDK query
  get abortController(): AbortController {
    return this._abortController;
  }

  // Abort the stream (stops processing immediately via AbortController)
  abort(): void {
    this._abortController.abort();
    this.complete();
  }

  // Add message to queue (called from WebSocket handler)
  addMessage(contents: MessageContent[]): void {
    if (this.isDone) return;
    this.queue.push(contents);
    // Resolve waiting promise if any
    const resolve = this.resolvers.shift();
    if (resolve) resolve();
  }

  // Generator that yields messages from queue
  async *stream(): AsyncGenerator<SDKUserMessage> {
    // Wait for workspace pull to complete before yielding first message
    // This allows SDK to emit init message while we wait
    if (this.waitForReady) {
      try {
        console.log(
          '[MessageStream] Waiting for workspace pull to complete...'
        );
        await this.waitForReady;
        console.log(
          '[MessageStream] Workspace pull completed, starting message processing'
        );
      } catch (error) {
        console.error(
          '[MessageStream] Workspace pull failed, continuing anyway:',
          error
        );
        // Continue even if pull fails - agent can still work with empty/partial directory
      }
    }

    while (!this.isDone) {
      // If queue has messages, yield them
      if (this.queue.length > 0) {
        const contents = this.queue.shift()!;
        yield this.createUserMessage(contents);
      } else {
        // Wait for new message to be added
        await new Promise<void>((resolve) => {
          this.resolvers.push(resolve);
        });
      }
    }
  }

  // Create SDKUserMessage from MessageContent[]
  private createUserMessage(contents: MessageContent[]): SDKUserMessage {
    const apiContent = contents.map((c) => {
      if (c.type === 'text') {
        return { type: 'text' as const, text: c.text };
      } else {
        return {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: c.source.media_type,
            data: c.source.data,
          },
        };
      }
    });

    return {
      type: 'user',
      session_id: '', // SDK will set this
      message: {
        role: 'user',
        content: apiContent,
      },
      parent_tool_use_id: null,
    } as SDKUserMessage;
  }

  // Complete the stream (session end)
  complete(): void {
    this.isDone = true;
    // Resolve all waiting promises
    this.resolvers.forEach((resolve) => resolve());
    this.resolvers = [];
  }
}

// Build prompt from MessageContent[] for Claude Agent SDK
// Returns AsyncIterable<SDKUserMessage> for query function
// If messageStream is provided, uses it for persistent streaming
function buildPrompt(
  contents: MessageContent[],
  messageStream?: MessageStream
): AsyncIterable<SDKUserMessage> {
  // If messageStream is provided, use it for persistent streaming
  if (messageStream) {
    return messageStream.stream();
  }

  // Fallback: single message mode (backward compatibility)
  // Convert MessageContent[] to API content format
  const apiContent = contents.map((c) => {
    if (c.type === 'text') {
      return { type: 'text' as const, text: c.text };
    } else {
      return {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: c.source.media_type,
          data: c.source.data,
        },
      };
    }
  });

  // Create async generator that yields SDKUserMessage
  async function* stream(): AsyncGenerator<SDKUserMessage> {
    yield {
      type: 'user',
      session_id: '', // SDK will set this
      message: {
        role: 'user',
        content: apiContent,
      },
      parent_tool_use_id: null,
    } as SDKUserMessage;
  }

  return stream();
}

// Process agent request using Claude Agent SDK
// Returns SDKMessage directly without transformation
export async function* processAgentRequest(
  message: MessageContent[],
  model: string,
  options: ProcessAgentRequestOptions,
  sessionId?: string,
  user?: RequestUser,
  workspacePath?: string,
  messageStream?: MessageStream,
  userPersonalAccessToken?: string
): AsyncGenerator<SDKMessage> {
  const {
    workspaceAutoPush = false,
    claudeConfigAutoPush = true,
    agentLocalPath,
    waitForReady,
    appAutoDeploy = false,
    sessionStub,
  } = options;
  // Local Claude config directory from User object, fallback to default
  const localClaudeConfigPath =
    user?.local.claudeConfigDir ??
    path.join(agentEnv.USERS_BASE_PATH, 'me', '.claude');
  fs.mkdirSync(localClaudeConfigPath, { recursive: true });

  // Local working directory: use agentLocalPath if provided (created by caller), otherwise fallback
  // workDir should be created by the caller (app.ts) before calling this function
  const localWorkPath =
    agentLocalPath ??
    path.join(agentEnv.SESSIONS_BASE_PATH, sessionId ?? 'temp');

  const spAccessToken = await getOidcAccessToken();

  // Create Databricks MCP server with injected configuration
  // This allows per-request values (like user token) to be passed at creation time
  const databricksMcpServer = createDatabricksMcpServer({
    databricksHost: databricks.host,
    databricksToken: user?.accessToken ?? '',
    warehouseIds,
    workingDir: localWorkPath,
  });

  const additionalSystemPrompt = `
Claude Code is running on Databricks Apps.

If the words Catalog, Schema, or Table appear, treat them as elements of the Unity Catalog.

# Editing Rules

## Allowed directories

You are allowed to read and modify files ONLY under:

- ${localWorkPath}/**

## Forbidden actions

- Do NOT read or modify any files outside the allowed directories
- Do NOT use relative paths (../) to escape the allowed directories
- If a task requires changes outside these directories, ask the user first

Violating these rules is considered a critical error.
`;

  // Create query with Claude Agent SDK
  // Use buildPrompt to convert MessageContent[] to AsyncIterable<SDKUserMessage>
  // If messageStream is provided, use it for persistent streaming
  // Otherwise create new MessageStream with waitForReady (e.g., workspace pull completion)
  const stream = messageStream ?? new MessageStream(message, waitForReady);

  const response = query({
    prompt: buildPrompt(message, stream),
    options: {
      abortController: stream.abortController,
      resume: sessionId,
      cwd: localWorkPath,
      settingSources: ['user', 'project', 'local'],
      model,
      env: {
        ...agentEnv,
        CLAUDE_CONFIG_DIR: localClaudeConfigPath,
        CLAUDE_CONFIG_AUTO_PUSH: claudeConfigAutoPush ? 'true' : '',
        // Use PAT if available, otherwise fall back to Service Principal token
        ANTHROPIC_AUTH_TOKEN: userPersonalAccessToken ?? spAccessToken,
        // Pass user's PAT as DATABRICKS_TOKEN if available (for Databricks CLI commands)
        // When PAT is set, also set DATABRICKS_AUTH_TYPE to 'pat' for CLI authentication
        DATABRICKS_TOKEN: userPersonalAccessToken,
        DATABRICKS_CLIENT_ID: userPersonalAccessToken
          ? undefined
          : databricks.clientId,
        DATABRICKS_CLIENT_SECRET: userPersonalAccessToken
          ? undefined
          : databricks.clientSecret,
        DATABRICKS_AUTH_TYPE: userPersonalAccessToken ? 'pat' : 'oauth-m2m',
        // Used by hooks in settings.json
        WORKSPACE_DIR: workspacePath,
        WORKSPACE_CLAUDE_CONFIG_DIR:
          user?.remote.claudeConfigDir ?? '/Workspace/Users/me/.claude',
        WORKSPACE_AUTO_PUSH: workspaceAutoPush ? 'true' : '',
        // Databricks Apps
        SESSION_APP_NAME: `app-by-claude-${sessionStub}`,
        APP_AUTO_DEPLOY: appAutoDeploy ? 'true' : '',
        // Git author/committer info from user headers
        GIT_AUTHOR_NAME:
          user?.preferredUsername ?? user?.email ?? 'Claude Agent',
        GIT_AUTHOR_EMAIL: user?.email ?? 'agent@databricks.com',
        GIT_COMMITTER_NAME:
          user?.preferredUsername ?? user?.email ?? 'Claude Agent',
        GIT_COMMITTER_EMAIL: user?.email ?? 'agent@databricks.com',
        GIT_BRANCH: `claude/session-${sessionStub}`,
      },
      maxTurns: 100,
      tools: {
        type: 'preset',
        preset: 'claude_code',
      },
      allowedTools: [
        'Skill',
        'Bash',
        'Read',
        'Write',
        'Edit',
        'Glob',
        'Grep',
        'WebSearch',
        'WebFetch',
        'mcp__databricks__*',
      ],
      mcpServers: {
        databricks: databricksMcpServer,
      },
      permissionMode: 'bypassPermissions',
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: additionalSystemPrompt,
      },
      // Note: workspace sync is now handled by settings.json hooks
    },
  });

  // Yield SDK messages directly without transformation
  try {
    for await (const sdkMessage of response) {
      yield sdkMessage;
    }
  } finally {
    // Complete the stream when agent finishes
    stream.complete();
  }
}
