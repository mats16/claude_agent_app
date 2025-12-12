import { query } from '@anthropic-ai/claude-agent-sdk';

// Token cache for service principal
let cachedToken: { token: string; expiresAt: number } | null = null;

// Helper to ensure URL has protocol
function ensureHttpsProtocol(host: string): string {
  if (!host.startsWith('http://') && !host.startsWith('https://')) {
    return `https://${host}`;
  }
  return host;
}

// Get service principal access token from Databricks OAuth2
async function getServicePrincipalToken(): Promise<string> {
  // Check if cached token is still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = process.env.DATABRICKS_CLIENT_ID;
  const clientSecret = process.env.DATABRICKS_CLIENT_SECRET;
  const databricksHost = process.env.DATABRICKS_HOST;

  if (!clientId || !clientSecret || !databricksHost) {
    throw new Error(
      'DATABRICKS_CLIENT_ID, DATABRICKS_CLIENT_SECRET, and DATABRICKS_HOST must be set'
    );
  }

  // Request token from Databricks OAuth2 endpoint
  const tokenUrl = `${ensureHttpsProtocol(databricksHost)}/oidc/v1/token`;
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

export interface AgentMessage {
  type: 'response' | 'tool_use' | 'tool_result' | 'error' | 'complete';
  content?: any;
  toolName?: string;
  toolInput?: any;
  toolResult?: string;
  error?: string;
}

// Process agent request with streaming using Claude Agent SDK
export async function* processAgentRequest(
  message: string,
  workspacePath: string,
  model?: string
): AsyncGenerator<AgentMessage> {
  try {
    // Prepare environment variables for Claude Agent SDK
    const env: Record<string, string> = {
      ...process.env,
    } as Record<string, string>;

    // Set up authentication for Databricks or direct Anthropic
    let defaultModel: string;
    if (process.env.DATABRICKS_HOST) {
      const databricksHost = ensureHttpsProtocol(process.env.DATABRICKS_HOST);

      // Set ANTHROPIC_BASE_URL for Databricks serving endpoint
      env.ANTHROPIC_BASE_URL = `${databricksHost}/serving-endpoints/anthropic`;

      // Use existing DATABRICKS_TOKEN if available, otherwise get service principal token
      let authToken = process.env.DATABRICKS_TOKEN;
      if (!authToken) {
        authToken = await getServicePrincipalToken();
      }
      env.ANTHROPIC_AUTH_TOKEN = authToken;
      defaultModel = 'databricks-claude-sonnet-4-5';
    } else if (process.env.ANTHROPIC_API_KEY) {
      // For direct Anthropic API, use ANTHROPIC_API_KEY (SDK will pick it up automatically)
      env.ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_API_KEY;
      defaultModel = 'claude-sonnet-4-20250514';
    } else {
      throw new Error(
        'Either DATABRICKS_HOST with credentials or ANTHROPIC_API_KEY must be set'
      );
    }

    // Determine which model to use
    const selectedModel = model || env.ANTHROPIC_MODEL || defaultModel;

    // Create query with Claude Agent SDK
    const agentQuery = query({
      prompt: message,
      options: {
        cwd: workspacePath,
        model: selectedModel,
        env,
        tools: {
          type: 'preset',
          preset: 'claude_code',
        },
        maxTurns: 20,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        persistSession: false, // Don't persist sessions for web app
        includePartialMessages: true, // Enable streaming
      },
    });

    // Process streaming messages
    for await (const sdkMessage of agentQuery) {
      if (sdkMessage.type === 'assistant') {
        // Assistant message with content blocks
        const apiMessage = sdkMessage.message;

        for (const block of apiMessage.content) {
          if (block.type === 'text') {
            yield {
              type: 'response',
              content: block.text,
            };
          } else if (block.type === 'tool_use') {
            yield {
              type: 'tool_use',
              toolName: block.name,
              toolInput: block.input,
            };
          }
        }
      } else if (sdkMessage.type === 'stream_event') {
        // Streaming events for real-time updates
        const event = sdkMessage.event;

        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield {
              type: 'response',
              content: event.delta.text,
            };
          }
        }
      } else if (sdkMessage.type === 'result') {
        // Final result
        if (sdkMessage.subtype === 'success') {
          yield {
            type: 'complete',
          };
        } else {
          // Error result
          const errors = 'errors' in sdkMessage ? sdkMessage.errors : [];
          yield {
            type: 'error',
            error: errors.join(', ') || 'Unknown error occurred',
          };
        }
        break;
      }
    }
  } catch (error: any) {
    yield {
      type: 'error',
      error: error.message || 'Unknown error occurred',
    };
  }
}
