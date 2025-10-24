import { useState, useCallback, useEffect } from 'react';
import { UserSettings } from '../types/settings';

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
      console.warn('Failed to load user settings from localStorage:', error);
    }
    return { defaultProject: undefined };
  });

  // Save settings to localStorage whenever they change
  useEffect(() => {
    try {
      console.log('🔧 useSettings: saving to localStorage:', SETTINGS_STORAGE_KEY, settings);
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save user settings to localStorage:', error);
    }
  }, [settings]);

  const setDefaultProject = useCallback(async (projectName: string | null) => {
    console.log('🔧 useSettings: setDefaultProject called with:', projectName);

    // If setting a project as default, update backend metadata
    if (projectName) {
      try {
        // Find project ID by name
        const projectsResponse = await fetch('http://localhost:8080/api/v1/projects');
        const projectsData = await projectsResponse.json();
        const project = projectsData.data?.projects?.find((p: any) => p.name === projectName);

        if (project?.id) {
          // Call backend to set project as primary
          const response = await fetch(`http://localhost:8080/api/v2/projects/${project.id}/set-primary`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            console.error('Failed to set project as primary in backend:', await response.text());
            // Continue anyway to update local storage
          } else {
            console.log('✅ Successfully set project as primary in backend:', projectName);
          }
        } else {
          console.warn('⚠️ Could not find project ID for:', projectName);
        }
      } catch (error) {
        console.error('Failed to update backend primary project:', error);
        // Continue anyway to update local storage
      }
    }

    // Update local settings
    setSettings(prev => {
      const newSettings = {
        ...prev,
        defaultProject: projectName || undefined
      };
      console.log('🔧 useSettings: updating settings from', prev, 'to', newSettings);
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