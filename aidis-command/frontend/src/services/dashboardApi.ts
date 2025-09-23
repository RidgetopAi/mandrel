/**
 * Dashboard API service - Phase 6 Migration
 * Uses React Query hooks instead of direct API calls
 * Legacy code kept for backward compatibility during migration
 */

import { DashboardService } from '../api/generated';

export interface DashboardStats {
  contexts: number;
  projects: number;
  activeTasks: number;
  totalTasks?: number;
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

/**
 * Dashboard API service class
 * Phase 6: Migrated to use generated OpenAPI client
 */
class DashboardApi {
  /**
   * Get comprehensive dashboard statistics
   * Phase 6: Uses generated DashboardService
   */
  async getDashboardStats(): Promise<DashboardStats> {
    try {
      const response = await DashboardService.getDashboardStats();

      if (!response.data) {
        throw new Error('Invalid response from dashboard stats endpoint');
      }

      // Transform to frontend DashboardStats format
      const dashboardStats: DashboardStats = {
        contexts: response.data.contexts ?? 0,
        projects: response.data.projects ?? 0,
        activeTasks: response.data.activeTasks ?? 0,
        totalTasks: response.data.totalTasks ?? 0,
        recentActivity: {
          contextsThisWeek: response.data.recentActivity?.contextsThisWeek ?? 0,
          sessionsThisWeek: response.data.recentActivity?.tasksCompletedThisWeek ?? 0
        }
      };

      console.log('✅ Phase 6 Dashboard - Generated API Stats:', dashboardStats);
      return dashboardStats;

    } catch (error) {
      console.error('❌ Phase 6 Dashboard API Error:', error);
      throw error;
    }
  }

  /**
   * Get project statistics
   * TODO: Migrate to ProjectsService when available
   */
  async getProjectStats(): Promise<ProjectStats> {
    try {
      // Temporary fallback to fetch until ProjectsService is migrated
      const response = await fetch('/api/projects/stats');
      const data = await response.json();
      return data.data?.stats ?? data;
    } catch (error) {
      console.error('Project stats fetch error:', error);
      throw error;
    }
  }

  /**
   * Get context statistics
   * TODO: Migrate to ContextsService when available
   */
  async getContextStats(projectId?: string): Promise<ContextStats> {
    try {
      // Temporary fallback to fetch until ContextsService is migrated
      const url = projectId ? `/api/contexts/stats?project_id=${projectId}` : '/api/contexts/stats';
      const response = await fetch(url);
      const data = await response.json();
      return data.data ?? data;
    } catch (error) {
      console.error('Context stats fetch error:', error);
      throw error;
    }
  }
}

const dashboardApiInstance = new DashboardApi();
export default dashboardApiInstance;

// Export the hooks for components that want to use React Query directly
export { useDashboardStats, useProjectStats, useContextStats } from '../hooks/useDashboard';