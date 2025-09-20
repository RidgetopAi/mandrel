import { apiClient } from './api';

export interface DashboardStats {
  contexts: number;
  projects: number;
  activeTasks: number;
  totalTasks?: number;      // Oracle Phase 2: Include total tasks
  recentActivity?: {
    contextsThisWeek: number;
    sessionsThisWeek: number;
  };
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

export interface ContextStats {
  total_contexts: number;
  recent_contexts: number;
  total_projects: number;
  by_type: Record<string, number>;
  by_project: Record<string, number>;
}

class DashboardApi {
  /**
   * Get comprehensive dashboard statistics
   * Oracle Phase 2: Use new /dashboard/stats endpoint with real counts
   */
  async getDashboardStats(): Promise<DashboardStats> {
    try {
      // Oracle Phase 2: Use real dashboard endpoint for aggregated counts
      const response = await apiClient.get<{ 
        success: boolean; 
        data: {
          contexts: number;
          activeTasks: number;
          totalTasks: number;
          projects: number;
          recentActivity: {
            contextsThisWeek: number;
            tasksCompletedThisWeek: number;
          };
        }
      }>('/dashboard/stats');

      // Extract data from API response
      // Backend returns: { success: true, data: { contexts, activeTasks, ... } }
      // API client returns the whole response, so we need response.data
      const apiData = response.data;
      
      console.log('📊 Oracle Phase 2 Dashboard - API Response:', {
        response: response,
        extractedData: apiData,
        endpoint: '/dashboard/stats'
      });

      // Transform to frontend DashboardStats format (no hardcoded zeros!)
      const dashboardStats: DashboardStats = {
        contexts: apiData.contexts,
        projects: apiData.projects,
        activeTasks: apiData.activeTasks,
        recentActivity: {
          contextsThisWeek: apiData.recentActivity.contextsThisWeek,
          sessionsThisWeek: apiData.recentActivity.tasksCompletedThisWeek
        }
      };
      
      console.log('✅ Oracle Phase 2 Dashboard - Final Stats:', dashboardStats);
      return dashboardStats;
      
    } catch (error) {
      console.error('❌ Oracle Phase 2 Dashboard API Error:', error);
      throw error;
    }
  }

  /**
   * Get project statistics
   */
  async getProjectStats(): Promise<ProjectStats> {
    try {
      const response = await apiClient.get<{ success: boolean; data: { stats: ProjectStats } }>('/projects/stats');
      return response.data.stats;
    } catch (error) {
      console.error('Project stats fetch error:', error);
      throw error;
    }
  }

  /**
   * Get context statistics
   */
  async getContextStats(projectId?: string): Promise<ContextStats> {
    try {
      const url = projectId ? `/contexts/stats?project_id=${projectId}` : '/contexts/stats';
      const response = await apiClient.get<{ success: boolean; data: ContextStats }>(url);
      return response.data;
    } catch (error) {
      console.error('Context stats fetch error:', error);
      throw error;
    }
  }
}

const dashboardApiInstance = new DashboardApi();
export default dashboardApiInstance;
