import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { createDatabricksMcpServer } from './mcp/databricks.js';
import fs from 'fs';
import path from 'path';
import { enqueuePush } from '../services/workspaceQueueService.js';
import type { MessageContent } from '@app/shared';

export type { SDKMessage };

export const databricksHost =
  `https://${process.env.DATABRICKS_HOST}` as string;
const clientId = process.env.DATABRICKS_CLIENT_ID;
const clientSecret = process.env.DATABRICKS_CLIENT_SECRET;

// Token cache for service principal
let cachedToken: { token: string; expiresAt: number } | null = null;

// Get service principal access token from Databricks OAuth2
export async function getOidcAccessToken(): Promise<string | undefined> {
  // Check if cached token is still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  if (!clientId || !clientSecret) {
    return undefined;
  }

  // Request token from Databricks OAuth2 endpoint
  const tokenUrl = `${databricksHost}/oidc/v1/token`;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
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
  autoWorkspacePush?: boolean; // workspace pushを実行
  claudeConfigSync?: boolean; // claude config pull/push
  cwd?: string; // working directory path (created before agent starts)
  waitForReady?: Promise<void>; // Promise to wait for before processing first message (e.g., workspace pull)
}

// MessageStream: Manages message queue for streaming input
// Allows external code to add messages to the agent session dynamically
export class MessageStream {
  private queue: MessageContent[][] = [];
  private resolvers: Array<() => void> = [];
  private isDone = false;
  private waitForReady?: Promise<void>;

  constructor(initialMessage: MessageContent[], waitForReady?: Promise<void>) {
    this.queue.push(initialMessage);
    this.waitForReady = waitForReady;
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
  model: string = 'databricks-claude-sonnet-4-5',
  sessionId?: string,
  userEmail?: string,
  workspacePath: string = '/Workspace/Users/me',
  options: ProcessAgentRequestOptions = {},
  messageStream?: MessageStream,
  userAccessToken?: string,
  userId?: string
): AsyncGenerator<SDKMessage> {
  const {
    autoWorkspacePush = false,
    claudeConfigSync = true,
    cwd,
    waitForReady,
  } = options;
  // Determine base directory based on environment
  // Local development: $HOME/u, Production: /home/app/u
  const localBasePath = path.join(process.env.HOME ?? '/tmp', 'u');

  // Workspace home directory
  const workspaceHomePath = path.join('/Workspace/Users', userEmail ?? 'me');
  const workspaceClaudeConfigPath = path.join(workspaceHomePath, '.claude');

  // Local Claude config directory: $HOME/u/{email}/.claude
  const localClaudeConfigPath = path.join(
    localBasePath,
    userEmail ?? 'me',
    '.claude'
  );
  fs.mkdirSync(localClaudeConfigPath, { recursive: true });

  // Local working directory: use cwd if provided (created by caller), otherwise fallback
  // workDir should be created by the caller (app.ts) before calling this function
  const localWorkPath =
    cwd ??
    path.join(localBasePath, userEmail ?? 'me', 'w', sessionId ?? 'temp');

  const spAccessToken = await getOidcAccessToken();

  // Create Databricks MCP server with injected configuration
  // This allows per-request values (like user token) to be passed at creation time
  const databricksMcpServer = createDatabricksMcpServer({
    databricksHost: databricksHost.replace(/^https?:\/\//, ''),
    databricksToken: userAccessToken ?? '',
    warehouseIds: {
      '2xs': process.env.WAREHOUSE_ID_2XS,
      xs: process.env.WAREHOUSE_ID_XS,
      s: process.env.WAREHOUSE_ID_S,
    },
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
      resume: sessionId,
      cwd: localWorkPath,
      settingSources: ['user', 'project', 'local'],
      model,
      env: {
        PATH: `${process.env.PATH}:${process.env.HOME}/.bin`,
        HOME: process.env.HOME,
        WORKDIR: localWorkPath,
        CLAUDE_CONFIG_DIR: localClaudeConfigPath,
        ANTHROPIC_BASE_URL: `${databricksHost}/serving-endpoints/anthropic`,
        ANTHROPIC_AUTH_TOKEN: spAccessToken,
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'databricks-claude-opus-4-5',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'databricks-claude-sonnet-4-5',
        // DATABRICKS_HOST is still needed for databricks CLI commands in Bash tool
        DATABRICKS_HOST: databricksHost,
        DATABRICKS_TOKEN: userAccessToken,
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
        'run_sql',
        'get_warehouse_info',
        'list_warehouses',
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
      hooks: {
        // Note: workspace pull is now handled in app.ts before starting the agent
        Stop: [
          // Push claudeConfig (local -> workspace) - only if claudeConfigSync is enabled
          // Uses --full flag for complete sync to ensure skills are properly synced
          {
            hooks: [
              async (_input, _toolUseID, _options) => {
                if (claudeConfigSync && spAccessToken && userId) {
                  enqueuePush({
                    userId,
                    localPath: localClaudeConfigPath,
                    workspacePath: workspaceClaudeConfigPath,
                    token: spAccessToken,
                    full: true, // full sync for .claude directory
                  });
                }
                return { async: true };
              },
            ],
          },
          // Push workDir (local -> workspace) - only if autoWorkspacePush is enabled and workspacePath is specified
          {
            hooks: [
              async (_input, _toolUseID, _options) => {
                if (
                  autoWorkspacePush &&
                  workspacePath &&
                  workspacePath.trim() &&
                  spAccessToken &&
                  userId
                ) {
                  enqueuePush({
                    userId,
                    localPath: localWorkPath,
                    workspacePath,
                    token: spAccessToken,
                  });
                }
                return { async: true };
              },
            ],
          },
        ],
      },
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
