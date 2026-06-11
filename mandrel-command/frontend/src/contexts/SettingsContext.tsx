import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import { UserSettings } from '../types/settings';
import { useAuthContext } from './AuthContext';
import { logger } from '../utils/logger';

const SETTINGS_STORAGE_KEY = 'aidis_user_settings';

interface UseSettingsReturn {
  defaultProject: string | undefined;
  setDefaultProject: (projectName: string | null) => Promise<void>;
  clearDefaultProject: () => Promise<void>;
  settings: UserSettings;
  updateSettings: (updates: Partial<UserSettings>) => void;
}

const SettingsContext = createContext<UseSettingsReturn | undefined>(undefined);

const getApiBaseUrl = () => process.env.REACT_APP_API_URL || '/api';
const getToken = () => localStorage.getItem('aidis_token') || '';

const readStoredSettings = (): UserSettings => {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { defaultProject: undefined, ...parsed };
    }
  } catch (error) {
    logger.warn('Failed to load user settings from localStorage:', error);
  }
  return { defaultProject: undefined };
};

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuthContext();
  const [settings, setSettings] = useState<UserSettings>(readStoredSettings);
  const seededRef = useRef(false);

  // Persist settings to localStorage (cache / fast-path for next load).
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      logger.error('Failed to save user settings to localStorage:', error);
    }
  }, [settings]);

  // Seed defaultProject from the backend's primary project once per auth.
  // The backend (is_primary flag on projects.metadata) is the source of truth;
  // localStorage is only a cache. This makes the saved default survive a new
  // browser / device / cleared storage, and makes set-primary visible to
  // ProjectContext without a hard page reload.
  useEffect(() => {
    if (!isAuthenticated) {
      seededRef.current = false;
      return;
    }
    if (seededRef.current) {
      return;
    }
    seededRef.current = true;

    (async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/projects`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
        });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        const projects = data?.data?.projects || [];
        const primary = projects.find(
          (p: any) => p?.is_primary === true || p?.metadata?.is_primary === true,
        );
        const primaryName: string | undefined = primary?.name;

        setSettings((prev) => {
          // Backend is authoritative for the default project. Reconcile rather
          // than clobber: only change state if the backend value differs.
          if ((prev.defaultProject || undefined) === (primaryName || undefined)) {
            return prev;
          }
          logger.log(
            '🔧 SettingsContext: reconciled defaultProject from backend primary:',
            primaryName,
          );
          return { ...prev, defaultProject: primaryName };
        });
      } catch (error) {
        logger.warn('Failed to seed default project from backend:', error);
      }
    })();
  }, [isAuthenticated]);

  const setDefaultProject = useCallback(async (projectName: string | null) => {
    logger.log('🔧 SettingsContext: setDefaultProject called with:', projectName);

    if (projectName) {
      const apiBaseUrl = getApiBaseUrl();

      // Resolve project id by name via the Command backend API.
      const projectsResponse = await fetch(`${apiBaseUrl}/projects`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
      });
      if (!projectsResponse.ok) {
        throw new Error(`Failed to fetch projects: ${projectsResponse.statusText}`);
      }

      const projectsData = await projectsResponse.json();
      const project = projectsData.data?.projects?.find(
        (p: any) => p.name === projectName,
      );

      if (!project?.id) {
        throw new Error(`Project "${projectName}" not found`);
      }

      // Persist to backend (proxies to MCP, sets is_primary metadata).
      const response = await fetch(`${apiBaseUrl}/projects/${project.id}/set-primary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Failed to set project as primary in backend:', errorText);
        throw new Error(`Backend error: ${errorText}`);
      }

      logger.log('✅ Successfully set project as primary in backend:', projectName);
    }

    setSettings((prev) => ({ ...prev, defaultProject: projectName || undefined }));
  }, []);

  const clearDefaultProject = useCallback(async () => {
    // NOTE: there is currently no backend "clear primary" endpoint, so clearing
    // is local-only (matches the pre-fix behavior). On next login the backend
    // seed will re-apply the still-set primary until a backend clear exists.
    // See Foreman report: optional follow-up to add a clear-primary route.
    setSettings((prev) => ({ ...prev, defaultProject: undefined }));
  }, []);

  const updateSettings = useCallback((updates: Partial<UserSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const value: UseSettingsReturn = {
    defaultProject: settings.defaultProject,
    setDefaultProject,
    clearDefaultProject,
    settings,
    updateSettings,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = (): UseSettingsReturn => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export default SettingsContext;
