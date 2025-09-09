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

export interface SessionAnalytics {
  total_sessions: number;
  total_duration_minutes: number;
  average_duration_minutes: number;
  total_contexts: number;
  average_contexts_per_session: number;
  total_tokens_used: number;
  average_tokens_per_session: number;
  active_sessions_today: number;
  sessions_this_week: number;
  sessions_this_month: number;
}

export interface SessionTrend {
  date: string;
  session_count: number;
  total_duration_minutes: number;
  total_contexts: number;
  total_tokens_used: number;
  average_duration_minutes: number;
}

export interface ProductiveSession {
  id: string;
  project_id: string;
  project_name?: string;
  created_at: string;
  duration_minutes: number;
  context_count: number;
  tokens_used: number;
  productivity_score: number;
  context_summary?: string;
}

export interface TokenUsagePattern {
  hour: number;
  total_tokens: number;
  session_count: number;
  average_tokens_per_session: number;
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
   * Get session analytics
   */
  static async getSessionAnalytics(projectId?: string): Promise<SessionAnalytics> {
    const params = projectId ? `?project_id=${projectId}` : '';
    const response = await apiClient.get<{
      success: boolean;
      data: { analytics: SessionAnalytics };
    }>(`/sessions/analytics${params}`);
    
    if (!response.success) {
      throw new Error('Failed to fetch session analytics');
    }
    
    return response.data.analytics;
  }

  /**
   * Get session trends over time
   */
  static async getSessionTrends(days: number = 30, projectId?: string): Promise<SessionTrend[]> {
    const params = new URLSearchParams();
    params.append('days', days.toString());
    if (projectId) params.append('project_id', projectId);
    
    const response = await apiClient.get<{
      success: boolean;
      data: { trends: SessionTrend[] };
    }>(`/sessions/trends?${params}`);
    
    if (!response.success) {
      throw new Error('Failed to fetch session trends');
    }
    
    return response.data.trends;
  }

  /**
   * Get most productive sessions
   */
  static async getProductiveSessions(limit: number = 10, projectId?: string): Promise<ProductiveSession[]> {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    if (projectId) params.append('project_id', projectId);
    
    const response = await apiClient.get<{
      success: boolean;
      data: { sessions: ProductiveSession[] };
    }>(`/sessions/productive?${params}`);
    
    if (!response.success) {
      throw new Error('Failed to fetch productive sessions');
    }
    
    return response.data.sessions;
  }

  /**
   * Get token usage patterns by hour
   */
  static async getTokenUsagePatterns(projectId?: string): Promise<TokenUsagePattern[]> {
    const params = projectId ? `?project_id=${projectId}` : '';
    const response = await apiClient.get<{
      success: boolean;
      data: { patterns: TokenUsagePattern[] };
    }>(`/sessions/token-patterns${params}`);
    
    if (!response.success) {
      throw new Error('Failed to fetch token usage patterns');
    }
    
    return response.data.patterns;
  }
}

export default ProjectApi;
