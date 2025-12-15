import { useState, useEffect, useCallback, useRef } from 'react';
import type { OutgoingWSMessage } from '@app/shared';

// Type alias for incoming server messages
type ServerMessage = OutgoingWSMessage;

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

export function useAgent(options: UseAgentOptions = {}) {
  const { sessionId, initialMessage, model } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedModel, setSelectedModel] = useState(
    model || 'databricks-claude-sonnet-4-5'
  );
  const wsRef = useRef<WebSocket | null>(null);
  const currentResponseRef = useRef<string>('');
  const currentMessageIdRef = useRef<string>('');
  const initialMessageAddedRef = useRef(false);
  const connectionInitiatedRef = useRef(false);
  const initialMessageRef = useRef(initialMessage);

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
      const message: ServerMessage = JSON.parse(event.data);

      if (message.type === 'connected') {
        console.log('Connection established');

        // Add initial message to UI (sent via POST, not WebSocket)
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
        return;
      }

      if (message.type === 'init') {
        console.log('Session initialized:', message.sessionId);
        // Start processing state if not already set
        if (!initialMessageAddedRef.current) {
          setIsProcessing(true);
          currentResponseRef.current = '';
          currentMessageIdRef.current = `agent-${Date.now()}`;
        }
        return;
      }

      if (message.type === 'assistant_message' && message.content) {
        // Accumulate response text
        currentResponseRef.current += message.content;

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
      } else if (message.type === 'tool_use') {
        // Show tool usage
        currentResponseRef.current += `\n\n[Using tool: ${message.toolName}]\n`;
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
      } else if (message.type === 'error') {
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
      } else if (message.type === 'result') {
        // Mark processing as complete
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
    sendMessage,
    selectedModel,
    setSelectedModel,
    setMessages,
  };
}
