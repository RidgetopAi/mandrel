import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import type { Project } from '../types/project';
import type { Session } from '../types/session';
import { useProjects, useAllSessions } from '../hooks/useProjects';
import { useAuthContext } from './AuthContext';
import { mandrelApi } from '../api/mandrelApiClient';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useSettings } from '../hooks/useSettings';

const UNASSIGNED_PROJECT_ID = '00000000-0000-0000-0000-000000000000';
const DEFAULT_BOOTSTRAP_PROJECT_NAME = 'aidis-bootstrap';
const ACTIVE_STATUS: Project['status'] = 'active';
const DEBUG = process.env.NODE_ENV !== 'production';

interface ProjectContextType {
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
  allProjects: Project[];
  loading: boolean;
  refreshProjects: () => Promise<Project[]>;
  switchProjectViaAidis: (projectName: string) => Promise<boolean>;
  error: any;
  clearError: () => void;
  hasError: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

interface ProjectProviderProps {
  children: ReactNode;
}

export const ProjectProvider: React.FC<ProjectProviderProps> = ({ children }) => {
  const { isAuthenticated, isLoading: authLoading } = useAuthContext();
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const hasInitializedRef = useRef(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const { defaultProject } = useSettings();

  // Debug logging for default project changes
  useEffect(() => {
    DEBUG && console.log('🔧 ProjectContext: defaultProject from useSettings changed:', defaultProject);
  }, [defaultProject]);

  // Settings load tracking - wait for settings to be fully initialized
  useEffect(() => {
    // Settings load detection - wait for React state propagation when settings exist
    DEBUG && console.log('🔧 ProjectContext: Settings load check:', {
      defaultProject,
      hasStoredSettings: !!localStorage.getItem('aidis_user_settings')
    });

    const hasStoredSettings = localStorage.getItem('aidis_user_settings');

    if (hasStoredSettings) {
      // We have stored settings - wait for them to be loaded into React state
      if (defaultProject !== undefined) {
        DEBUG && console.log('🎯 Settings loaded with value:', defaultProject);
        setSettingsLoaded(true);
      } else {
        DEBUG && console.log('⏳ Waiting for stored settings to load into React state...');
        // Settings exist but not loaded into React state yet - keep waiting
      }
    } else {
      // No stored settings exist - consider loaded immediately
      DEBUG && console.log('📝 No stored settings found, marking as loaded');
      setSettingsLoaded(true);
    }

    // Fallback timeout remains for safety
    const fallbackTimer = setTimeout(() => {
      if (!settingsLoaded) {
        DEBUG && console.log('⚠️ Settings load timeout reached, proceeding anyway');
        setSettingsLoaded(true);
      }
    }, 2000);

    return () => clearTimeout(fallbackTimer);
  }, [defaultProject, settingsLoaded]);

  // Debug logging to track the fix
  useEffect(() => {
    DEBUG && console.log('🔧 ProjectContext: Settings load status:', {
      settingsLoaded,
      defaultProject,
      hasStoredSettings: !!localStorage.getItem('aidis_user_settings'),
      isAuthenticated,
      authLoading
    });
  }, [settingsLoaded, defaultProject, isAuthenticated, authLoading]);

  // React Query hooks for data fetching
  const {
    data: projectsResponse,
    isLoading: projectsLoading,
    error: projectsError,
    refetch: refetchProjects
  } = useProjects({}, { enabled: isAuthenticated && !authLoading });

  const {
    data: sessionsResponse,
    isLoading: sessionsLoading,
    error: sessionsError
  } = useAllSessions();

  // Extract data from React Query responses
  const allProjects = useMemo(() => {
    if (!projectsResponse) {
      return [];
    }

    if (projectsResponse.projects && projectsResponse.projects.length > 0) {
      return projectsResponse.projects;
    }

    return projectsResponse.data?.projects || [];
  }, [projectsResponse]);
  const allSessions = useMemo(() => sessionsResponse?.data?.sessions || [], [sessionsResponse]);
  const loading = projectsLoading || sessionsLoading;

  // TR002-6: Enhanced error handling
  const errorHandler = useErrorHandler({
    componentName: 'ProjectProvider',
    enableAutoRetry: true,
    maxRetries: 3,
    showUserMessages: false, // We'll handle messages contextually
    reportToAidis: true,
  });

  // Save current project to localStorage when it changes
  useEffect(() => {
    if (currentProject) {
      if (currentProject.id === UNASSIGNED_PROJECT_ID) {
        return;
      }
      localStorage.setItem('aidis_selected_project', JSON.stringify(currentProject));
      // Keep backward compatibility by also saving to old key
      localStorage.setItem('aidis_current_project', JSON.stringify(currentProject));
    } else {
      localStorage.removeItem('aidis_selected_project');
      localStorage.removeItem('aidis_current_project');
    }
  }, [currentProject]);

  const selectBootstrapProject = useCallback(async (projectsFromRefresh?: Project[]): Promise<Project | null> => {
    const projectList = (projectsFromRefresh && projectsFromRefresh.length > 0)
      ? projectsFromRefresh
      : allProjects;

    if (projectList.length === 0) {
      try {
        const result = await refetchProjects();
        const refreshedProjects = result.data?.projects || [];
        if (refreshedProjects.length === 0) {
          return null;
        }
        return selectBootstrapProject(refreshedProjects);
      } catch (error) {
        console.error('Failed to load projects while selecting bootstrap project:', error);
        return null;
      }
    }

    // Fallback project selection hierarchy (when no user preference or session):
    // 1. URL parameter (?project=name) - TODO: implement in future
    // 1.5. User preference from localStorage (handled in loadCurrentProjectFromSession now)
    DEBUG && console.log('🔧 ProjectContext: selectBootstrapProject - FALLBACK defaultProject:', defaultProject, 'available projects:', projectList.map(p => p.name));
    if (defaultProject) {
      const userPreferredProject = projectList.find((project: Project) => project.name === defaultProject);
      if (userPreferredProject) {
        DEBUG && console.log('🎯 Using user-preferred project (fallback):', defaultProject);
        return userPreferredProject;
      } else {
        console.warn('⚠️ User-preferred project not found:', defaultProject, 'in projects:', projectList.map(p => p.name));
      }
    }

    // 2. Hardcoded "aidis-bootstrap" (existing fallback)
    const bootstrapProject = projectList.find((project: Project) => project.name === DEFAULT_BOOTSTRAP_PROJECT_NAME);
    if (bootstrapProject) {
      return bootstrapProject;
    }

    // 3. First available project from API
    const fallbackProject = projectList.find((project: Project) => project.id !== UNASSIGNED_PROJECT_ID);
    return fallbackProject || null;
  }, [allProjects, refetchProjects, defaultProject]);

  const loadCurrentProjectFromSession = useCallback(async (projectsFromRefresh?: Project[]) => {
    try {
      // FIRST: Check if user has a default project preference (FIXES refresh bug)
      DEBUG && console.log('🔧 loadCurrentProjectFromSession: Checking user preference first:', {
        defaultProject,
        hasProjects: (projectsFromRefresh || allProjects).length > 0
      });

      if (defaultProject) {
        const projectList = projectsFromRefresh && projectsFromRefresh.length > 0
          ? projectsFromRefresh
          : allProjects;

        const userPreferredProject = projectList.find(
          (project: Project) => project.name === defaultProject
        );

        if (userPreferredProject) {
          setCurrentProject(userPreferredProject);
          DEBUG && console.log('🎯 Using user-preferred project (priority override):', defaultProject);

          // Sync AIDIS session to match user preference
          try {
            await mandrelApi.switchProject(defaultProject);
            DEBUG && console.log('🔄 Synced AIDIS session to user preference:', defaultProject);
          } catch (syncError) {
            console.warn('⚠️ Failed to sync AIDIS session to user preference:', syncError);
            // Don't fail the whole operation if sync fails
          }

          return;
        } else {
          console.warn('⚠️ User-preferred project not found:', defaultProject, 'in projects:', projectList.map(p => p.name));
        }
      }

      // SECOND: Try to get current project from AIDIS V2 API (only if no user preference)
      DEBUG && console.log('🔧 No user preference or preference not available, checking AIDIS session...');
      try {
        const aidisResponse = await mandrelApi.getCurrentProject();
        if (aidisResponse?.content?.[0]?.text) {
          const aidisProjectText = aidisResponse.content[0].text;
          // Parse project info from AIDIS response (contains project name/details)
          const projectNameMatch = aidisProjectText.match(/Current project:\s*([^\n]+)/i);
          if (projectNameMatch) {
            const projectName = projectNameMatch[1].trim();
            if (projectName && projectName !== 'None' && projectName !== 'unassigned') {
              // Create project object from AIDIS data
              const aidisProject: Project = {
                id: `aidis-${projectName.toLowerCase().replace(/\s+/g, '-')}`,
                name: projectName,
                status: ACTIVE_STATUS,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                description: `Project from AIDIS V2 API: ${projectName}`
              };
              setCurrentProject(aidisProject);
              DEBUG && console.log('✅ Loaded project from AIDIS V2 API (fallback):', aidisProject.name);
              return;
            }
          }
        }
      } catch (aidisError) {
        console.warn('⚠️ AIDIS V2 API unavailable, falling back to backend session API:', aidisError);
      }

      // Fallback: try to get current project from backend MCP session
      const currentSession = allSessions.find((session: Session) => session.id && session.project_id);
      if (currentSession?.project_name && currentSession?.project_id && currentSession.project_id !== UNASSIGNED_PROJECT_ID) {
        // Find the project in our projects list
        const sessionProject: Project = {
          id: currentSession.project_id,
          name: currentSession.project_name,
          status: ACTIVE_STATUS,
          created_at: currentSession.created_at || new Date().toISOString(),
          updated_at: currentSession.created_at || new Date().toISOString(),
          description: `Project from MCP session: ${currentSession.title || currentSession.project_name}`
        };
        setCurrentProject(sessionProject);
        DEBUG && console.log('✅ Loaded project from backend session:', sessionProject.name);
        return;
      }

      if (currentSession?.project_id === UNASSIGNED_PROJECT_ID) {
        const bootstrapProject = await selectBootstrapProject(projectsFromRefresh);
        if (bootstrapProject) {
          setCurrentProject(bootstrapProject);
          DEBUG && console.log('🔄 Session unassigned - defaulting to bootstrap project:', bootstrapProject.name);
          return;
        }
      }
      
      // Fallback to localStorage if session API fails
      let stored = localStorage.getItem('aidis_selected_project');
      if (!stored) {
        // Try the old key for backward compatibility
        stored = localStorage.getItem('aidis_current_project');
      }
      if (stored) {
        const project = JSON.parse(stored);
        if (project?.id && project.id !== UNASSIGNED_PROJECT_ID) {
          setCurrentProject({
            ...project,
            status: (project.status ?? ACTIVE_STATUS) as Project['status']
          });
          DEBUG && console.log('📱 Loaded project from localStorage:', project.name);
          return;
        }
      }

      const bootstrapProject = await selectBootstrapProject(projectsFromRefresh);
      if (bootstrapProject) {
        setCurrentProject(bootstrapProject);
        DEBUG && console.log('🧭 Defaulting to bootstrap project:', bootstrapProject.name);
      }
    } catch (error) {
      console.error('Failed to load project from session:', error);
      // Fallback to localStorage
      try {
        let stored = localStorage.getItem('aidis_selected_project');
        if (!stored) {
          // Try the old key for backward compatibility
          stored = localStorage.getItem('aidis_current_project');
        }
        if (stored) {
          const project = JSON.parse(stored);
        if (project?.id && project.id !== UNASSIGNED_PROJECT_ID) {
          setCurrentProject({
            ...project,
            status: (project.status ?? ACTIVE_STATUS) as Project['status']
          });
            return;
          }
        }

        const bootstrapProject = await selectBootstrapProject(projectsFromRefresh);
        if (bootstrapProject) {
          setCurrentProject(bootstrapProject);
        }
      } catch (storageError) {
        console.error('Failed to load project from storage:', storageError);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectBootstrapProject, allSessions]); // Intentionally omit allProjects/defaultProject to avoid bootstrap loops

  const refreshProjects = useCallback(async (): Promise<Project[]> => {
    try {
      const result = await refetchProjects();
      const refreshedProjects = result.data?.projects || [];

      // If we have a current project, refresh its data
      if (currentProject) {
        const updatedProject = refreshedProjects.find((p: Project) => p.id === currentProject.id);
        if (updatedProject) {
          setCurrentProject(updatedProject);
        } else {
          // Current project was deleted, clear it
          setCurrentProject(null);
        }
      }

      return refreshedProjects;
    } catch (error) {
      console.error('Failed to refresh projects:', error);
      return [];
    }
  }, [currentProject, refetchProjects]);

  const switchProjectViaAidis = useCallback(async (projectName: string): Promise<boolean> => {
    const operation = async () => {
      const response = await mandrelApi.switchProject(projectName);
      if (response?.content?.[0]?.text) {
        // Create project object from successful switch
        const switchedProject: Project = {
          id: `aidis-${projectName.toLowerCase().replace(/\s+/g, '-')}`,
          name: projectName,
          status: ACTIVE_STATUS,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          description: `Project switched via AIDIS V2: ${projectName}`
        };
        setCurrentProject(switchedProject);
        DEBUG && console.log('✅ Successfully switched to project via AIDIS V2:', projectName);
        return true;
      }
      throw new Error('Project switch response was empty or invalid');
    };

    const result = await errorHandler.withErrorHandling(operation)();
    return result ?? false;
  }, [errorHandler]);

  // Load projects only when authenticated AND settings are loaded
  useEffect(() => {
    if (!isAuthenticated || authLoading || !settingsLoaded) {
      hasInitializedRef.current = false;
      DEBUG && console.log('🔧 ProjectContext: Waiting for initialization conditions:', {
        isAuthenticated,
        authLoading,
        settingsLoaded
      });
      return;
    }

    if (hasInitializedRef.current) {
      return;
    }

    hasInitializedRef.current = true;
    let isActive = true;

    (async () => {
      const projects = await refreshProjects();
      if (!isActive) {
        return;
      }

      await loadCurrentProjectFromSession(projects);
    })().catch(error => {
      console.error('Failed to initialize projects:', error);
    });

    return () => {
      isActive = false;
    };
  }, [isAuthenticated, authLoading, settingsLoaded, refreshProjects, loadCurrentProjectFromSession]);

  const value: ProjectContextType = {
    currentProject,
    setCurrentProject,
    allProjects,
    loading,
    refreshProjects,
    switchProjectViaAidis,
    error: errorHandler.error || projectsError || sessionsError,
    clearError: errorHandler.clearError,
    hasError: errorHandler.hasError || !!projectsError || !!sessionsError,
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjectContext = (): ProjectContextType => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProjectContext must be used within a ProjectProvider');
  }
  return context;
};

export default ProjectContext;