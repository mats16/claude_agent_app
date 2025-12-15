import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentMessage } from '../types.js';
import { databricksMcpServer } from './mcp/databricks.js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
export type { AgentMessage };

const databricksHost = process.env.DATABRICKS_HOST as string;
const personalAccessToken = process.env.DATABRICKS_TOKEN;
const clientId = process.env.DATABRICKS_CLIENT_ID;
const clientSecret = process.env.DATABRICKS_CLIENT_SECRET;

// Token cache for service principal
let cachedToken: { token: string; expiresAt: number } | null = null;

// Get service principal access token from Databricks OAuth2
async function getOidcAccessToken(
  databricksHost: string,
  clientId?: string,
  clientSecret?: string
): Promise<string | undefined> {
  // Check if cached token is still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  if (!clientId || !clientSecret) {
    return undefined;
  }

  // Request token from Databricks OAuth2 endpoint
  const tokenUrl = `https://${databricksHost}/oidc/v1/token`;
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

// Clone workspace from Databricks to local directory
function cloneWorkspace(sourcePath: string, destPath: string): void {
  // Check if directory already exists (MVP: error if exists)
  if (fs.existsSync(destPath)) {
    throw new Error(`Directory already exists: ${destPath}`);
  }

  // Create parent directory
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  // Execute databricks workspace export-dir
  execSync(`databricks workspace export-dir "${sourcePath}" "${destPath}"`, {
    env: process.env,
    stdio: 'inherit',
  });
}

// Process agent request using Claude Agent SDK
export async function* processAgentRequest(
  message: string,
  model: string = 'databricks-claude-sonnet-4-5',
  sessionId?: string,
  userAccessToken?: string,
  userEmail?: string,
  workspacePath?: string
): AsyncGenerator<AgentMessage> {
  // Determine base directory based on environment
  // Local development: ./tmp, Production: /home/app/Workspace/Users/{email}
  const baseDir = userEmail ? '/home/app' : './tmp';
  const userHomeDir = `${baseDir}/Workspace/Users/${userEmail ?? 'local.user@example.com'}`;

  // Create working directory
  const workDir: string = workspacePath
    ? path.join(baseDir, workspacePath)
    : userHomeDir;
  fs.mkdirSync(workDir, { recursive: true });

  // Clone workspace from Databricks to local directory
  if (workspacePath) {
    cloneWorkspace(workspacePath, workDir);
  }

  const spAccessToken = await getOidcAccessToken(
    databricksHost,
    clientId,
    clientSecret
  );

  try {
    // Create query with Claude Agent SDK
    const response = query({
      prompt: message,
      options: {
        resume: sessionId,
        cwd: workDir,
        settingSources: ['user', 'project', 'local'],
        model,
        env: {
          PATH: process.env.PATH,
          HOME: userHomeDir,
          ANTHROPIC_BASE_URL: `https://${databricksHost}/serving-endpoints/anthropic`,
          ANTHROPIC_AUTH_TOKEN: spAccessToken ?? personalAccessToken,
          DATABRICKS_HOST: databricksHost,
          DATABRICKS_TOKEN: userAccessToken ?? personalAccessToken,
          DATABRICKS_SP_ACCESS_TOKEN: spAccessToken,
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
        mcpServers: {
          databricks: databricksMcpServer,
        },
        permissionMode: 'bypassPermissions',
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append:
            'Claude Code is running on Databricks Apps. Artifacts must be saved to Volumes.',
        },
      },
    });

    // Process messages from agent
    for await (const message of response) {
      if (message.type === 'system' && message.subtype === 'init') {
        sessionId = message.session_id;
        yield {
          type: 'init',
          sessionId: message.session_id,
          version: message.claude_code_version,
          model: message.model,
        };
      }

      if (message.type === 'assistant') {
        const content = message.message.content;
        if (typeof content === 'string') {
          yield {
            type: 'assistant_message',
            content,
          };
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') {
              yield {
                type: 'assistant_message',
                content: block.text,
              };
            } else if (block.type === 'tool_use') {
              yield {
                type: 'tool_use',
                toolName: block.name,
                toolId: block.id,
                toolInput: block.input,
              };
            }
          }
        }
      } else if (message.type === 'result') {
        yield {
          type: 'result',
          success: message.subtype === 'success',
        };
      }
    }
  } catch (error: any) {
    console.error(error);
    yield {
      type: 'error',
      error: error.message || 'Unknown error occurred',
    };
  }
}
