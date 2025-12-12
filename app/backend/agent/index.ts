import Anthropic from '@anthropic-ai/sdk';
import { getTools, executeTool } from './tools.js';

// Helper to ensure URL has protocol
function ensureHttpsProtocol(host: string): string {
  if (!host.startsWith('http://') && !host.startsWith('https://')) {
    return `https://${host}`;
  }
  return host;
}

const anthropicBaseURL = process.env.DATABRICKS_HOST
  ? `${ensureHttpsProtocol(process.env.DATABRICKS_HOST)}/serving-endpoints/anthropic`
  : undefined;

// Token cache for service principal
let cachedToken: { token: string; expiresAt: number } | null = null;

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

// Helper function to create Anthropic client with appropriate token
async function createAnthropicClient(): Promise<Anthropic> {
  let token: string;

  // Use service principal token for Databricks, otherwise use local dev token
  if (process.env.DATABRICKS_HOST) {
    token = await getServicePrincipalToken();
  } else {
    token = process.env.ANTHROPIC_API_KEY || '';
  }

  return new Anthropic({
    apiKey: token,
    baseURL: anthropicBaseURL,
    // Databricks uses Bearer token authentication instead of x-api-key
    defaultHeaders: anthropicBaseURL
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  });
}

export interface AgentMessage {
  type: 'response' | 'tool_use' | 'tool_result' | 'error' | 'complete';
  content?: any;
  toolName?: string;
  toolInput?: any;
  toolResult?: string;
  error?: string;
}

// Process agent request with streaming
export async function* processAgentRequest(
  message: string,
  workspacePath: string
): AsyncGenerator<AgentMessage> {
  // Create client with service principal token
  const client = await createAnthropicClient();
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: message },
  ];

  const tools = getTools(workspacePath);
  let iterationCount = 0;
  const maxIterations = 20; // Prevent infinite loops

  try {
    while (iterationCount < maxIterations) {
      iterationCount++;

      // Call Claude API (via Databricks or direct)
      const response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL ?? 'databricks-claude-sonnet-4-5',
        max_tokens: 4096,
        tools,
        messages,
      });

      // Process response content
      for (const block of response.content) {
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

          // Execute the tool
          const toolResult = await executeTool(
            block.name,
            block.input,
            workspacePath
          );

          yield {
            type: 'tool_result',
            toolName: block.name,
            toolResult,
          };

          // Add tool result to message history
          messages.push({
            role: 'assistant',
            content: response.content,
          });

          messages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: block.id,
                content: toolResult,
              },
            ],
          });
        }
      }

      // Check if conversation is complete
      if (response.stop_reason === 'end_turn') {
        yield {
          type: 'complete',
        };
        break;
      } else if (response.stop_reason !== 'tool_use') {
        yield {
          type: 'complete',
        };
        break;
      }
    }

    if (iterationCount >= maxIterations) {
      yield {
        type: 'error',
        error: 'Maximum iteration limit reached',
      };
    }
  } catch (error: any) {
    yield {
      type: 'error',
      error: error.message || 'Unknown error occurred',
    };
  }
}
