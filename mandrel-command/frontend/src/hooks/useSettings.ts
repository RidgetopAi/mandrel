import { useState, useCallback, useEffect } from 'react';
import { UserSettings } from '../types/settings';
import { logger } from '../utils/logger';

const SETTINGS_STORAGE_KEY = 'aidis_user_settings';

interface UseSettingsReturn {
  defaultProject: string | undefined;
  setDefaultProject: (projectName: string | null) => Promise<void>;
  clearDefaultProject: () => void;
  settings: UserSettings;
  updateSettings: (updates: Partial<UserSettings>) => void;
}

export const useSettings = (): UseSettingsReturn => {
  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          defaultProject: undefined,
          ...parsed
        };
      }
    } catch (error) {
      logger.warn('Failed to load user settings from localStorage:', error);
    }
    return { defaultProject: undefined };
  });

  // Save settings to localStorage whenever they change
  useEffect(() => {
    try {
      logger.log('🔧 useSettings: saving to localStorage:', SETTINGS_STORAGE_KEY, settings);
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      logger.error('Failed to save user settings to localStorage:', error);
    }
  }, [settings]);

  const setDefaultProject = useCallback(async (projectName: string | null) => {
    logger.log('🔧 useSettings: setDefaultProject called with:', projectName);

    // If setting a project as default, update backend metadata
    if (projectName) {
      try {
        // Get API base URL from environment or use default
        const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';

        // Find project ID by name - use AIDIS Command backend API
        const projectsResponse = await fetch(`${apiBaseUrl}/projects`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('aidis_token') || ''}`,
          },
        });
        if (!projectsResponse.ok) {
          throw new Error(`Failed to fetch projects: ${projectsResponse.statusText}`);
        }

        const projectsData = await projectsResponse.json();
        const project = projectsData.data?.projects?.find((p: any) => p.name === projectName);

        if (project?.id) {
          // Call Mandrel Command backend to set project as primary (which proxies to MCP server)
          const response = await fetch(`${apiBaseUrl}/projects/${project.id}/set-primary`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('aidis_token') || ''}`,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            logger.error('Failed to set project as primary in backend:', errorText);
            throw new Error(`Backend error: ${errorText}`);
          }

          logger.log('✅ Successfully set project as primary in backend:', projectName);
        } else {
          logger.warn('⚠️ Could not find project ID for:', projectName);
          throw new Error(`Project "${projectName}" not found`);
        }
      } catch (error) {
        logger.error('Failed to update backend primary project:', error);
        // Re-throw the error so the UI can show it to the user
        throw error;
      }
    }

    // Update local settings only after successful backend update
    setSettings(prev => {
      const newSettings = {
        ...prev,
        defaultProject: projectName || undefined
      };
      logger.log('🔧 useSettings: updating settings from', prev, 'to', newSettings);
      return newSettings;
    });
  }, []);

  const clearDefaultProject = useCallback(() => {
    setSettings(prev => ({
      ...prev,
      defaultProject: undefined
    }));
  }, []);

  const updateSettings = useCallback((updates: Partial<UserSettings>) => {
    setSettings(prev => ({
      ...prev,
      ...updates
    }));
  }, []);

  return {
    defaultProject: settings.defaultProject,
    setDefaultProject,
    clearDefaultProject,
    settings,
    updateSettings
  };
};

export default useSettings;