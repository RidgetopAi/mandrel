import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import type { Project } from '../types/project';
import type { Session } from '../types/session';
import { useProjects, useAllSessions } from '../hooks/useProjects';
import { useAuthContext } from './AuthContext';
import { mandrelApi } from '../api/mandrelApiClient';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useSettings } from '../hooks/useSettings';
import { logger } from '../utils/logger';
import { isValidUuid, loadValidStoredProject } from '../utils/uuid';
import {
  parseAidisProjectName,
  resolveRealProject,
  selectFallbackProject,
} from './projectResolution';

const UNASSIGNED_PROJECT_ID = '00000000-0000-0000-0000-000000000000';
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
    DEBUG && logger.log('🔧 ProjectContext: defaultProject from useSettings changed:', defaultProject);
  }, [defaultProject]);

  // Settings load tracking - wait for settings to be fully initialized
  useEffect(() => {
    // Settings load detection - wait for React state propagation when settings exist
    DEBUG && logger.log('🔧 ProjectContext: Settings load check:', {
      defaultProject,
      hasStoredSettings: !!localStorage.getItem('aidis_user_settings')
    });

    const hasStoredSettings = localStorage.getItem('aidis_user_settings');

    if (hasStoredSettings) {
      // We have stored settings - wait for them to be loaded into React state
      if (defaultProject !== undefined) {
        DEBUG && logger.log('🎯 Settings loaded with value:', defaultProject);
        setSettingsLoaded(true);
      } else {
        DEBUG && logger.log('⏳ Waiting for stored settings to load into React state...');
        // Settings exist but not loaded into React state yet - keep waiting
      }
    } else {
      // No stored settings exist - consider loaded immediately
      DEBUG && logger.log('📝 No stored settings found, marking as loaded');
      setSettingsLoaded(true);
    }

    // Fallback timeout remains for safety
    const fallbackTimer = setTimeout(() => {
      if (!settingsLoaded) {
        DEBUG && logger.log('⚠️ Settings load timeout reached, proceeding anyway');
        setSettingsLoaded(true);
      }
    }, 2000);

    return () => clearTimeout(fallbackTimer);
  }, [defaultProject, settingsLoaded]);

  // Debug logging to track the fix
  useEffect(() => {
    DEBUG && logger.log('🔧 ProjectContext: Settings load status:', {
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
        logger.error('Failed to load projects while selecting bootstrap project:', error);
        return null;
      }
    }

    // Durable fallback selection (Lesson 011: centralized in projectResolution
    // so both call sites agree and the result is ALWAYS a real-UUID project).
    // Priority: user preference -> last-active session's project ->
    // most-recently-updated (last_activity) -> aidis-bootstrap -> first real.
    DEBUG && logger.log('🔧 ProjectContext: selectBootstrapProject - FALLBACK defaultProject:', defaultProject, 'available projects:', projectList.map(p => p.name));
    const fallback = selectFallbackProject(projectList, allSessions, defaultProject);
    if (!fallback) {
      logger.warn('⚠️ selectBootstrapProject found no real-UUID project to fall back to');
    }
    return fallback;
  }, [allProjects, allSessions, refetchProjects, defaultProject]);

  const loadCurrentProjectFromSession = useCallback(async (projectsFromRefresh?: Project[]) => {
    try {
      // FIRST: Check if user has a default project preference (FIXES refresh bug)
      DEBUG && logger.log('🔧 loadCurrentProjectFromSession: Checking user preference first:', {
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
          DEBUG && logger.log('🎯 Using user-preferred project (priority override):', defaultProject);

          // Sync AIDIS session to match user preference
          try {
            await mandrelApi.switchProject(defaultProject);
            DEBUG && logger.log('🔄 Synced AIDIS session to user preference:', defaultProject);
          } catch (syncError) {
            logger.warn('⚠️ Failed to sync AIDIS session to user preference:', syncError);
            // Don't fail the whole operation if sync fails
          }

          return;
        } else {
          logger.warn('⚠️ User-preferred project not found:', defaultProject, 'in projects:', projectList.map(p => p.name));
        }
      }

      // SECOND: Try to get current project from AIDIS V2 API (only if no user preference)
      DEBUG && logger.log('🔧 No user preference or preference not available, checking AIDIS session...');
      try {
        const aidisResponse = await mandrelApi.getCurrentProject();
        if (aidisResponse?.content?.[0]?.text) {
          const aidisProjectText = aidisResponse.content[0].text;
          // Parse + sanitize the project NAME from the AIDIS response. The MCP
          // route returns markdown bold (`**pi-ridgey**`); parseAidisProjectName
          // strips the `**` so the name resolves to the real project instead of
          // landing as an unmatched synthetic value (`aidis-**pi-ridgey**`).
          const projectName = parseAidisProjectName(aidisProjectText);
          if (projectName) {
            const projectList = (projectsFromRefresh && projectsFromRefresh.length > 0)
              ? projectsFromRefresh
              : allProjects;
            // Resolve to a REAL project (real UUID). A synthetic `aidis-<name>`
            // id is NOT a UUID and would 400 on every UUID-validated route
            // (insights/sessions) AND be echoed literally by the AntD <Select>.
            const realProject = resolveRealProject(projectName, projectList);
            if (realProject) {
              setCurrentProject(realProject);
              DEBUG && logger.log('✅ Resolved AIDIS V2 project name to real project:', realProject.name, realProject.id);
              return;
            }
            // SAFEGUARD (the durable fix): name didn't resolve — do NOT build a
            // synthetic id and early-return. Fall through to selectBootstrapProject
            // so currentProject.id is always a real UUID.
            logger.warn('⚠️ AIDIS V2 project name not found in projects list; falling back to bootstrap selection:', projectName);
          }
        }
      } catch (aidisError) {
        logger.warn('⚠️ AIDIS V2 API unavailable, falling back to backend session API:', aidisError);
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
        DEBUG && logger.log('✅ Loaded project from backend session:', sessionProject.name);
        return;
      }

      if (currentSession?.project_id === UNASSIGNED_PROJECT_ID) {
        const bootstrapProject = await selectBootstrapProject(projectsFromRefresh);
        if (bootstrapProject) {
          setCurrentProject(bootstrapProject);
          DEBUG && logger.log('🔄 Session unassigned - defaulting to bootstrap project:', bootstrapProject.name);
          return;
        }
      }
      
      // Fallback to localStorage if session API fails. SELF-HEAL: only accept a
      // stored project whose id is a real UUID. A corrupt stored id (e.g.
      // `session_voiceitt-bridge`) is discarded here (loadValidStoredProject
      // purges the bad keys) so it can never drive /api/projects/{id} or the
      // SSE projectId into a 400 — we fall through to the real project list.
      const stored = loadValidStoredProject() as Project | null;
      if (stored && isValidUuid(stored.id)) {
        setCurrentProject({
          ...stored,
          status: (stored.status ?? ACTIVE_STATUS) as Project['status']
        });
        DEBUG && logger.log('📱 Loaded project from localStorage (validated):', stored.name);
        return;
      }

      const bootstrapProject = await selectBootstrapProject(projectsFromRefresh);
      if (bootstrapProject) {
        setCurrentProject(bootstrapProject);
        DEBUG && logger.log('🧭 Defaulting to bootstrap project:', bootstrapProject.name);
      }
    } catch (error) {
      logger.error('Failed to load project from session:', error);
      // Fallback to localStorage. SELF-HEAL: same UUID validation as above — a
      // corrupt stored id is discarded rather than re-applied on the error path.
      try {
        const stored = loadValidStoredProject() as Project | null;
        if (stored && isValidUuid(stored.id)) {
          setCurrentProject({
            ...stored,
            status: (stored.status ?? ACTIVE_STATUS) as Project['status']
          });
          return;
        }

        const bootstrapProject = await selectBootstrapProject(projectsFromRefresh);
        if (bootstrapProject) {
          setCurrentProject(bootstrapProject);
        }
      } catch (storageError) {
        logger.error('Failed to load project from storage:', storageError);
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
      logger.error('Failed to refresh projects:', error);
      return [];
    }
  }, [currentProject, refetchProjects]);

  const switchProjectViaAidis = useCallback(async (projectName: string): Promise<boolean> => {
    const operation = async () => {
      const response = await mandrelApi.switchProject(projectName);
      if (response?.content?.[0]?.text) {
        // Prefer the real project (real UUID) from our loaded list so that
        // UUID-validated routes (insights/sessions) keep working. The MCP
        // response echoes the name in markdown bold, so resolve against the
        // sanitized name too (the caller passes a clean name, but the response
        // text is the authoritative confirmation).
        const confirmedName = parseAidisProjectName(response.content[0].text) ?? projectName;
        const realProject =
          resolveRealProject(confirmedName, allProjects) ??
          resolveRealProject(projectName, allProjects);
        if (realProject) {
          setCurrentProject(realProject);
          DEBUG && logger.log('✅ Switched to real project via AIDIS V2:', realProject.name, realProject.id);
          return true;
        }
        // SAFEGUARD (the durable fix): name didn't resolve to a real project — do
        // NOT synthesize an `aidis-<name>` id. Fall back to a real-UUID project so
        // the <Select> never echoes a synthetic value and no UUID route 400s.
        const fallback = selectFallbackProject(allProjects, allSessions, defaultProject);
        if (fallback) {
          setCurrentProject(fallback);
          logger.warn('⚠️ Switched project not found in list; selected real-UUID fallback instead of synthetic id:', projectName, '->', fallback.name);
          return true;
        }
        logger.warn('⚠️ Switched project not found and no real-UUID fallback available:', projectName);
        return false;
      }
      throw new Error('Project switch response was empty or invalid');
    };

    const result = await errorHandler.withErrorHandling(operation)();
    return result ?? false;
  }, [errorHandler, allProjects, allSessions, defaultProject]);

  // Load projects only when authenticated AND settings are loaded
  useEffect(() => {
    if (!isAuthenticated || authLoading || !settingsLoaded) {
      hasInitializedRef.current = false;
      DEBUG && logger.log('🔧 ProjectContext: Waiting for initialization conditions:', {
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
      logger.error('Failed to initialize projects:', error);
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