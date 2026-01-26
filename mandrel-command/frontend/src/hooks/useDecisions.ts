import { useMemo } from 'react';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import decisionsClient from '../api/decisionsClient';
import type {
  DecisionSearchParams,
  DecisionSearchResult,
  DecisionStats,
} from '../components/decisions/types';

// Query keys for cache management (internal use only)
const queryKeys = {
  all: ['decisions'] as const,
  lists: () => [...queryKeys.all, 'list'] as const,
  list: (params: DecisionSearchParams) => [...queryKeys.lists(), params] as const,
  stats: (projectId?: string) => [...queryKeys.all, 'stats', projectId ?? 'all'] as const,
};

export const useDecisionSearchQuery = (
  params: DecisionSearchParams,
  options?: Partial<UseQueryOptions<DecisionSearchResult>>
) => {
  const queryKey = useMemo(() => queryKeys.list(params), [params]);

  return useQuery({
    queryKey,
    queryFn: () => decisionsClient.search(params),
    ...options,
  });
};

export const useDecisionStatsQuery = (
  projectId?: string,
  options?: Partial<UseQueryOptions<DecisionStats>>
) => {
  return useQuery({
    queryKey: queryKeys.stats(projectId),
    queryFn: () => decisionsClient.getDecisionStats(projectId),
    ...options,
  });
};

