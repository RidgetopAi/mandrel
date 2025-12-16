import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api';

export interface SessionAnalytics {
  total_sessions: number;
  total_tokens_used: number;
  average_tokens_per_session: number;
  total_contexts: number;
  sessions_this_week: number;
  sessions_this_month: number;
}

export interface SessionTrend {
  date: string;
  session_count: number;
  total_tokens_used: number;
  total_contexts: number;
  total_tasks_created: number;
  total_duration_minutes: number;
  average_duration_minutes: number;
}

/**
 * Hook to fetch session analytics overview
 */
export const useSessionAnalytics = (projectId?: string) => {
  return useQuery({
    queryKey: ['sessions', 'analytics', projectId],
    queryFn: async () => {
      const url = projectId
        ? `/sessions/analytics?project_id=${projectId}`
        : '/sessions/analytics';
      const response = await apiClient.get<{ success: boolean; data: SessionAnalytics }>(url);
      return response.data; // Extract the actual analytics data from the nested response
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Hook to fetch session trends over time
 */
export const useSessionTrends = (days: number = 30, projectId?: string) => {
  return useQuery({
    queryKey: ['sessions', 'trends', days, projectId],
    queryFn: async () => {
      let url = `/sessions/trends?days=${days}`;
      if (projectId) {
        url += `&project_id=${projectId}`;
      }
      const response = await apiClient.get<{ success: boolean; data: SessionTrend[] }>(url);
      return response.data; // Extract the actual trends array from the nested response
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};
