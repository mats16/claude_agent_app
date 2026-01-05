import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { FastifyInstance } from 'fastify';
import path from 'path';
import { createDatabricksMcpServer } from './mcp/databricks.js';
import type { User } from '../models/User.js';
import type { SessionBase } from '../models/Session.js';
import type { MessageStream } from '../services/agent.service.js';
import {
  getLocalClaudeConfigDir,
  getRemoteClaudeConfigDir,
} from '../utils/userPaths.js';

// Re-export from service for backward compatibility
export {
  MessageStream,
  processAgentRequest,
} from '../services/agent.service.js';
export type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

// Options for processAgentRequest (minimal, user-level options only)
export interface ProcessAgentRequestOptions {
  claudeConfigAutoPush?: boolean; // claude config pull/push
  waitForReady?: Promise<void>; // Promise to wait for before processing first message (e.g., workspace pull)
}

// Build SDK query options for Claude Agent SDK
export function buildSDKQueryOptions(
  fastify: FastifyInstance,
  params: {
    session: SessionBase;
    user: User;
    userAccessToken: string; // OBO access token (from req.ctx.user.accessToken)
    messageStream: MessageStream;
    userPersonalAccessToken?: string;
    spAccessToken?: string;
    claudeConfigAutoPush: boolean;
  }
): Options {
  const { session, user, userAccessToken, messageStream, userPersonalAccessToken, spAccessToken, claudeConfigAutoPush } = params;
  const { config } = fastify;

  // Build warehouseIds from config
  const warehouseIds = {
    '2xs': config.WAREHOUSE_ID_2XS,
    xs: config.WAREHOUSE_ID_XS,
    s: config.WAREHOUSE_ID_S,
  };

  // Create Databricks MCP server with injected configuration
  const databricksMcpServer = createDatabricksMcpServer({
    databricksHost: config.DATABRICKS_HOST,
    databricksToken: userAccessToken ?? '',
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

  // Compute user paths
  const localClaudeConfigDir = getLocalClaudeConfigDir(user, config.USER_BASE_DIR);
  const remoteClaudeConfigDir = getRemoteClaudeConfigDir(user);

  // Build agentEnv inline from config
  const agentEnv = {
    HOME: config.HOME,
    PATH: `${config.PATH}:${config.HOME}/.bin`,
    SESSIONS_BASE_PATH: config.SESSION_BASE_DIR,
    USERS_BASE_PATH: config.USER_BASE_DIR,
    DATABRICKS_APP_NAME: config.DATABRICKS_APP_NAME,
    DATABRICKS_HOST: `https://${config.DATABRICKS_HOST}`,
    ANTHROPIC_BASE_URL: config.ANTHROPIC_BASE_URL,
    ANTHROPIC_DEFAULT_OPUS_MODEL: config.ANTHROPIC_DEFAULT_OPUS_MODEL,
    ANTHROPIC_DEFAULT_SONNET_MODEL: config.ANTHROPIC_DEFAULT_SONNET_MODEL,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: config.ANTHROPIC_DEFAULT_HAIKU_MODEL,
  };

  return {
    abortController: messageStream.abortController,
    resume: session.claudeCodeSessionId, // undefined for new session (Draft), string for resume
    cwd: session.cwd,
    settingSources: ['user', 'project', 'local'],
    model: session.model,
    env: {
      ...agentEnv,
      CLAUDE_CONFIG_DIR: localClaudeConfigDir,
      CLAUDE_CONFIG_AUTO_PUSH: claudeConfigAutoPush ? 'true' : undefined,
      CLAUDE_CODE_SESSION_ID: session.claudeCodeSessionId,
      CLAUDE_CODE_REMOTE_SESSION_ID: session.id,
      // Use PAT if available, otherwise fall back to Service Principal token
      ANTHROPIC_AUTH_TOKEN: userPersonalAccessToken ?? spAccessToken,
      // Pass user's PAT as DATABRICKS_TOKEN if available (for Databricks CLI commands)
      DATABRICKS_TOKEN: userPersonalAccessToken,
      DATABRICKS_CLIENT_ID: userPersonalAccessToken
        ? undefined
        : config.DATABRICKS_CLIENT_ID,
      DATABRICKS_CLIENT_SECRET: userPersonalAccessToken
        ? undefined
        : config.DATABRICKS_CLIENT_SECRET,
      DATABRICKS_AUTH_TYPE: userPersonalAccessToken ? 'pat' : 'oauth-m2m',
      // Used by hooks in settings.json
      WORKSPACE_DIR: session.databricksWorkspacePath ?? undefined,
      WORKSPACE_CLAUDE_CONFIG_DIR: remoteClaudeConfigDir,
      WORKSPACE_AUTO_PUSH: session.databricksWorkspaceAutoPush ? 'true' : undefined,
      // Git branch uses TypeID
      GIT_BRANCH: session.branchName,
      // Git author/committer info from user headers
      GIT_AUTHOR_NAME: user.name,
      GIT_AUTHOR_EMAIL: user.email,
      GIT_COMMITTER_NAME: user.name,
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

