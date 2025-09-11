import { apiClient } from './api';

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive' | 'archived';
  git_repo_url?: string;
  root_directory?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  context_count?: number;
  session_count?: number;
  last_activity?: string;
}

export interface Session {
  id: string;
  project_id: string;
  project_name?: string;
  title?: string;
  description?: string;
  created_at: string;
  context_count?: number;
  last_context_at?: string;
}

export interface SessionDetail extends Session {
  contexts?: {
    id: string;
    type: string;
    content: string;
    created_at: string;
    tags?: string[];
  }[];
  duration?: number;
  metadata?: Record<string, any>;
}

export interface ProjectStats {
  total_projects: number;
  active_projects: number;
  total_contexts: number;
  total_sessions: number;
  contexts_by_type: Record<string, number>;
  recent_activity: {
    contexts_last_week: number;
    sessions_last_week: number;
  };
}

export interface ProjectInsights {
  insights: string;
  generatedAt: string;
  projectId: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  git_repo_url?: string;
  root_directory?: string;
  metadata?: Record<string, any>;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'archived';
  git_repo_url?: string;
  root_directory?: string;
  metadata?: Record<string, any>;
}

export interface UpdateSessionRequest {
  title?: string;
  description?: string;
}

export class ProjectApi {
  /**
   * Get all projects
   */
  static async getAllProjects(): Promise<{ projects: Project[]; total: number }> {
    const response = await apiClient.get<{
      success: boolean;
      data: { projects: Project[]; total: number };
    }>('/projects');
    
    if (!response.success) {
      throw new Error('Failed to fetch projects');
    }
    
    return response.data;
  }

  /**
   * Get single project by ID
   */
  static async getProject(id: string): Promise<Project> {
    const response = await apiClient.get<{
      success: boolean;
      data: { project: Project };
    }>(`/projects/${id}`);
    
    if (!response.success) {
      throw new Error('Failed to fetch project');
    }
    
    return response.data.project;
  }

  /**
   * Create new project
   */
  static async createProject(projectData: CreateProjectRequest): Promise<Project> {
    const response = await apiClient.post<{
      success: boolean;
      data: { project: Project };
    }>('/projects', projectData);
    
    if (!response.success) {
      throw new Error('Failed to create project');
    }
    
    return response.data.project;
  }

  /**
   * Update project
   */
  static async updateProject(id: string, updates: UpdateProjectRequest): Promise<Project> {
    const response = await apiClient.put<{
      success: boolean;
      data: { project: Project };
    }>(`/projects/${id}`, updates);
    
    if (!response.success) {
      throw new Error('Failed to update project');
    }
    
    return response.data.project;
  }

  /**
   * Delete project
   */
  static async deleteProject(id: string): Promise<void> {
    const response = await apiClient.delete<{
      success: boolean;
      data: { message: string };
    }>(`/projects/${id}`);
    
    if (!response.success) {
      throw new Error('Failed to delete project');
    }
  }

  /**
   * Get project sessions
   */
  static async getProjectSessions(projectId: string): Promise<{ sessions: Session[]; total: number }> {
    const response = await apiClient.get<{
      success: boolean;
      data: { sessions: Session[]; total: number };
    }>(`/projects/${projectId}/sessions`);
    
    if (!response.success) {
      throw new Error('Failed to fetch project sessions');
    }
    
    return response.data;
  }

  /**
   * Get all sessions across projects
   */
  static async getAllSessions(): Promise<{ sessions: Session[]; total: number }> {
    const response = await apiClient.get<{
      success: boolean;
      data: { sessions: Session[]; total: number };
    }>('/projects/sessions/all');
    
    if (!response.success) {
      throw new Error('Failed to fetch sessions');
    }
    
    return response.data;
  }

  /**
   * Get session details by ID
   */
  static async getSessionDetail(sessionId: string): Promise<SessionDetail> {
    const response = await apiClient.get<{
      success: boolean;
      data: { session: SessionDetail };
    }>(`/sessions/${sessionId}`);
    
    if (!response.success) {
      throw new Error('Failed to fetch session details');
    }
    
    return response.data.session;
  }

  /**
   * Get project statistics
   */
  static async getProjectStats(): Promise<ProjectStats> {
    const response = await apiClient.get<{
      success: boolean;
      data: { stats: ProjectStats };
    }>('/projects/stats');
    
    if (!response.success) {
      throw new Error('Failed to fetch project statistics');
    }
    
    return response.data.stats;
  }

  /**
   * Get project insights from AIDIS MCP
   */
  static async getProjectInsights(projectId: string): Promise<ProjectInsights> {
    const response = await apiClient.get<{
      success: boolean;
      data: ProjectInsights;
    }>(`/projects/${projectId}/insights`);
    
    if (!response.success) {
      throw new Error('Failed to fetch project insights');
    }
    
    return response.data;
  }

  /**
   * Update session title and description
   */
  static async updateSession(sessionId: string, updates: UpdateSessionRequest): Promise<Session> {
    const response = await apiClient.put<{
      success: boolean;
      data: { session: Session };
    }>(`/sessions/${sessionId}`, updates);
    
    if (!response.success) {
      throw new Error('Failed to update session');
    }
    
    return response.data.session;
  }

  /**
   * Get current active session
   */
  static async getCurrentSession(): Promise<Session | null> {
    try {
      const response = await apiClient.get<{
        success: boolean;
        data: { session: Session };
      }>('/sessions/current');
      
      if (!response.success) {
        return null;
      }
      
      return response.data.session;
    } catch (error) {
      console.warn('Failed to fetch current session:', error);
      return null;
    }
  }

  /**
   * Assign current session to a project
   */
  static async assignCurrentSession(projectName: string): Promise<{
    sessionId: string;
    projectName: string;
    message: string;
  }> {
    const response = await apiClient.post<{
      success: boolean;
      data: {
        sessionId: string;
        projectName: string;
        message: string;
      };
    }>('/sessions/assign', { projectName });
    
    if (!response.success) {
      throw new Error('Failed to assign session to project');
    }
    
    return response.data;
  }
}

export default ProjectApi;
