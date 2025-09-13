import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Project } from '../services/projectApi';
import ProjectApi from '../services/projectApi';
import { useAuthContext } from './AuthContext';

interface ProjectContextType {
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
  allProjects: Project[];
  loading: boolean;
  refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

interface ProjectProviderProps {
  children: ReactNode;
}

export const ProjectProvider: React.FC<ProjectProviderProps> = ({ children }) => {
  const { isAuthenticated, isLoading: authLoading } = useAuthContext();
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  // Load projects only when authenticated
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      refreshProjects();
      loadCurrentProjectFromSession();
    }
  }, [isAuthenticated, authLoading]);

  // Save current project to localStorage when it changes
  useEffect(() => {
    if (currentProject) {
      localStorage.setItem('aidis_selected_project', JSON.stringify(currentProject));
      // Keep backward compatibility by also saving to old key
      localStorage.setItem('aidis_current_project', JSON.stringify(currentProject));
    } else {
      localStorage.removeItem('aidis_selected_project');
      localStorage.removeItem('aidis_current_project');
    }
  }, [currentProject]);

  const loadCurrentProjectFromSession = async () => {
    try {
      // First, try to get current project from MCP session
      const session = await ProjectApi.getCurrentSession();
      if (session?.project_name && session?.project_id) {
        // Find the project in our projects list
        const sessionProject: Project = {
          id: session.project_id,
          name: session.project_name,
          status: 'active' as const,
          created_at: session.created_at || new Date().toISOString(),
          updated_at: session.created_at || new Date().toISOString(),
          description: `Project from MCP session: ${session.title || session.project_name}`
        };
        setCurrentProject(sessionProject);
        console.log('✅ Loaded project from MCP session:', sessionProject.name);
        return;
      }
      
      // Fallback to localStorage if session API fails
      let stored = localStorage.getItem('aidis_selected_project');
      if (!stored) {
        // Try the old key for backward compatibility
        stored = localStorage.getItem('aidis_current_project');
      }
      if (stored) {
        const project = JSON.parse(stored);
        setCurrentProject(project);
        console.log('📱 Loaded project from localStorage:', project.name);
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
          setCurrentProject(project);
        }
      } catch (storageError) {
        console.error('Failed to load project from storage:', storageError);
      }
    }
  };

  const refreshProjects = async () => {
    setLoading(true);
    try {
      const response = await ProjectApi.getAllProjects();
      setAllProjects(response.projects);
      
      // If we have a current project, refresh its data
      if (currentProject) {
        const updatedProject = response.projects.find(p => p.id === currentProject.id);
        if (updatedProject) {
          setCurrentProject(updatedProject);
        } else {
          // Current project was deleted, clear it
          setCurrentProject(null);
        }
      }
    } catch (error) {
      console.error('Failed to refresh projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const value: ProjectContextType = {
    currentProject,
    setCurrentProject,
    allProjects,
    loading,
    refreshProjects,
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
