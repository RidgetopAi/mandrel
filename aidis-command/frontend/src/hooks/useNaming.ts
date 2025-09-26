import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import namingClient from '../api/namingClient';
import type {
  NamingEntry,
  NamingSearchParams,
  NamingSearchResult,
  NamingStats,
  NamingSuggestion,
} from '../components/naming/types';
import type {
  RegisterNamingRequest,
  UpdateNamingRequest,
} from '../api/generated';

export const namingQueryKeys = {
  all: ['naming'] as const,
  lists: () => [...namingQueryKeys.all, 'list'] as const,
  list: (params: NamingSearchParams) => [...namingQueryKeys.lists(), params] as const,
  stats: (projectId?: string) => [...namingQueryKeys.all, 'stats', projectId ?? 'all'] as const,
  detail: (id: string) => [...namingQueryKeys.all, 'detail', id] as const,
  availability: (name: string) => [...namingQueryKeys.all, 'availability', name] as const,
  suggestions: (name: string) => [...namingQueryKeys.all, 'suggestions', name] as const,
};

export const useNamingSearchQuery = (
  params: NamingSearchParams,
  options?: Partial<UseQueryOptions<NamingSearchResult>>
) => {
  const queryKey = useMemo(() => namingQueryKeys.list(params), [params]);

  return useQuery({
    queryKey,
    queryFn: () => namingClient.search(params),
    ...options,
  });
};

export const useNamingStatsQuery = (
  projectId?: string,
  options?: Partial<UseQueryOptions<NamingStats>>
) => {
  return useQuery({
    queryKey: namingQueryKeys.stats(projectId),
    queryFn: () => namingClient.getStats(projectId),
    ...options,
  });
};

export const useNamingDetailQuery = (
  entryId: string | undefined,
  options?: Partial<UseQueryOptions<NamingEntry>>
) => {
  return useQuery({
    queryKey: namingQueryKeys.detail(entryId ?? '__missing__'),
    queryFn: () => namingClient.getEntry(entryId as string),
    enabled: Boolean(entryId),
    ...options,
  });
};

export const useRegisterNaming = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: RegisterNamingRequest) => namingClient.registerEntry(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: namingQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: namingQueryKeys.stats() });
    },
  });
};

export const useUpdateNaming = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateNamingRequest }) =>
      namingClient.updateEntry(id, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: namingQueryKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: namingQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: namingQueryKeys.stats() });
    },
  });
};

export const useDeleteNaming = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => namingClient.deleteEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: namingQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: namingQueryKeys.stats() });
    },
  });
};

export const useNameAvailability = (
  name: string | undefined,
  options?: Partial<UseQueryOptions<{ available: boolean; conflicts?: NamingEntry[]; message?: string }>>
) => {
  return useQuery({
    queryKey: namingQueryKeys.availability(name ?? '__missing__'),
    queryFn: () => namingClient.checkName(name as string),
    enabled: Boolean(name && name.length > 1),
    ...options,
  });
};

export const useNamingSuggestions = (
  name: string | undefined,
  options?: Partial<UseQueryOptions<NamingSuggestion[]>>
) => {
  return useQuery({
    queryKey: namingQueryKeys.suggestions(name ?? '__missing__'),
    queryFn: () => namingClient.getSuggestions(name as string),
    enabled: Boolean(name && name.length > 1),
    ...options,
  });
};
