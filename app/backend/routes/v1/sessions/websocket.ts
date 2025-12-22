import type { FastifyPluginAsync } from 'fastify';
import type { MessageContent, IncomingWSMessage } from '@app/shared';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { processAgentRequest, MessageStream } from '../../../agent/index.js';
import { saveMessage } from '../../../db/events.js';
import { getSessionById } from '../../../db/sessions.js';
import { getSettingsDirect } from '../../../db/settings.js';
import { extractRequestContextFromHeaders } from '../../../utils/headers.js';
import {
  sessionQueues,
  sessionMessageStreams,
  sessionWebSockets,
  userSessionListeners,
  createUserMessage,
  createControlRequest,
  createControlResponse,
} from '../../../services/sessionState.js';

const sessionWebSocketRoutes: FastifyPluginAsync = async (fastify) => {
  // WebSocket endpoint for session list updates
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    let context;
    try {
      context = extractRequestContextFromHeaders(req.headers);
    } catch (error: any) {
      socket.send(JSON.stringify({ error: error.message }));
      socket.close();
      return;
    }

    const { userId } = context;

    console.log(
      `Client connected to session list WebSocket for user: ${userId}`
    );

    // Add to user's session listeners
    let listeners = userSessionListeners.get(userId);
    if (!listeners) {
      listeners = new Set();
      userSessionListeners.set(userId, listeners);
    }
    listeners.add(socket);

    socket.on('message', (messageBuffer: Buffer) => {
      try {
        const messageStr = messageBuffer.toString();
        const message = JSON.parse(messageStr);

        if (message.type === 'subscribe') {
          socket.send(JSON.stringify({ type: 'subscribed' }));
        }
      } catch (error) {
        console.error('Session list WebSocket message error:', error);
      }
    });

    socket.on('close', () => {
      console.log(
        `Client disconnected from session list WebSocket for user: ${userId}`
      );
      const listeners = userSessionListeners.get(userId);
      if (listeners) {
        listeners.delete(socket);
        if (listeners.size === 0) {
          userSessionListeners.delete(userId);
        }
      }
    });

    socket.on('error', (error: Error) => {
      console.error('Session list WebSocket error:', error);
    });
  });

  // WebSocket endpoint for existing session - receives queued events
  fastify.get<{ Params: { sessionId: string } }>(
    '/:sessionId/ws',
    { websocket: true },
    (socket, req) => {
      const sessionId = req.params.sessionId;
      console.log(`Client connected to WebSocket for session: ${sessionId}`);

      // Get user info from request headers
      let context;
      try {
        context = extractRequestContextFromHeaders(req.headers);
      } catch (error: any) {
        socket.send(JSON.stringify({ error: error.message }));
        socket.close();
        return;
      }

      const { userId, userEmail, accessToken } = context;

      // Add this socket to the set of active connections for this session
      let sockets = sessionWebSockets.get(sessionId);
      if (!sockets) {
        sockets = new Set();
        sessionWebSockets.set(sessionId, sockets);
      }
      sockets.add(socket);

      const queue = sessionQueues.get(sessionId);

      // Event listener for new events
      const onEvent = (event: SDKMessage) => {
        socket.send(JSON.stringify(event));
      };

      socket.on('message', async (messageBuffer: Buffer) => {
        try {
          const messageStr = messageBuffer.toString();
          const message = JSON.parse(messageStr) as IncomingWSMessage;

          if (message.type === 'connect') {
            socket.send(JSON.stringify({ type: 'connected' }));

            // Only send queued events if session is still being processed
            // Completed sessions should load history from REST API
            if (queue && !queue.completed) {
              const lastEventUuid = message.last_event_uuid;
              // If client provides last_event_uuid, only send events after that UUID
              // This prevents re-sending events on reconnection
              let startSending = !lastEventUuid;

              for (const event of queue.events) {
                if (!startSending) {
                  // Once we find the lastEventUuid, start sending from the next event
                  if (event.uuid === lastEventUuid) {
                    startSending = true;
                  }
                  continue;
                }
                socket.send(JSON.stringify(event));
              }
              queue.listeners.add(onEvent);
            }
            return;
          }

          if (message.type === 'user_message') {
            // message.content is now MessageContent[] from frontend
            const userMessageContent = message.content as MessageContent[];
            const model = message.model || 'databricks-claude-sonnet-4-5';

            // Check if session already has a MessageStream (agent is running)
            const existingStream = sessionMessageStreams.get(sessionId);

            if (existingStream) {
              // Session is already running - queue the message
              console.log(
                `[WebSocket] Queueing message for existing session: ${sessionId}`
              );

              // Add message to stream queue
              existingStream.addMessage(userMessageContent);

              // Save user message to database
              // Note: Don't send back to client - frontend already added it optimistically
              const userMsg = createUserMessage(sessionId, userMessageContent);
              await saveMessage(userMsg);
            } else {
              // Start new agent session or resume existing one
              console.log(
                `[WebSocket] Starting agent for session: ${sessionId}`
              );

              // Fetch session to get workspacePath, autoWorkspacePush, cwd, and model for resume
              const session = await getSessionById(sessionId, userId);
              const workspacePath = session?.workspacePath ?? undefined;
              const autoWorkspacePush = session?.autoWorkspacePush ?? false;
              const sessionCwd = session?.cwd;
              // Use session's saved model on resume (prioritize over WebSocket message)
              const sessionModel = session?.model ?? model;

              // Validate that cwd exists (required for resume)
              if (!sessionCwd) {
                throw new Error(
                  'Session working directory not found. Cannot resume session.'
                );
              }

              // Get user settings for claudeConfigSync
              const userSettings = await getSettingsDirect(userId);
              const claudeConfigSync = userSettings?.claudeConfigSync ?? true;

              // Create MessageStream for this session
              const stream = new MessageStream(userMessageContent);
              sessionMessageStreams.set(sessionId, stream);

              // Save user message to database
              const userMsg = createUserMessage(sessionId, userMessageContent);
              await saveMessage(userMsg);

              // Process agent request and stream responses (use URL sessionId for resume)
              try {
                for await (const sdkMessage of processAgentRequest(
                  userMessageContent,
                  sessionModel,
                  sessionId,
                  userEmail,
                  workspacePath,
                  { autoWorkspacePush, claudeConfigSync, cwd: sessionCwd },
                  stream,
                  accessToken
                )) {
                  // Save message to database (always execute regardless of WebSocket state)
                  await saveMessage(sdkMessage);

                  // Send to client (continue even if WebSocket is disconnected)
                  try {
                    socket.send(JSON.stringify(sdkMessage));
                  } catch (sendError) {
                    console.error(
                      'Failed to send WebSocket message:',
                      sendError
                    );
                  }
                }
              } finally {
                // Cleanup MessageStream when agent completes
                sessionMessageStreams.delete(sessionId);
              }
            }
          }

          if (
            message.type === 'control_request' &&
            message.request?.subtype === 'interrupt'
          ) {
            const clientRequestId = message.request_id;
            console.log(
              `[WebSocket] Interrupt request received for session: ${sessionId}, request_id: ${clientRequestId}`
            );

            // 1. Save control_request to database
            const { message: controlRequestMsg } = createControlRequest(
              sessionId,
              'interrupt'
            );
            await saveMessage(controlRequestMsg);

            // 2. Send control_response to client
            const controlResponse = createControlResponse(
              clientRequestId,
              'success'
            );
            try {
              socket.send(JSON.stringify(controlResponse));
            } catch (sendError) {
              console.error('Failed to send control response:', sendError);
            }

            // 3. Create, save, and send the interrupt user message for rendering
            const interruptContent: MessageContent[] = [
              { type: 'text', text: '[Request interrupted by user]' },
            ];
            const interruptMsg = createUserMessage(sessionId, interruptContent);
            await saveMessage(interruptMsg);
            try {
              socket.send(JSON.stringify(interruptMsg));
            } catch (sendError) {
              console.error('Failed to send interrupt message:', sendError);
            }

            // 4. Abort the stream to stop the agent
            const stream = sessionMessageStreams.get(sessionId);
            if (stream) {
              stream.abort();
              console.log(
                `[WebSocket] MessageStream aborted for session: ${sessionId}`
              );
            }
            return;
          }
        } catch (error: any) {
          console.error('WebSocket error:', error);
          try {
            socket.send(
              JSON.stringify({
                type: 'error',
                error: error.message || 'Unknown error occurred',
              })
            );
          } catch (sendError) {
            console.error('Failed to send error message:', sendError);
          }
        }
      });

      socket.on('close', () => {
        console.log(
          `Client disconnected from WebSocket for session: ${sessionId}`
        );
        // Remove listener
        if (queue) {
          queue.listeners.delete(onEvent);
        }

        // Cleanup MessageStream on disconnect (abort to stop processing)
        const stream = sessionMessageStreams.get(sessionId);
        if (stream) {
          stream.abort();
          sessionMessageStreams.delete(sessionId);
        }

        // Remove this socket from the active connections set
        const sockets = sessionWebSockets.get(sessionId);
        if (sockets) {
          sockets.delete(socket);
          // Clean up empty sets
          if (sockets.size === 0) {
            sessionWebSockets.delete(sessionId);
          }
        }
      });

      socket.on('error', (error: Error) => {
        console.error('WebSocket connection error:', error);
      });
    }
  );
};

export default sessionWebSocketRoutes;
