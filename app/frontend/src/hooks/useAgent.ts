import { useState, useEffect, useCallback, useRef } from 'react';

export interface AgentMessage {
  type: 'init' | 'response' | 'tool_use' | 'tool_result' | 'error' | 'complete';
  content?: string;
  toolName?: string;
  toolInput?: any;
  toolResult?: string;
  error?: string;
  status?: string;
  workspacePath?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

export function useAgent() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedModel, setSelectedModel] = useState('databricks-claude-sonnet-4-5');
  const wsRef = useRef<WebSocket | null>(null);
  const currentResponseRef = useRef<string>('');
  const currentMessageIdRef = useRef<string>('');

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/agent`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      // Send init message
      ws.send(JSON.stringify({ type: 'init' }));
    };

    ws.onmessage = (event) => {
      const message: AgentMessage = JSON.parse(event.data);

      // Handle init message
      if (message.type === 'init') {
        return;
      }

      if (message.type === 'response' && message.content) {
        // Accumulate response text
        currentResponseRef.current += message.content;

        // Update the message in real-time
        setMessages((prev) => {
          const existingIndex = prev.findIndex(
            (m) => m.id === currentMessageIdRef.current
          );

          if (existingIndex >= 0) {
            // Update existing message
            const updated = [...prev];
            updated[existingIndex] = {
              ...updated[existingIndex],
              content: currentResponseRef.current.trim(),
            };
            return updated;
          } else {
            // Create new message
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
      } else if (message.type === 'tool_result') {
        // Show tool result (optionally, can be hidden for cleaner UI)
        // currentResponseRef.current += `\n[Tool result: ${message.toolResult?.substring(0, 100)}...]\n`;
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
      } else if (message.type === 'complete') {
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
      ws.close();
    };
  }, []);

  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected');
      return;
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsProcessing(true);

    // Initialize response tracking
    currentResponseRef.current = '';
    currentMessageIdRef.current = `agent-${Date.now()}`;

    // Send message to backend
    wsRef.current.send(
      JSON.stringify({
        type: 'message',
        content,
        model: selectedModel,
      })
    );
  }, [selectedModel]);

  return {
    messages,
    isConnected,
    isProcessing,
    sendMessage,
    selectedModel,
    setSelectedModel,
  };
}
