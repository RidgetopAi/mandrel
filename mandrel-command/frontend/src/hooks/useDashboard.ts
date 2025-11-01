/**
 * React Query hooks for dashboard data
 * Phase 6: Uses generated OpenAPI client instead of legacy apiClient
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { DashboardService } from '../api/generated';

export interface DashboardStats {
  contexts: number;
  projects: number;
  activeTasks: number;
  totalTasks: number;
  recentActivity: {
    contextsThisWeek: number;
    sessionsThisWeek: number;
  };
}

/**
 * Hook to fetch dashboard statistics
 * @param options Optional React Query options
 */
export function useDashboardStats(
  options?: Omit<UseQueryOptions<DashboardStats, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: async (): Promise<DashboardStats> => {
      const response = await DashboardService.getDashboardStats();

      // Transform the response to match the expected interface
      if (!response.data) {
        throw new Error('Invalid response from dashboard stats endpoint');
      }

      return {
        contexts: response.data.contexts ?? 0,
        projects: response.data.projects ?? 0,
        activeTasks: response.data.activeTasks ?? 0,
        totalTasks: response.data.totalTasks ?? 0,
        recentActivity: {
          contextsThisWeek: response.data.recentActivity?.contextsThisWeek ?? 0,
          sessionsThisWeek: response.data.recentActivity?.tasksCompletedThisWeek ?? 0,
        },
      };
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 15000, // Consider data stale after 15 seconds
    ...options,
  });
}

/**
 * Hook to fetch project statistics
 * Note: Uses ProjectsService which is already generated
 */
export function useProjectStats(
  options?: Omit<UseQueryOptions<any, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: ['projects', 'stats'],
    queryFn: async () => {
      // Import will be added when migrating ProjectsService
      const response = await fetch('/api/projects/stats').then(r => r.json());
      return response.data ?? response;
    },
    staleTime: 30000,
    ...options,
  });
}

/**
 * Hook to fetch context statistics
 * Note: Uses ContextsService which is already generated
 * @param projectId Optional project ID to filter by
 */
export function useContextStats(
  projectId?: string,
  options?: Omit<UseQueryOptions<any, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: ['contexts', 'stats', projectId],
    queryFn: async () => {
      // Import will be added when migrating ContextsService
      const response = await fetch(`/api/contexts/stats${projectId ? `?project_id=${projectId}` : ''}`).then(r => r.json());
      return response.data ?? response;
    },
    enabled: true,
    staleTime: 30000,
    ...options,
  });
}