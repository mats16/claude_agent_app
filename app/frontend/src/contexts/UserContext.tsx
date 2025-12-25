import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

export interface UserInfo {
  userId: string;
  email: string;
  workspaceHome: string;
  hasWorkspacePermission: boolean;
  databricksAppUrl: string | null;
}

export interface UserSettings {
  userId: string;
  claudeConfigAutoPush: boolean;
  hasDatabricksPat: boolean;
  encryptionAvailable: boolean;
}

interface UserContextType {
  userInfo: UserInfo | null;
  userSettings: UserSettings | null;
  isLoading: boolean;
  error: string | null;
  refetchUserInfo: () => Promise<void>;
  refetchUserSettings: () => Promise<void>;
  updateUserSettings: (settings: Partial<UserSettings>) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

interface UserProviderProps {
  children: ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/me');
      if (res.ok) {
        const data = await res.json();
        // Transform snake_case API response to camelCase
        setUserInfo({
          userId: data.user_id,
          email: data.email,
          workspaceHome: data.workspace_home,
          hasWorkspacePermission: data.has_workspace_permission,
          databricksAppUrl: data.databricks_app_url,
        });
        setError(null);
      } else {
        setError('Failed to fetch user info');
      }
    } catch (e) {
      console.error('Failed to fetch user info:', e);
      setError('Failed to fetch user info');
    }
  }, []);

  const fetchUserSettings = useCallback(async () => {
    try {
      // Fetch both settings and PAT status in parallel
      const [settingsRes, patRes] = await Promise.all([
        fetch('/api/v1/settings'),
        fetch('/api/v1/settings/pat'),
      ]);

      let settings = {
        userId: '',
        claudeConfigAutoPush: true,
        hasDatabricksPat: false,
        encryptionAvailable: false,
      };

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        // Transform snake_case API response to camelCase
        settings.userId = settingsData.user_id ?? settings.userId;
        settings.claudeConfigAutoPush =
          settingsData.claude_config_auto_push ?? settings.claudeConfigAutoPush;
      }

      if (patRes.ok) {
        const patData = await patRes.json();
        // Transform snake_case API response to camelCase
        settings.hasDatabricksPat = patData.has_pat ?? false;
        settings.encryptionAvailable = patData.encryption_available ?? false;
      }

      setUserSettings(settings);
    } catch (e) {
      console.error('Failed to fetch user settings:', e);
    }
  }, []);

  const updateUserSettings = useCallback(
    (settings: Partial<UserSettings>) => {
      if (userSettings) {
        setUserSettings({ ...userSettings, ...settings });
      }
    },
    [userSettings]
  );

  // Fetch both user info and settings on mount
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([fetchUserInfo(), fetchUserSettings()]);
      setIsLoading(false);
    };
    init();
  }, [fetchUserInfo, fetchUserSettings]);

  // Listen for settings changes from other components
  useEffect(() => {
    const handleSettingsChanged = () => {
      fetchUserSettings();
    };
    window.addEventListener('settings-changed', handleSettingsChanged);
    return () => {
      window.removeEventListener('settings-changed', handleSettingsChanged);
    };
  }, [fetchUserSettings]);

  return (
    <UserContext.Provider
      value={{
        userInfo,
        userSettings,
        isLoading,
        error,
        refetchUserInfo: fetchUserInfo,
        refetchUserSettings: fetchUserSettings,
        updateUserSettings,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
