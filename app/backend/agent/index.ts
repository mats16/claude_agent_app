import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentMessage } from '../types.js';
import { databricksMcpServer } from './mcp/databricks.js';

export type { AgentMessage };

const databricksHost = process.env.DATABRICKS_HOST ?? 'xx.cloud.databricks.com';
const databricksToken = process.env.DATABRICKS_TOKEN;
const clientId = process.env.DATABRICKS_CLIENT_ID;
const clientSecret = process.env.DATABRICKS_CLIENT_SECRET;

// Token cache for service principal
let cachedToken: { token: string; expiresAt: number } | null = null;

// Get service principal access token from Databricks OAuth2
async function getOidcAccessToken(
  host: string,
  clientId?: string,
  clientSecret?: string
): Promise<string | undefined> {
  // Check if cached token is still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  if (!clientId || !clientSecret || !host) {
    return undefined;
  }

  // Request token from Databricks OAuth2 endpoint
  const tokenUrl = `https://${host}/oidc/v1/token`;
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
export async function* processAgentRequest(
  message: string,
  workspacePath: string,
  model: string = 'databricks-claude-sonnet-4-5',
  sessionId?: string,
  userAccessToken?: string
): AsyncGenerator<AgentMessage> {
  const accessToken = await getOidcAccessToken(
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
        //cwd: sessionId ? `/tmp/${sessionId}` : '/tmp',
        model,
        env: {
          PATH: process.env.PATH,
          ANTHROPIC_BASE_URL: `https://${databricksHost}/serving-endpoints/anthropic`,
          ANTHROPIC_AUTH_TOKEN: accessToken ?? databricksToken,
          DATABRICKS_TOKEN: userAccessToken ?? databricksToken,
        },
        maxTurns: 100,
        tools: {
          type: 'preset',
          preset: 'claude_code',
        },
        allowedTools: [
          'Bash',
          'Read',
          'Write',
          'Edit',
          'Glob',
          'Grep',
          'WebSearch',
          'WebFetch',
          'list_workspace_objects',
          'get_workspace_object',
        ],
        mcpServers: {
          databricks: databricksMcpServer,
        },
        permissionMode: 'bypassPermissions',
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          //append: 'string'
        },
      },
    });

    // Process messages from agent
    for await (const message of response) {
      console.log('--------------------------------');
      console.log(message.session_id);
      console.log(message);

      // 最初のメッセージは、セッションIDを含むシステム初期化メッセージです
      if (message.type === 'system' && message.subtype === 'init') {
        sessionId = message.session_id;
        console.log(`セッションが開始されました。ID: ${sessionId}`);
        yield {
          type: 'session_init',
          sessionId: message.session_id,
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
    yield {
      type: 'error',
      error: error.message || 'Unknown error occurred',
    };
  }
}
