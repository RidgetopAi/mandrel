import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import decisionsClient from '../api/decisionsClient';
import type {
  DecisionSearchParams,
  DecisionSearchResult,
  DecisionStats,
  TechnicalDecision,
} from '../components/decisions/types';
import type {
  CreateDecisionRequest,
  UpdateDecisionRequest,
} from '../api/generated';

export const decisionQueryKeys = {
  all: ['decisions'] as const,
  lists: () => [...decisionQueryKeys.all, 'list'] as const,
  list: (params: DecisionSearchParams) => [...decisionQueryKeys.lists(), params] as const,
  stats: (projectId?: string) => [...decisionQueryKeys.all, 'stats', projectId ?? 'all'] as const,
  detail: (id: string) => [...decisionQueryKeys.all, 'detail', id] as const,
};

export const useDecisionSearchQuery = (
  params: DecisionSearchParams,
  options?: Partial<UseQueryOptions<DecisionSearchResult>>
) => {
  const queryKey = useMemo(() => decisionQueryKeys.list(params), [params]);

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
    queryKey: decisionQueryKeys.stats(projectId),
    queryFn: () => decisionsClient.getDecisionStats(projectId),
    ...options,
  });
};

export const useDecisionDetailQuery = (
  decisionId: string | undefined,
  options?: Partial<UseQueryOptions<TechnicalDecision>>
) => {
  return useQuery({
    queryKey: decisionQueryKeys.detail(decisionId ?? '__missing__'),
    queryFn: () => decisionsClient.getDecision(decisionId as string),
    enabled: Boolean(decisionId),
    ...options,
  });
};

export const useCreateDecision = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateDecisionRequest) => decisionsClient.createDecision(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: decisionQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: decisionQueryKeys.stats() });
    },
  });
};

export const useUpdateDecision = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateDecisionRequest }) =>
      decisionsClient.updateDecision(id, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: decisionQueryKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: decisionQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: decisionQueryKeys.stats() });
    },
  });
};

export const useDeleteDecision = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => decisionsClient.deleteDecision(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: decisionQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: decisionQueryKeys.stats() });
    },
  });
};
