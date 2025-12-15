import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { databricksMcpServer } from './mcp/databricks.js';
import fs from 'fs';
import path from 'path';

export type { SDKMessage };

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

// Process agent request using Claude Agent SDK
// Returns SDKMessage directly without transformation
export async function* processAgentRequest(
  message: string,
  model: string = 'databricks-claude-sonnet-4-5',
  sessionId?: string,
  userAccessToken?: string,
  userEmail?: string,
  workspacePath?: string
): AsyncGenerator<SDKMessage> {
  // Determine base directory and home directory based on environment
  // Local development: ./tmp
  // Production (Databricks Apps): /home/app with user workspace structure
  const baseDir = userEmail ? '/home/app' : './tmp';
  const userHomeDir = userEmail
    ? `${baseDir}/Workspace/Users/${userEmail}`
    : baseDir;

  // Create working directory
  // Note: export-dir is handled in app.ts (fire and forget), so we just ensure the directory exists
  const workDir: string = workspacePath
    ? path.join(baseDir, workspacePath)
    : userHomeDir;
  fs.mkdirSync(workDir, { recursive: true });

  const spAccessToken = await getOidcAccessToken(
    databricksHost,
    clientId,
    clientSecret
  );

  const additionalSystemPrompt = `
Claude Code is running on Databricks Apps. Artifacts must be saved to Volumes.

# Editing Rules

## Allowed directories

You are allowed to read and modify files ONLY under:

- ${workDir}/**

## Forbidden actions

- Do NOT read or modify any files outside the allowed directories
- Do NOT use relative paths (../) to escape the allowed directories
- If a task requires changes outside these directories, ask the user first

Violating these rules is considered a critical error.
`;

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
        append: additionalSystemPrompt,
      },
    },
  });

  // Yield SDK messages directly without transformation
  for await (const sdkMessage of response) {
    yield sdkMessage;
  }
}
