import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { createSessionsWebSocketUrl } from '../utils/websocket';

export interface Session {
  id: string; // TypeID: session_01h455vb...
  title: string | null;
  databricksWorkspacePath: string | null; // Databricks workspace path
  workspaceUrl?: string | null; // Fetched from GET /api/v1/sessions/:id
  lastUsedModel?: string | null; // Fetched from GET /api/v1/sessions/:id (from events)
  userEmail: string | null;
  databricksWorkspaceAutoPush: boolean; // Workspace sync mode
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SessionsContextType {
  sessions: Session[];
  isLoading: boolean;
  error: string | null;
  filter: 'active' | 'archived' | 'all';
  setFilter: (filter: 'active' | 'archived' | 'all') => void;
  refetch: () => Promise<void>;
  getSession: (sessionId: string) => Session | undefined;
  updateSessionLocally: (sessionId: string, updates: Partial<Session>) => void;
  archiveSession: (sessionId: string) => Promise<void>;
}

const SessionsContext = createContext<SessionsContextType | undefined>(
  undefined
);

interface SessionsProviderProps {
  children: ReactNode;
}

export function SessionsProvider({ children }: SessionsProviderProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'active' | 'archived' | 'all'>('active');

  const fetchSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      // Always fetch all sessions
      const response = await fetch('/api/v1/sessions?filter=all');
      if (!response.ok) {
        throw new Error('Failed to fetch sessions');
      }
      const data = await response.json();
      setSessions(data.sessions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Filter sessions on the client side
  const filteredSessions = useMemo(() => {
    if (filter === 'all') {
      return sessions;
    } else if (filter === 'active') {
      return sessions.filter((s) => !s.isArchived);
    } else {
      // archived
      return sessions.filter((s) => s.isArchived);
    }
  }, [sessions, filter]);

  // WebSocket connection for real-time session list updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isIntentionallyClosed = false;

    const connect = () => {
      ws = new WebSocket(createSessionsWebSocketUrl());

      ws.onopen = () => {
        console.log('Session list WebSocket connected');
        ws?.send(JSON.stringify({ type: 'subscribe' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'session_created' && data.session) {
            // Add new session to the top of the list
            const newSession: Session = {
              id: data.session.id,
              title: data.session.title,
              databricksWorkspacePath:
                data.session.databricksWorkspacePath ?? null,
              updatedAt: data.session.updatedAt,
              createdAt: data.session.updatedAt, // New sessions have same createdAt/updatedAt
              userEmail: null,
              databricksWorkspaceAutoPush:
                data.session.databricksWorkspaceAutoPush ?? false,
              isArchived: false, // New sessions are always active
            };
            setSessions((prev) => {
              // 重複チェック: 既に存在する場合は追加しない
              if (prev.some((s) => s.id === newSession.id)) {
                return prev;
              }
              return [newSession, ...prev];
            });
          }

          // Handle session updates (e.g., auto-generated title)
          if (data.type === 'session_updated' && data.session) {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === data.session.id ? { ...s, ...data.session } : s
              )
            );
          }
        } catch (err) {
          console.error('Failed to parse session list WebSocket message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('Session list WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('Session list WebSocket closed');
        // Reconnect after 3 seconds if not intentionally closed
        if (!isIntentionallyClosed) {
          console.log('Reconnecting in 3 seconds...');
          reconnectTimeout = setTimeout(() => {
            connect();
          }, 3000);
        }
      };
    };

    connect();

    return () => {
      isIntentionallyClosed = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      ws?.close();
    };
  }, []);

  // Get session from all sessions (not filtered)
  const getSession = useCallback(
    (sessionId: string) => {
      return sessions.find((s) => s.id === sessionId);
    },
    [sessions]
  );

  const updateSessionLocally = useCallback(
    (sessionId: string, updates: Partial<Session>) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, ...updates } : s))
      );
    },
    []
  );

  const archiveSession = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`/api/v1/sessions/${sessionId}/archive`, {
        method: 'PATCH',
      });
      if (!response.ok) {
        throw new Error('Failed to archive session');
      }

      // Update local state - set isArchived to true
      // Filtering is handled automatically by useMemo
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, isArchived: true } : s))
      );
    } catch (err) {
      console.error('Failed to archive session:', err);
      throw err;
    }
  }, []);

  return (
    <SessionsContext.Provider
      value={{
        sessions: filteredSessions, // Use filtered sessions
        isLoading,
        error,
        filter,
        setFilter,
        refetch: fetchSessions,
        getSession,
        updateSessionLocally,
        archiveSession,
      }}
    >
      {children}
    </SessionsContext.Provider>
  );
}

export function useSessions() {
  const context = useContext(SessionsContext);
  if (context === undefined) {
    throw new Error('useSessions must be used within a SessionsProvider');
  }
  return context;
}
