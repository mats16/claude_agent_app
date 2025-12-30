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
import type { SessionBase } from '../models/Session.js';
import {
  MessageStream,
  getOidcAccessToken,
} from '../services/agent.service.js';

// Re-export from service for backward compatibility
export {
  MessageStream,
  getOidcAccessToken,
  getAccessToken,
} from '../services/agent.service.js';
export type { SDKMessage };

// Options for processAgentRequest (minimal, user-level options only)
export interface ProcessAgentRequestOptions {
  claudeConfigAutoPush?: boolean; // claude config pull/push
  waitForReady?: Promise<void>; // Promise to wait for before processing first message (e.g., workspace pull)
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
  session: SessionBase,
  message: MessageContent[],
  user: RequestUser,
  options?: ProcessAgentRequestOptions,
  messageStream?: MessageStream,
  userPersonalAccessToken?: string
): AsyncGenerator<SDKMessage> {
  // Extract options (with defaults)
  const claudeConfigAutoPush = options?.claudeConfigAutoPush ?? true;
  const waitForReady = options?.waitForReady;
  // Local Claude config directory from User object, fallback to default
  const localClaudeConfigPath =
    user.local.claudeConfigDir ??
    path.join(agentEnv.USERS_BASE_PATH, 'me', '.claude');
  fs.mkdirSync(localClaudeConfigPath, { recursive: true });

  const spAccessToken = await getOidcAccessToken();

  // Create Databricks MCP server with injected configuration
  // This allows per-request values (like user token) to be passed at creation time
  const databricksMcpServer = createDatabricksMcpServer({
    databricksHost: databricks.host,
    databricksToken: user.accessToken ?? '',
    warehouseIds,
    workingDir: session.cwd,
  });

  const additionalSystemPrompt = `
Claude Code is running on Databricks Apps.

If the words Catalog, Schema, or Table appear, treat them as elements of the Unity Catalog.

# Editing Rules

## Allowed directories

You are allowed to read and modify files ONLY under:

- ${session.cwd}/**

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
      resume: session.claudeCodeSessionId, // undefined for new session (Draft), string for resume
      cwd: session.cwd,
      settingSources: ['user', 'project', 'local'],
      model: session.model,
      env: {
        ...agentEnv,
        CLAUDE_CONFIG_DIR: user.local.claudeConfigDir,
        CLAUDE_CONFIG_AUTO_PUSH: claudeConfigAutoPush ? 'true' : undefined,
        CLAUDE_CODE_SESSION_ID: session.claudeCodeSessionId,
        CLAUDE_CODE_REMOTE_SESSION_ID: session.id, // e.g. session_01h455vb4pex5vsknk084sn02q
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
        WORKSPACE_DIR: session.databricksWorkspacePath ?? undefined,
        WORKSPACE_CLAUDE_CONFIG_DIR:
          user.remote.claudeConfigDir ?? '/Workspace/Users/me/.claude',
        WORKSPACE_AUTO_PUSH: session.databricksWorkspaceAutoPush ? 'true' : undefined,
        // Git branch uses TypeID
        GIT_BRANCH: session.branchName,
        // Git author/committer info from user headers
        GIT_AUTHOR_NAME: user.preferredUsername,
        GIT_AUTHOR_EMAIL: user.email,
        GIT_COMMITTER_NAME: user.preferredUsername,
        GIT_COMMITTER_EMAIL: user.email,
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
