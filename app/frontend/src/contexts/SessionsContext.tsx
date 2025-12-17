import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

export interface Session {
  id: string;
  title: string | null;
  model: string;
  workspacePath: string | null;
  userEmail: string | null;
  autoSync: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SessionsContextType {
  sessions: Session[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  getSession: (sessionId: string) => Session | undefined;
  updateSessionLocally: (sessionId: string, updates: Partial<Session>) => void;
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

  const fetchSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/v1/sessions');
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

  // WebSocket connection for real-time session list updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/api/v1/sessions/ws`
    );

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe' }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'session_created' && data.session) {
          // Add new session to the top of the list
          const newSession: Session = {
            id: data.session.id,
            title: data.session.title,
            workspacePath: data.session.workspacePath,
            updatedAt: data.session.updatedAt,
            createdAt: data.session.updatedAt, // New sessions have same createdAt/updatedAt
            model: '',
            userEmail: null,
            autoSync: false,
          };
          setSessions((prev) => [newSession, ...prev]);
        }
      } catch (err) {
        console.error('Failed to parse session list WebSocket message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('Session list WebSocket error:', error);
    };

    return () => {
      ws.close();
    };
  }, []);

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

  return (
    <SessionsContext.Provider
      value={{
        sessions,
        isLoading,
        error,
        refetch: fetchSessions,
        getSession,
        updateSessionLocally,
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
