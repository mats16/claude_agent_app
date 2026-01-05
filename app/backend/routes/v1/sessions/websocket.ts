import type { FastifyPluginAsync } from 'fastify';
import path from 'path';
import type { MessageContent, IncomingWSMessage } from '@app/shared';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { startAgent, MessageStream } from '../../../services/agent.service.js';
import * as eventService from '../../../services/event.service.js';
import * as sessionService from '../../../services/session.service.js';
import * as userSettingsService from '../../../services/user-settings.service.js';
import { extractUserRequestContextFromHeaders } from '../../../utils/headers.js';
import { ensureUserLocalDirectories } from '../../../utils/userPaths.js';
import {
  sessionQueues,
  sessionMessageStreams,
  sessionWebSockets,
  userSessionListeners,
  createUserMessage,
  createControlRequest,
  createControlResponse,
  createResultMessage,
} from '../../../services/session-state.service.js';

const sessionWebSocketRoutes: FastifyPluginAsync = async (fastify) => {
  // WebSocket endpoint for session list updates
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    let context;
    try {
      context = extractUserRequestContextFromHeaders(req.headers);
    } catch (error: any) {
      socket.send(JSON.stringify({ error: error.message }));
      socket.close();
      return;
    }

    const userId = context.user.id;

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
        context = extractUserRequestContextFromHeaders(req.headers);
      } catch (error: any) {
        socket.send(JSON.stringify({ error: error.message }));
        socket.close();
        return;
      }

      const { user } = context;
      const userId = user.id;
      const userAccessToken = req.headers['x-forwarded-access-token'] as string;

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
            // Get model from WebSocket message (user can change model during session)
            const messageModel = message.model;

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
              await eventService.saveSessionMessage(userMsg);
            } else {
              // Start new agent session or resume existing one
              console.log(
                `[WebSocket] Starting agent for session: ${sessionId}`
              );

              // Fetch session to get databricksWorkspacePath, databricksWorkspaceAutoPush, agentLocalPath, and model for resume
              let session = await sessionService.getSession(fastify, sessionId, userId);
              if (!session) {
                throw new Error('Session not found. Cannot resume session.');
              }

              // Update session model in DB if different from saved model
              if (messageModel && messageModel !== session.model) {
                await sessionService.updateSessionSettings(
                  fastify,
                  sessionId,
                  userId,
                  { model: messageModel }
                );
                // Re-fetch session to get updated model
                const updatedSession = await sessionService.getSession(
                  fastify,
                  sessionId,
                  userId
                );
                if (updatedSession) {
                  session = updatedSession;
                }
              }

              // Get user settings for claudeConfigAutoPush
              const userSettings = await userSettingsService.getUserSettings(userId);
              const claudeConfigAutoPush = userSettings.claudeConfigAutoPush;

              // Ensure user's local directory structure exists
              ensureUserLocalDirectories(
                user,
                fastify.config.USER_BASE_DIR
              );

              // Create MessageStream for this session
              const stream = new MessageStream(userMessageContent);
              sessionMessageStreams.set(sessionId, stream);

              // Save user message to database
              const userMsg = createUserMessage(sessionId, userMessageContent);
              await eventService.saveSessionMessage(userMsg);

              // Process agent request and stream responses
              // Pass session object - agent extracts all needed properties
              try {
                for await (const sdkMessage of startAgent(fastify, {
                  session, // Pass Session object - claudeCodeSessionId is defined, so resume mode
                  user,
                  userAccessToken,
                  messageContent: userMessageContent,
                  claudeConfigAutoPush,
                  messageStream: stream,
                  // userPersonalAccessToken is automatically fetched in startAgent
                })) {
                  // Save message to database (always execute regardless of WebSocket state)
                  await eventService.saveSessionMessage(sdkMessage);

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
            await eventService.saveSessionMessage(controlRequestMsg);

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
            await eventService.saveSessionMessage(interruptMsg);
            try {
              socket.send(JSON.stringify(interruptMsg));
            } catch (sendError) {
              console.error('Failed to send interrupt message:', sendError);
            }

            // 4. Create, save, and send the result message to mark session as complete
            const resultMsg = createResultMessage(sessionId, 'interrupted');
            await eventService.saveSessionMessage(resultMsg);
            try {
              socket.send(JSON.stringify(resultMsg));
            } catch (sendError) {
              console.error('Failed to send result message:', sendError);
            }

            // 5. Abort the stream to stop the agent
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

        // Remove this socket from the active connections set
        // Note: Do NOT abort the MessageStream here - disconnection just means
        // this client stopped watching. The agent should continue running for:
        // 1. Other clients viewing the same session (multiple tabs)
        // 2. React Strict Mode reconnections in development
        // Agent should only be aborted via explicit interrupt request (stop button).
        const sockets = sessionWebSockets.get(sessionId);
        if (sockets) {
          sockets.delete(socket);
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
