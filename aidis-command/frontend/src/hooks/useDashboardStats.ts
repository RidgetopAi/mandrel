import { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '../contexts/ProjectContext';
import dashboardApi, { DashboardStats } from '../services/dashboardApi';

interface UseDashboardStatsResult {
  stats: DashboardStats | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Oracle Phase 2: Dashboard stats hook with auto-refetch on project change
 */
export const useDashboardStats = (projectId?: string): UseDashboardStatsResult => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentProject } = useProjectContext();

  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('🔄 Fetching dashboard stats for project:', projectId || currentProject?.name);
      
      const dashboardStats = await dashboardApi.getDashboardStats();
      setStats(dashboardStats);
      
      console.log('✅ Dashboard stats loaded:', dashboardStats);
    } catch (error: any) {
      console.error('Failed to fetch dashboard stats:', error);
      setError(error.message || 'Failed to load dashboard data');
      
      // Don't fallback to zeros - let the UI show the error
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, currentProject?.name]);

  // Auto-refetch when ProjectContext changes (Oracle requirement)
  useEffect(() => {
    fetchStats();
  }, [fetchStats, currentProject?.id]); // Re-fetch when current project changes

  return {
    stats,
    isLoading,
    error,
    refetch: fetchStats
  };
};

export default useDashboardStats;
