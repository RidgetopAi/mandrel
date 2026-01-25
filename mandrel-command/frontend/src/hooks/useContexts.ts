import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import contextsClient from '../api/contextsClient';
import type {
  Context,
  ContextSearchParams,
  ContextSearchResult,
  ContextStats,
} from '../types/context';

export const contextQueryKeys = {
  all: ['contexts'] as const,
  list: (params: ContextSearchParams) => ['contexts', 'list', params] as const,
  stats: () => ['contexts', 'stats'] as const,
  detail: (id: string) => ['contexts', 'detail', id] as const,
  related: (id: string) => ['contexts', 'related', id] as const,
};

export const useContextSearchQuery = (
  params: ContextSearchParams,
  options?: Partial<UseQueryOptions<ContextSearchResult>>
) => {
  // Stabilize params to prevent unnecessary re-renders
  const tagsJson = JSON.stringify(params.tags || []);
  const stableParams = useMemo(() => {
    return params;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params.query,
    params.type,
    tagsJson,
    params.date_from,
    params.date_to,
    params.project_id,
    params.min_similarity,
    params.sort_by,
    params.sort_order,
    params.limit,
    params.offset
  ]);

  const queryKey = useMemo(() => contextQueryKeys.list(stableParams), [stableParams]);

  return useQuery({
  queryKey,
  queryFn: () => contextsClient.search(stableParams),
  ...options,
  });
};

export const useContextStatsQuery = (options?: Partial<UseQueryOptions<ContextStats>>) => {
  return useQuery({
    queryKey: contextQueryKeys.stats(),
    queryFn: () => contextsClient.getContextStats(),
    staleTime: 1000 * 60 * 5,
    ...options,
  });
};

const useContextDetailQuery = (id: string | undefined, options?: Partial<UseQueryOptions<Context>>) => {
  return useQuery({
    queryKey: contextQueryKeys.detail(id ?? '__missing__'),
    queryFn: () => contextsClient.getContext(id as string),
    enabled: Boolean(id),
    ...options,
  });
};

export const useRelatedContextsQuery = (id: string | undefined, enabled = true) => {
  return useQuery<Context[]>({
    queryKey: contextQueryKeys.related(id ?? '__missing__'),
    queryFn: () => contextsClient.getRelatedContexts(id as string),
    enabled: Boolean(id) && enabled,
  });
};

export const useUpdateContext = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof contextsClient.updateContext>[1] }) =>
      contextsClient.updateContext(id, updates),
    onSuccess: (updatedContext) => {
      queryClient.invalidateQueries({
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'contexts' && query.queryKey[1] === 'list',
      });
      queryClient.invalidateQueries({ queryKey: contextQueryKeys.detail(updatedContext.id) });
    },
  });
};

export const useDeleteContext = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => contextsClient.deleteContext(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'contexts' && query.queryKey[1] === 'list',
      });
      queryClient.invalidateQueries({ queryKey: contextQueryKeys.stats() });
    },
  });
};

export const useBulkDeleteContexts = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => contextsClient.bulkDeleteContexts(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'contexts' && query.queryKey[1] === 'list',
      });
      queryClient.invalidateQueries({ queryKey: contextQueryKeys.stats() });
    },
  });
};

export const useBulkUpdateContexts = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, updates }: {
      ids: string[];
      updates: {
        project_id?: string;
        tags?: string[];
        relevance_score?: number;
      }
    }) => contextsClient.bulkUpdateContexts(ids, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'contexts' && query.queryKey[1] === 'list',
      });
      queryClient.invalidateQueries({ queryKey: contextQueryKeys.stats() });
    },
  });
};

const useSemanticContextSearch = () => {
  return useMutation({
    mutationFn: (params: ContextSearchParams) => contextsClient.semanticSearch(params),
  });
};
