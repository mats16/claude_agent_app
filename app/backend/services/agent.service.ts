import type {
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { MessageContent } from '@app/shared';
import { databricks } from '../config/index.js';
import type { RequestUser } from '../models/RequestUser.js';
import type { SessionBase } from '../models/Session.js';
import { processAgentRequest } from '../agent/index.js';
import { getUserPersonalAccessToken } from './user.service.js';

export type { SDKMessage };

// Token cache for service principal
let cachedToken: { token: string; expiresAt: number } | null = null;

// Get service principal access token from Databricks OAuth2
export async function getOidcAccessToken(): Promise<string | undefined> {
  // Check if cached token is still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  if (!databricks.clientId || !databricks.clientSecret) {
    return undefined;
  }

  // Request token from Databricks OAuth2 endpoint
  const tokenUrl = `https://${databricks.host}/oidc/v1/token`;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: databricks.clientId,
      client_secret: databricks.clientSecret,
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

// MessageStream: Manages message queue for streaming input
// Allows external code to add messages to the agent session dynamically
export class MessageStream {
  private queue: MessageContent[][] = [];
  private resolvers: Array<() => void> = [];
  private isDone = false;
  private waitForReady?: Promise<void>;
  private _abortController: AbortController;

  constructor(initialMessage: MessageContent[], waitForReady?: Promise<void>) {
    this.queue.push(initialMessage);
    this.waitForReady = waitForReady;
    this._abortController = new AbortController();
  }

  // Get the AbortController for SDK query
  get abortController(): AbortController {
    return this._abortController;
  }

  // Abort the stream (stops processing immediately via AbortController)
  abort(): void {
    this._abortController.abort();
    this.complete();
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

// Parameters for starting an agent session
export interface StartAgentParams {
  session: SessionBase; // SessionDraft or Session
  user: RequestUser;
  userId: string;
  messageContent: MessageContent[];
  claudeConfigAutoPush?: boolean;
  messageStream?: MessageStream; // Optional, will be created if not provided
  userPersonalAccessToken?: string; // Optional, will be fetched if not provided
  waitForReady?: Promise<void>;
}

// Start agent session (unified function for new and continuing sessions)
// Automatically handles PAT retrieval and MessageStream creation
export async function* startAgent(
  params: StartAgentParams
): AsyncGenerator<SDKMessage> {
  const {
    session,
    user,
    userId,
    messageContent,
    claudeConfigAutoPush = true,
    messageStream,
    userPersonalAccessToken,
    waitForReady,
  } = params;

  // Create MessageStream if not provided
  const stream =
    messageStream ?? new MessageStream(messageContent, waitForReady);

  // Get user PAT if not provided
  const pat =
    userPersonalAccessToken ?? (await getUserPersonalAccessToken(userId));

  // Delegate to agent/index.ts processAgentRequest
  // This keeps SDK-specific logic in agent/index.ts
  yield* processAgentRequest(
    session,
    messageContent,
    user,
    { claudeConfigAutoPush, waitForReady },
    stream,
    pat
  );
}
