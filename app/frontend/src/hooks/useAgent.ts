import { useState, useEffect, useCallback, useRef } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
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

interface SDKUserMessage extends SDKMessageBase {
  type: 'user';
  message: {
    role: 'user';
    content: string | Array<{ type: string; text?: string }>;
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

// Extract text content from user message
function extractUserContent(
  content: string | Array<{ type: string; text?: string }>
): string {
  if (typeof content === 'string') return content;
  return content
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text)
    .join('');
}

// Convert SDKMessage[] to ChatMessage[]
function convertSDKMessagesToChat(sdkMessages: SDKMessage[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  let currentAgentContent = '';
  let currentAgentId = '';

  for (const msg of sdkMessages) {
    if (msg.type === 'user') {
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

      const userMsg = msg as SDKUserMessage;
      messages.push({
        id: msg.uuid || `user-${Date.now()}`,
        role: 'user',
        content: extractUserContent(userMsg.message.content),
        timestamp: new Date(),
      });
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
          currentAgentContent += `\n\n[Using tool: ${block.name}]\n`;
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

export function useAgent(options: UseAgentOptions = {}) {
  const { sessionId, initialMessage, model } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedModel, setSelectedModel] = useState(
    model || 'databricks-claude-sonnet-4-5'
  );
  const wsRef = useRef<WebSocket | null>(null);
  const currentResponseRef = useRef<string>('');
  const currentMessageIdRef = useRef<string>('');
  const initialMessageAddedRef = useRef(false);
  const connectionInitiatedRef = useRef(false);
  const initialMessageRef = useRef(initialMessage);
  const loadedSessionIdRef = useRef<string | null>(null);
  const prevSessionIdRef = useRef<string | undefined>(undefined);

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

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/v1/sessions/${sessionId}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(`WebSocket connected (session: ${sessionId})`);
      setIsConnected(true);
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

        // For new sessions with initial message
        if (initialMessageRef.current && !initialMessageAddedRef.current) {
          initialMessageAddedRef.current = true;

          const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: initialMessageRef.current,
            timestamp: new Date(),
          };
          setMessages([userMsg]);
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
            currentResponseRef.current += `\n\n[Using tool: ${block.name}]\n`;
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
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };

    return () => {
      connectionInitiatedRef.current = false;
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.error('WebSocket is not connected');
        return;
      }

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsProcessing(true);

      currentResponseRef.current = '';
      currentMessageIdRef.current = `agent-${Date.now()}`;

      wsRef.current.send(
        JSON.stringify({
          type: 'user_message',
          content,
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
    sendMessage,
    selectedModel,
    setSelectedModel,
    setMessages,
  };
}
