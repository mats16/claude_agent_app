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
  id: string;
  title: string | null;
  model: string;
  workspacePath: string | null;
  workspaceUrl?: string | null; // Fetched from GET /api/v1/sessions/:id
  userEmail: string | null;
  workspaceAutoPush: boolean;
  appAutoDeploy: boolean;
  appName?: string | null; // app-by-claude-{stub}, only when appAutoDeploy=true
  consoleUrl?: string | null; // https://{host}/apps/{app_name}, only when appAutoDeploy=true
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
      // Transform snake_case API response to camelCase
      const sessions = (data.sessions || []).map(
        (s: Record<string, unknown>) => ({
          id: s.id,
          title: s.title,
          model: s.model,
          workspacePath: s.workspace_path,
          workspaceAutoPush: s.workspace_auto_push,
          appAutoDeploy: s.app_auto_deploy,
          updatedAt: s.updated_at,
          createdAt: s.created_at ?? s.updated_at,
          localPath: s.local_path,
          isArchived: s.is_archived,
          userEmail: null,
        })
      );
      setSessions(sessions);
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
            // Transform snake_case WebSocket message to camelCase
            const s = data.session;
            const newSession: Session = {
              id: s.id,
              title: s.title,
              workspacePath: s.workspace_path,
              updatedAt: s.updated_at,
              createdAt: s.updated_at, // New sessions have same createdAt/updatedAt
              model: '',
              userEmail: null,
              workspaceAutoPush: s.workspace_auto_push ?? false,
              appAutoDeploy: s.app_auto_deploy ?? false,
              isArchived: false, // New sessions are always active
            };
            setSessions((prev) => {
              // 重複チェック: 既に存在する場合は追加しない
              if (prev.some((sess) => sess.id === newSession.id)) {
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
