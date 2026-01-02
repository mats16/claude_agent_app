import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import fs from 'fs';
import path from 'path';
import type { MessageContent } from '@app/shared';
import { databricks, agentEnv } from '../config/index.js';
import type { RequestUser } from '../models/RequestUser.js';
import type { SessionBase } from '../models/Session.js';
import {
  buildSDKQueryOptions,
  type ProcessAgentRequestOptions,
} from '../agent/index.js';
import { getUserPersonalAccessToken } from './user.service.js';
import { getServicePrincipalAccessToken } from '../utils/auth.js';

export type { SDKMessage };

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
        console.warn(
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

/**
 * Process agent request using Claude Agent SDK
 *
 * @deprecated Use {@link startAgent} instead for better ergonomics.
 * This function is kept for backward compatibility and low-level control.
 *
 * @remarks
 * - Low-level API with positional arguments
 * - Requires explicit dependency injection
 * - Use {@link startAgent} for automatic PAT retrieval and cleaner API
 *
 * @example
 * ```typescript
 * // Deprecated: Low-level API
 * const pat = await getUserPersonalAccessToken(userId);
 * for await (const msg of processAgentRequest(session, content, user, options, stream, pat)) {
 *   // ...
 * }
 *
 * // Recommended: High-level API
 * for await (const msg of startAgent({ session, user, userId, messageContent, ... })) {
 *   // ...
 * }
 * ```
 */
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

  const spAccessToken = await getServicePrincipalAccessToken();

  // Create or use provided MessageStream
  const stream = messageStream ?? new MessageStream(message, waitForReady);

  // Build SDK query options using agent/index.ts helper
  const sdkOptions = buildSDKQueryOptions({
    session,
    user,
    messageStream: stream,
    userPersonalAccessToken,
    spAccessToken,
    claudeConfigAutoPush,
  });

  // Create query with Claude Agent SDK
  const response = query({
    prompt: buildPrompt(message, stream),
    options: sdkOptions,
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

// Parameters for starting an agent session
export interface StartAgentParams {
  session: SessionBase; // SessionDraft or Session
  user: RequestUser;
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
    messageContent,
    claudeConfigAutoPush = true,
    messageStream,
    userPersonalAccessToken,
    waitForReady,
  } = params;

  // Extract userId from user (user.sub is the unique identifier)
  const userId = user.sub;

  // Local Claude config directory from User object, fallback to default
  const localClaudeConfigPath =
    user.local.claudeConfigDir ??
    path.join(agentEnv.USERS_BASE_PATH, 'me', '.claude');
  fs.mkdirSync(localClaudeConfigPath, { recursive: true });

  // Get user PAT if not provided
  const pat =
    userPersonalAccessToken ?? (await getUserPersonalAccessToken(userId));

  // Get service principal token
  const spAccessToken = await getServicePrincipalAccessToken();

  // Create MessageStream if not provided
  const stream =
    messageStream ?? new MessageStream(messageContent, waitForReady);

  // Build SDK query options using agent/index.ts helper
  const sdkOptions = buildSDKQueryOptions({
    session,
    user,
    messageStream: stream,
    userPersonalAccessToken: pat,
    spAccessToken,
    claudeConfigAutoPush,
  });

  // Create query with Claude Agent SDK
  const response = query({
    prompt: buildPrompt(messageContent, stream),
    options: sdkOptions,
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
