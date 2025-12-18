import { useState, useEffect, useCallback, useRef } from 'react';
import type { ImageContent, MessageContent } from '@app/shared';
import type {
  SDKMessage,
  SDKAssistantMessage,
  ChatMessage,
  UseAgentOptions,
} from '../types/sdk';
import {
  formatToolInput,
  extractUserContent,
  convertSDKMessagesToChat,
} from '../utils/messageParser';
import {
  RECONNECT_MAX_ATTEMPTS,
  calculateReconnectDelay,
  createAgentWebSocketUrl,
} from '../utils/websocket';

// Re-export types for backwards compatibility
export type { ChatMessage, UseAgentOptions } from '../types/sdk';

export function useAgent(options: UseAgentOptions = {}) {
  const { sessionId, initialMessage, model } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [sessionNotFound, setSessionNotFound] = useState(false);
  const [selectedModel, setSelectedModel] = useState(
    model || 'databricks-claude-sonnet-4-5'
  );
  const wsRef = useRef<WebSocket | null>(null);
  const currentResponseRef = useRef<string>('');
  const currentMessageIdRef = useRef<string>('');
  // Track pending tool uses for matching with tool results
  const pendingToolUsesRef = useRef<
    Array<{ id: string; name: string; position: number }>
  >([]);
  const initialMessageAddedRef = useRef(false);
  const connectionInitiatedRef = useRef(false);
  const initialMessageRef = useRef(initialMessage);
  const loadedSessionIdRef = useRef<string | null>(null);
  const prevSessionIdRef = useRef<string | undefined>(undefined);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const isUnmountingRef = useRef(false);

  // Reset state when sessionId changes
  useEffect(() => {
    if (prevSessionIdRef.current !== sessionId) {
      console.log(
        `Session changed: ${prevSessionIdRef.current} -> ${sessionId}`
      );

      // Close existing WebSocket forcefully
      if (wsRef.current) {
        try {
          // Remove all event listeners to prevent them from firing
          wsRef.current.onopen = null;
          wsRef.current.onmessage = null;
          wsRef.current.onerror = null;
          wsRef.current.onclose = null;

          // Close the connection
          if (wsRef.current.readyState !== WebSocket.CLOSED) {
            wsRef.current.close();
          }
        } catch (error) {
          console.error('Error closing WebSocket:', error);
        } finally {
          wsRef.current = null;
        }
      }

      // Clear reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Reset all refs
      connectionInitiatedRef.current = false;
      initialMessageAddedRef.current = false;
      currentResponseRef.current = '';
      currentMessageIdRef.current = '';
      reconnectAttemptsRef.current = 0;

      // Reset state
      setMessages([]);
      setIsConnected(false);
      setIsProcessing(false);
      setIsReconnecting(false);
      setSessionNotFound(false);

      // Update initialMessageRef with new value
      initialMessageRef.current = initialMessage;

      prevSessionIdRef.current = sessionId;
    }
  }, [sessionId, initialMessage]);

  // Load history from REST API when sessionId is provided (not for new sessions with initialMessage)
  useEffect(() => {
    const hasInitialMessage =
      typeof initialMessage === 'string' && initialMessage.length > 0;
    const alreadyLoaded = loadedSessionIdRef.current === sessionId;

    // Skip if no sessionId, has initialMessage, or already loaded for this session
    if (!sessionId || hasInitialMessage || alreadyLoaded) {
      return;
    }

    const loadHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const response = await fetch(`/api/v1/sessions/${sessionId}/events`);
        if (response.ok) {
          const data = await response.json();
          if (data.events && data.events.length > 0) {
            const loadedMessages = convertSDKMessagesToChat(data.events);
            setMessages(loadedMessages);
          }
          loadedSessionIdRef.current = sessionId;
        } else if (response.status === 404) {
          setSessionNotFound(true);
        }
      } catch (error) {
        console.error('Failed to load history:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [sessionId, initialMessage]);

  useEffect(() => {
    // Don't connect if no sessionId
    if (!sessionId) return;

    // Prevent double connection in StrictMode
    if (connectionInitiatedRef.current) return;
    connectionInitiatedRef.current = true;
    isUnmountingRef.current = false;

    const connect = () => {
      const wsUrl = createAgentWebSocketUrl(sessionId);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`WebSocket connected (session: ${sessionId})`);
        setIsConnected(true);
        setIsReconnecting(false);
        reconnectAttemptsRef.current = 0;
        ws.send(JSON.stringify({ type: 'connect' }));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data) as SDKMessage & {
          error?: string;
          session_id?: string;
        };

        // Handle control message: connected
        if (message.type === 'connected') {
          console.log('Connection established');

          // For new sessions with initial message, wait for the actual user message from queue
          // Don't create a local message here - the server will send the complete message with images
          if (initialMessageRef.current && !initialMessageAddedRef.current) {
            setIsProcessing(true);
            currentResponseRef.current = '';
            currentMessageIdRef.current = `agent-${Date.now()}`;
          }
          // For existing sessions - history is loaded via REST API
          return;
        }

        // Handle SDK system message (init)
        if (
          message.type === 'system' &&
          'subtype' in message &&
          message.subtype === 'init'
        ) {
          console.log('Session initialized:', message.session_id);
          if (!initialMessageAddedRef.current) {
            setIsProcessing(true);
            currentResponseRef.current = '';
            currentMessageIdRef.current = `agent-${Date.now()}`;
          }
          return;
        }

        // Handle SDK assistant message
        if (message.type === 'assistant' && 'message' in message) {
          const assistantMsg = message as SDKAssistantMessage;

          // Process content blocks
          for (const block of assistantMsg.message.content) {
            if (block.type === 'text' && block.text) {
              currentResponseRef.current += block.text;
            } else if (block.type === 'tool_use' && block.name) {
              const toolInput = block.input ? formatToolInput(block.input) : '';
              const toolId = block.id || `tool-${Date.now()}`;
              // Add tool use with ID marker for later result insertion
              const marker = `[Tool: ${block.name} id=${toolId}] ${toolInput}`;
              currentResponseRef.current += `\n\n${marker}\n`;
              // Track pending tool use
              pendingToolUsesRef.current.push({
                id: toolId,
                name: block.name,
                position: currentResponseRef.current.length,
              });
            }
          }

          // Update the message in real-time
          setMessages((prev) => {
            const existingIndex = prev.findIndex(
              (m) => m.id === currentMessageIdRef.current
            );

            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = {
                ...updated[existingIndex],
                content: currentResponseRef.current.trim(),
              };
              return updated;
            } else {
              const newMessage: ChatMessage = {
                id: currentMessageIdRef.current,
                role: 'agent',
                content: currentResponseRef.current.trim(),
                timestamp: new Date(),
              };
              return [...prev, newMessage];
            }
          });
          return;
        }

        // Handle user message (both regular and with tool results)
        if (message.type === 'user' && 'message' in message) {
          const userMsg = message as SDKUserMessage;
          const content = userMsg.message.content;

          // Check if this is a skill description message (auto-generated by Skill tool)
          let isSkillDescription = false;
          if (typeof content !== 'string' && Array.isArray(content)) {
            isSkillDescription = content.some(
              (block) =>
                block.type === 'text' &&
                block.text &&
                block.text.includes('Base directory for this skill:')
            );
          }

          // Skip skill description messages
          if (isSkillDescription) {
            return;
          }

          // Check if this is a tool result message
          let hasToolResult = false;
          if (typeof content !== 'string' && Array.isArray(content)) {
            hasToolResult = content.some(
              (block) => block.type === 'tool_result'
            );
          }

          // Handle tool results
          if (
            hasToolResult &&
            typeof content !== 'string' &&
            Array.isArray(content)
          ) {
            // Process each tool result and insert after corresponding tool use
            for (const block of content) {
              if (block.type === 'tool_result' && block.tool_use_id) {
                let resultText = '';
                if (typeof block.content === 'string') {
                  resultText = block.content;
                } else if (Array.isArray(block.content)) {
                  resultText = block.content
                    .filter(
                      (b: { type: string; text?: string }) =>
                        b.type === 'text' && b.text
                    )
                    .map((b: { text?: string }) => b.text)
                    .join('');
                }

                if (resultText) {
                  // Find the tool name from pending tool uses
                  const pendingTool = pendingToolUsesRef.current.find(
                    (t) => t.id === block.tool_use_id
                  );
                  const toolName = pendingTool?.name;

                  // Skip displaying WebSearch results (keep them hidden)
                  if (toolName !== 'WebSearch') {
                    // Truncate long results
                    const truncated =
                      resultText.length > 500
                        ? resultText.slice(0, 500) + '\n... (truncated)'
                        : resultText;
                    const resultBlock = `[ToolResult]\n${truncated}\n[/ToolResult]`;

                    // Find the tool use marker with this ID and insert result after it
                    const toolIdPattern = new RegExp(
                      `(\\[Tool: \\w+ id=${block.tool_use_id}\\][^\\n]*\\n)`,
                      'g'
                    );
                    const match = toolIdPattern.exec(
                      currentResponseRef.current
                    );
                    if (match) {
                      const insertPos = match.index + match[0].length;
                      currentResponseRef.current =
                        currentResponseRef.current.slice(0, insertPos) +
                        resultBlock +
                        '\n' +
                        currentResponseRef.current.slice(insertPos);
                    } else {
                      // Fallback: append at the end if marker not found
                      currentResponseRef.current += '\n' + resultBlock;
                    }
                  }

                  // Remove from pending (always cleanup, even for WebSearch)
                  pendingToolUsesRef.current =
                    pendingToolUsesRef.current.filter(
                      (t) => t.id !== block.tool_use_id
                    );
                }
              }
            }

            // Update the message in real-time
            setMessages((prev) => {
              const existingIndex = prev.findIndex(
                (m) => m.id === currentMessageIdRef.current
              );

              if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = {
                  ...updated[existingIndex],
                  content: currentResponseRef.current.trim(),
                };
                return updated;
              }
              return prev;
            });
          } else {
            // Handle regular user message (not tool result)
            const { text: textContent, images } = extractUserContent(content);

            // For new sessions, this is the first user message from the queue
            if (initialMessageRef.current && !initialMessageAddedRef.current) {
              initialMessageAddedRef.current = true;
            }

            // Add user message to display
            if (textContent || images.length > 0) {
              const newUserMsg: ChatMessage = {
                id: userMsg.uuid || `user-${Date.now()}`,
                role: 'user',
                content: textContent,
                images: images.length > 0 ? images : undefined,
                timestamp: new Date(),
              };

              setMessages((prev) => {
                // Avoid duplicates - check if message with same ID already exists
                if (prev.some((m) => m.id === newUserMsg.id)) {
                  return prev;
                }
                return [...prev, newUserMsg];
              });
            }
          }
          return;
        }

        // Handle error message
        if (message.type === 'error' && message.error) {
          currentResponseRef.current += `\n\nError: ${message.error}`;
          setMessages((prev) => {
            const existingIndex = prev.findIndex(
              (m) => m.id === currentMessageIdRef.current
            );
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = {
                ...updated[existingIndex],
                content: currentResponseRef.current.trim(),
              };
              return updated;
            } else {
              return [
                ...prev,
                {
                  id: currentMessageIdRef.current,
                  role: 'agent',
                  content: currentResponseRef.current.trim(),
                  timestamp: new Date(),
                },
              ];
            }
          });
          setIsProcessing(false);
          return;
        }

        // Handle SDK result message
        if (message.type === 'result') {
          setIsProcessing(false);
          currentResponseRef.current = '';
          currentMessageIdRef.current = '';
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);

        // Attempt reconnection if not unmounting
        if (!isUnmountingRef.current) {
          const attempts = reconnectAttemptsRef.current;
          if (attempts < RECONNECT_MAX_ATTEMPTS) {
            const delay = calculateReconnectDelay(attempts);
            console.log(
              `Reconnecting in ${delay}ms (attempt ${attempts + 1}/${RECONNECT_MAX_ATTEMPTS})`
            );
            setIsReconnecting(true);

            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptsRef.current++;
              connect();
            }, delay);
          } else {
            console.log('Max reconnection attempts reached');
            setIsReconnecting(false);
          }
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    };

    connect();

    return () => {
      isUnmountingRef.current = true;
      connectionInitiatedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const sendMessage = useCallback(
    (content: string, images?: ImageContent[]) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.error('WebSocket is not connected');
        return;
      }

      // Verify the WebSocket URL matches the current sessionId to prevent cross-session messages
      const currentWsUrl = wsRef.current.url;
      if (sessionId && !currentWsUrl.includes(`/sessions/${sessionId}/ws`)) {
        console.error(
          `WebSocket URL mismatch: expected session ${sessionId}, but connected to ${currentWsUrl}`
        );
        return;
      }

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content,
        images,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsProcessing(true);

      currentResponseRef.current = '';
      currentMessageIdRef.current = `agent-${Date.now()}`;

      // Build MessageContent array (always array format)
      const messageContent: MessageContent[] = [];

      // Add images first (Claude API recommends images before text)
      if (images && images.length > 0) {
        messageContent.push(...images);
      }

      // Add text content
      if (content) {
        messageContent.push({ type: 'text', text: content });
      }

      wsRef.current.send(
        JSON.stringify({
          type: 'user_message',
          content: messageContent,
          model: selectedModel,
        })
      );
    },
    [selectedModel, sessionId]
  );

  return {
    messages,
    isConnected,
    isProcessing,
    isLoadingHistory,
    isReconnecting,
    sessionNotFound,
    sendMessage,
    selectedModel,
    setSelectedModel,
    setMessages,
  };
}
