import { useState, useEffect, useCallback, useRef } from 'react';
import type { ImageContent, MessageContent } from '@app/shared';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  images?: ImageContent[]; // For user messages with images
  timestamp: Date;
}

interface UseAgentOptions {
  sessionId?: string;
  initialMessage?: string;
  model?: string;
}

// SDKMessage type definitions (subset of @anthropic-ai/claude-agent-sdk)
interface SDKMessageBase {
  type: string;
  session_id: string;
  uuid?: string;
}

interface SDKContentBlock {
  type: string;
  text?: string;
  tool_use_id?: string;
  content?: string | Array<{ type: string; text?: string }>;
  // Image content
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

interface SDKUserMessage extends SDKMessageBase {
  type: 'user';
  message: {
    role: 'user';
    content: string | SDKContentBlock[];
  };
}

interface SDKAssistantMessage extends SDKMessageBase {
  type: 'assistant';
  message: {
    role: 'assistant';
    content: Array<{
      type: string;
      text?: string;
      name?: string;
      id?: string;
      input?: unknown;
    }>;
  };
}

interface SDKResultMessage extends SDKMessageBase {
  type: 'result';
  subtype: string;
  is_error: boolean;
  result: string;
}

interface SDKSystemMessage extends SDKMessageBase {
  type: 'system';
  subtype: string;
}

type SDKMessage =
  | SDKUserMessage
  | SDKAssistantMessage
  | SDKResultMessage
  | SDKSystemMessage
  | SDKMessageBase;

// Extract text and images from user message
function extractUserContent(content: string | SDKContentBlock[]): {
  text: string;
  images: ImageContent[];
} {
  if (typeof content === 'string') {
    return { text: content, images: [] };
  }

  const images: ImageContent[] = [];
  const textParts: string[] = [];

  for (const block of content) {
    if (block.type === 'text' && block.text) {
      textParts.push(block.text);
    } else if (block.type === 'image' && block.source) {
      images.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: block.source.media_type as
            | 'image/webp'
            | 'image/jpeg'
            | 'image/png'
            | 'image/gif',
          data: block.source.data,
        },
      });
    }
  }

  return { text: textParts.join(''), images };
}

// Convert SDKMessage[] to ChatMessage[]
function convertSDKMessagesToChat(sdkMessages: SDKMessage[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  let currentAgentContent = '';
  let currentAgentId = '';

  // Helper function to insert tool result after corresponding tool use
  const insertToolResult = (
    content: string,
    toolUseId: string,
    resultText: string
  ): string => {
    const truncated =
      resultText.length > 500
        ? resultText.slice(0, 500) + '\n... (truncated)'
        : resultText;
    const resultBlock = `[ToolResult]\n${truncated}\n[/ToolResult]`;

    // Find the tool use marker with this ID and insert result after it
    const toolIdPattern = new RegExp(
      `(\\[Tool: \\w+ id=${toolUseId}\\][^\\n]*\\n)`,
      'g'
    );
    const match = toolIdPattern.exec(content);
    if (match) {
      const insertPos = match.index + match[0].length;
      return (
        content.slice(0, insertPos) +
        resultBlock +
        '\n' +
        content.slice(insertPos)
      );
    }
    // Fallback: append at the end
    return content + '\n' + resultBlock;
  };

  for (const msg of sdkMessages) {
    if (msg.type === 'user') {
      const userMsg = msg as SDKUserMessage;
      const content = userMsg.message.content;

      // Check if this is a tool result message
      if (typeof content !== 'string' && Array.isArray(content)) {
        let hasToolResult = false;
        for (const block of content) {
          if (
            block.type === 'tool_result' &&
            block.tool_use_id &&
            block.content
          ) {
            hasToolResult = true;
            let resultText = '';
            if (typeof block.content === 'string') {
              resultText = block.content;
            } else if (Array.isArray(block.content)) {
              resultText = block.content
                .filter((b) => b.type === 'text' && b.text)
                .map((b) => b.text)
                .join('');
            }
            if (resultText) {
              currentAgentContent = insertToolResult(
                currentAgentContent,
                block.tool_use_id,
                resultText
              );
            }
          }
        }
        if (hasToolResult) continue;
      }

      // Flush any pending agent message
      if (currentAgentContent && currentAgentId) {
        messages.push({
          id: currentAgentId,
          role: 'agent',
          content: currentAgentContent.trim(),
          timestamp: new Date(),
        });
        currentAgentContent = '';
        currentAgentId = '';
      }

      // Regular user message
      const { text: textContent, images } = extractUserContent(
        userMsg.message.content
      );
      if (textContent || images.length > 0) {
        messages.push({
          id: msg.uuid || `user-${Date.now()}`,
          role: 'user',
          content: textContent,
          images: images.length > 0 ? images : undefined,
          timestamp: new Date(),
        });
      }
    } else if (msg.type === 'assistant') {
      const assistantMsg = msg as SDKAssistantMessage;
      if (!currentAgentId) {
        currentAgentId = msg.uuid || `agent-${Date.now()}`;
      }

      // Process content blocks
      for (const block of assistantMsg.message.content) {
        if (block.type === 'text' && block.text) {
          currentAgentContent += block.text;
        } else if (block.type === 'tool_use' && block.name) {
          const toolInput = block.input ? JSON.stringify(block.input) : '';
          const toolId = block.id || `tool-${Date.now()}`;
          currentAgentContent += `\n\n[Tool: ${block.name} id=${toolId}] ${toolInput}\n`;
        }
      }
    } else if (msg.type === 'result') {
      // Flush agent message on result
      if (currentAgentContent && currentAgentId) {
        messages.push({
          id: currentAgentId,
          role: 'agent',
          content: currentAgentContent.trim(),
          timestamp: new Date(),
        });
        currentAgentContent = '';
        currentAgentId = '';
      }
    }
    // Skip system messages (init, etc.)
  }

  // Flush any remaining agent message
  if (currentAgentContent && currentAgentId) {
    messages.push({
      id: currentAgentId,
      role: 'agent',
      content: currentAgentContent.trim(),
      timestamp: new Date(),
    });
  }

  return messages;
}

// Reconnection configuration
const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 1000; // 1 second
const RECONNECT_MAX_DELAY = 30000; // 30 seconds

export function useAgent(options: UseAgentOptions = {}) {
  const { sessionId, initialMessage, model } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
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
      // Close existing WebSocket
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // Reset all refs
      connectionInitiatedRef.current = false;
      initialMessageAddedRef.current = false;
      currentResponseRef.current = '';
      currentMessageIdRef.current = '';

      // Reset state
      setMessages([]);
      setIsConnected(false);
      setIsProcessing(false);

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
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/v1/sessions/${sessionId}/ws`;

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
              const toolInput = block.input ? JSON.stringify(block.input) : '';
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

          // Check if this is a tool result message
          let hasToolResult = false;
          if (typeof content !== 'string' && Array.isArray(content)) {
            hasToolResult = content.some((block) => block.type === 'tool_result');
          }

          // Handle tool results
          if (hasToolResult && typeof content !== 'string' && Array.isArray(content)) {
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
                  const match = toolIdPattern.exec(currentResponseRef.current);
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

                  // Remove from pending
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
            const delay = Math.min(
              RECONNECT_BASE_DELAY * Math.pow(2, attempts),
              RECONNECT_MAX_DELAY
            );
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
    [selectedModel]
  );

  return {
    messages,
    isConnected,
    isProcessing,
    isLoadingHistory,
    isReconnecting,
    sendMessage,
    selectedModel,
    setSelectedModel,
    setMessages,
  };
}
