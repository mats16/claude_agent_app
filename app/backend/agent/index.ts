import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
//import { databricksMcpServer } from './mcp/databricks.js';
import fs from 'fs';
import path from 'path';
import { workspacePull, workspacePush } from './hooks.js';
import type { MessageContent } from '@app/shared';

export type { SDKMessage };

export const databricksHost =
  `https://${process.env.DATABRICKS_HOST}` as string;
const personalAccessToken = process.env.DATABRICKS_TOKEN;
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

// Get access token with fallback to DATABRICKS_TOKEN for local development
export async function getAccessToken(): Promise<string> {
  const spToken = await getOidcAccessToken();
  const token = spToken ?? personalAccessToken;
  if (!token) {
    throw new Error(
      'No access token available. Set DATABRICKS_CLIENT_ID/DATABRICKS_CLIENT_SECRET or DATABRICKS_TOKEN.'
    );
  }
  return token;
}

// Options for processAgentRequest
export interface ProcessAgentRequestOptions {
  overwrite?: boolean; // workspace pullで--overwrite付与
  autoWorkspacePush?: boolean; // workspace pushを実行
  claudeConfigSync?: boolean; // claude config pull/push
}

// Build prompt from MessageContent[] for Claude Agent SDK
// Returns AsyncIterable<SDKUserMessage> for query function
function buildPrompt(
  contents: MessageContent[]
): AsyncIterable<SDKUserMessage> {
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
  options: ProcessAgentRequestOptions = {}
): AsyncGenerator<SDKMessage> {
  const {
    overwrite = false,
    autoWorkspacePush = false,
    claudeConfigSync = true,
  } = options;
  // Determine base directory based on environment
  // Local development: ./tmp, Production: /home/app
  const localBasePath = path.join(process.env.HOME ?? '/tmp', 'c');

  // Workspace home directory
  const workspaceHomePath = path.join('/Workspace/Users', userEmail ?? 'me');
  const workspaceClaudeConfigPath = path.join(workspaceHomePath, '.claude');

  // Local Claude config directory
  const localClaudeConfigPath = path.join(
    localBasePath,
    workspaceClaudeConfigPath
  );
  fs.mkdirSync(localClaudeConfigPath, { recursive: true });

  // Local working directory based on workspacePath
  const localWorkPath = path.join(localBasePath, workspacePath);
  fs.mkdirSync(localWorkPath, { recursive: true });

  const spAccessToken = await getOidcAccessToken();

  const additionalSystemPrompt = `
Claude Code is running on Databricks Apps.

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
  const response = query({
    prompt: buildPrompt(message),
    options: {
      resume: sessionId,
      cwd: localWorkPath,
      settingSources: ['user', 'project', 'local'],
      model,
      env: {
        ...process.env,
        WORKDIR: localWorkPath,
        CLAUDE_CONFIG_DIR: localClaudeConfigPath,
        ANTHROPIC_BASE_URL: `${databricksHost}/serving-endpoints/anthropic`,
        ANTHROPIC_AUTH_TOKEN: spAccessToken ?? personalAccessToken,
        DATABRICKS_HOST: databricksHost,
        DATABRICKS_TOKEN: spAccessToken ?? personalAccessToken,
      },
      maxTurns: 100,
      tools: {
        type: 'preset',
        preset: 'claude_code',
      },
      allowedTools: [
        //'Skill',
        'Bash',
        'Read',
        'Write',
        'Edit',
        'Glob',
        'Grep',
        'WebSearch',
        'WebFetch',
        //'list_workspace_objects',
        //'get_workspace_object',
        //'update_workspace_object',
      ],
      //mcpServers: {
      //  databricks: databricksMcpServer,
      //},
      permissionMode: 'bypassPermissions',
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: additionalSystemPrompt,
      },
      hooks: {
        // Use UserPromptSubmit instead of SessionStart (SessionStart doesn't fire in SDK mode)
        // Only run pull for new sessions (sessionId is undefined)
        UserPromptSubmit: [
          // Pull claudeConfig (workspace -> local) - only if claudeConfigSync is enabled
          {
            hooks: [
              async (_input, _toolUseID, _options) => {
                if (!sessionId && claudeConfigSync) {
                  try {
                    await workspacePull(
                      workspaceClaudeConfigPath,
                      localClaudeConfigPath,
                      overwrite
                    );
                  } catch (err) {
                    console.error(
                      '[Hook:UserPromptSubmit] workspacePull claudeConfig error (continuing anyway):',
                      err
                    );
                  }
                }
                return { async: true };
              },
            ],
          },
          // Pull workDir (workspace -> local) - always run for new sessions with overwrite flag
          {
            hooks: [
              async (_input, _toolUseID, _options) => {
                if (!sessionId) {
                  try {
                    await workspacePull(
                      workspacePath,
                      localWorkPath,
                      overwrite
                    );
                  } catch (err) {
                    console.error(
                      '[Hook:UserPromptSubmit] workspacePull workDir error (continuing anyway):',
                      err
                    );
                  }
                }
                return { async: true };
              },
            ],
          },
        ],
        Stop: [
          // Push claudeConfig (local -> workspace) - only if claudeConfigSync is enabled
          {
            hooks: [
              async (_input, _toolUseID, _options) => {
                if (claudeConfigSync) {
                  workspacePush(
                    localClaudeConfigPath,
                    workspaceClaudeConfigPath
                  ).catch((err) =>
                    console.error(
                      '[Hook:Stop] workspacePush claudeConfig error',
                      err
                    )
                  );
                }
                return { async: true };
              },
            ],
          },
          // Push workDir (local -> workspace) - only if autoWorkspacePush is enabled
          {
            hooks: [
              async (_input, _toolUseID, _options) => {
                if (autoWorkspacePush) {
                  workspacePush(localWorkPath, workspacePath).catch((err) =>
                    console.error(
                      '[Hook:Stop] workspacePush workDir error',
                      err
                    )
                  );
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
  for await (const sdkMessage of response) {
    yield sdkMessage;
  }
}
