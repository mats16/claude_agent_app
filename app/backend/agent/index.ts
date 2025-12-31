import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { createDatabricksMcpServer } from './mcp/databricks.js';
import { databricks, warehouseIds, agentEnv } from '../config/index.js';
import type { RequestUser } from '../models/RequestUser.js';
import type { SessionBase } from '../models/Session.js';
import type { MessageStream } from '../services/agent.service.js';

// Re-export from service for backward compatibility
export {
  MessageStream,
  getOidcAccessToken,
  getAccessToken,
  processAgentRequest,
} from '../services/agent.service.js';
export type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

// Options for processAgentRequest (minimal, user-level options only)
export interface ProcessAgentRequestOptions {
  model?: string; // model to use (defaults to 'sonnet')
  claudeConfigAutoPush?: boolean; // claude config pull/push
  waitForReady?: Promise<void>; // Promise to wait for before processing first message (e.g., workspace pull)
}

// Build SDK query options for Claude Agent SDK
export function buildSDKQueryOptions(params: {
  session: SessionBase;
  user: RequestUser;
  model: string;
  messageStream: MessageStream;
  userPersonalAccessToken?: string;
  spAccessToken?: string;
  claudeConfigAutoPush: boolean;
}): Options {
  const { session, user, model, messageStream, userPersonalAccessToken, spAccessToken, claudeConfigAutoPush } = params;

  // Create Databricks MCP server with injected configuration
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

  return {
    abortController: messageStream.abortController,
    resume: session.claudeCodeSessionId, // undefined for new session (Draft), string for resume
    cwd: session.cwd,
    settingSources: ['user', 'project', 'local'],
    model,
    env: {
      ...agentEnv,
      CLAUDE_CONFIG_DIR: user.local.claudeConfigDir,
      CLAUDE_CONFIG_AUTO_PUSH: claudeConfigAutoPush ? 'true' : undefined,
      CLAUDE_CODE_SESSION_ID: session.claudeCodeSessionId,
      CLAUDE_CODE_REMOTE_SESSION_ID: session.id,
      // Use PAT if available, otherwise fall back to Service Principal token
      ANTHROPIC_AUTH_TOKEN: userPersonalAccessToken ?? spAccessToken,
      // Pass user's PAT as DATABRICKS_TOKEN if available (for Databricks CLI commands)
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
      type: 'preset' as const,
      preset: 'claude_code' as const,
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
    permissionMode: 'bypassPermissions' as const,
    systemPrompt: {
      type: 'preset' as const,
      preset: 'claude_code' as const,
      append: additionalSystemPrompt,
    },
  };
}

