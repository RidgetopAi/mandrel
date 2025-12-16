/**
 * QA Finding #2: React Query Hooks for Project Management
 * Replaces manual API state management with React Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ProjectsService,
  SessionsService,
  type ApiSuccessResponse,
  type CreateProjectRequest,
  type ProjectListResponse,
  type ProjectSessionsResponse,
  type ProjectStats as GeneratedProjectStats,
  type ProjectDetailResponse,
  type UpdateProjectRequest,
} from '../api/generated';
import type { Project } from '../types/project';
import type { Session, UpdateSessionRequest } from '../types/session';
import { sessionsClient } from '../api/sessionsClient';

// Query keys for cache management
type ProjectsQueryData = {
  projects: Project[];
  total: number;
  raw: ApiSuccessResponse & { data?: ProjectListResponse };
  data?: ProjectListResponse;
};

type ProjectSessionsData = {
  sessions: Session[];
  total: number;
  raw: ApiSuccessResponse & { data?: ProjectSessionsResponse };
  data?: ProjectSessionsResponse;
};

type ProjectDetailQueryData = {
  project?: Project;
  data?: Project;
  raw: ApiSuccessResponse & { data?: ProjectDetailResponse };
};

export const projectQueryKeys = {
  all: ['projects'] as const,
  lists: () => [...projectQueryKeys.all, 'list'] as const,
  list: (filters?: any) => [...projectQueryKeys.lists(), filters] as const,
  details: () => [...projectQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectQueryKeys.details(), id] as const,
  stats: () => [...projectQueryKeys.all, 'stats'] as const,
  insights: (id: string) => [...projectQueryKeys.all, 'insights', id] as const,
  sessions: (id: string) => [...projectQueryKeys.all, 'sessions', id] as const,
};

/**
 * Hook to fetch paginated projects list
 */
export const useProjects = (
  params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  },
  options?: {
    enabled?: boolean;
  }
) => {
  return useQuery({
    queryKey: projectQueryKeys.list(params),
    queryFn: () =>
      ProjectsService.getProjects({
        page: params?.page,
        limit: params?.limit,
        sortBy: params?.sortBy,
        sortOrder: params?.sortOrder,
      }),
    staleTime: 1000 * 60 * 5,
    enabled: options?.enabled,
    select: (response): ProjectsQueryData => ({
      projects: (response.data?.projects ?? []) as Project[],
      total: response.data?.total ?? 0,
      raw: response,
      data: response.data,
    }),
  });
};

/**
 * Hook to fetch single project by ID
 */
export const useProject = (id: string | undefined) => {
  return useQuery({
    queryKey: projectQueryKeys.detail(id!),
    queryFn: () => ProjectsService.getProjects1({ id: id! }),
    enabled: !!id, // Only run if ID is provided
    select: (response): ProjectDetailQueryData => ({
      project: response.data?.project as Project | undefined,
      data: response.data?.project as Project | undefined,
      raw: response,
    }),
  });
};

/**
 * Hook to fetch project statistics
 */
export const useProjectStats = () => {
  return useQuery({
    queryKey: projectQueryKeys.stats(),
    queryFn: () => ProjectsService.getProjectsStats(),
    staleTime: 1000 * 60 * 10, // 10 minutes - stats change less frequently
    select: (response) => response.data as GeneratedProjectStats,
  });
};

/**
 * Hook to fetch project insights
 */
export const useProjectInsights = (id: string | undefined) => {
  console.log('[useProjectInsights] Called with ID:', id);

  return useQuery({
    queryKey: projectQueryKeys.insights(id!),
    queryFn: () => {
      console.log('[useProjectInsights] Making API call for ID:', id);
      return ProjectsService.getProjectsInsights({ id: id! });
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 15, // 15 minutes - insights are expensive to compute
    select: (response) => {
      console.log('[useProjectInsights] API Response:', response);
      return response;  // Changed: Return the full response, not just response.data
    },
  });
};

/**
 * Hook to fetch project sessions
 */
export const useProjectSessions = (id: string | undefined) => {
  return useQuery({
    queryKey: projectQueryKeys.sessions(id!),
    queryFn: () => ProjectsService.getProjectsSessions({ id: id! }),
    enabled: !!id,
    select: (response): ProjectSessionsData => ({
      sessions: (response.data as ProjectSessionsResponse | undefined)?.sessions as Session[] ?? [],
      total: (response.data as ProjectSessionsResponse | undefined)?.total ?? 0,
      raw: response as ApiSuccessResponse & { data?: ProjectSessionsResponse },
      data: response.data as ProjectSessionsResponse | undefined,
    }),
  });
};

/**
 * Hook to create a new project
 */
export const useCreateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProjectRequest) => ProjectsService.postProjects({ requestBody: data }),
    onSuccess: (newProject) => {
      // Invalidate and refetch projects list
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.lists() });

      // Optionally add the new project to the cache
      queryClient.setQueryData(
        projectQueryKeys.detail(newProject.data?.project?.id || ''),
        newProject.data?.project as Project
      );

      // Invalidate stats since we have a new project
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.stats() });
    },
    onError: (error) => {
      console.error('Failed to create project:', error);
    },
  });
};

/**
 * Hook to update an existing project
 */
export const useUpdateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectRequest }) =>
      ProjectsService.putProjects({ id, requestBody: data }),
    onSuccess: (updatedProject, variables) => {
      // Update the specific project in cache
      queryClient.setQueryData(
        projectQueryKeys.detail(variables.id),
        updatedProject.data?.project as Project
      );

      // Invalidate projects list to ensure it's fresh
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.lists() });

      // Invalidate insights and stats that might have changed
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.insights(variables.id) });
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.stats() });
    },
    onError: (error) => {
      console.error('Failed to update project:', error);
    },
  });
};

/**
 * Hook to delete a project
 */
export const useDeleteProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ProjectsService.deleteProjects({ id }),
    onSuccess: (_, deletedId) => {
      // Remove from all project queries
      queryClient.removeQueries({ queryKey: projectQueryKeys.detail(deletedId) });
      queryClient.removeQueries({ queryKey: projectQueryKeys.insights(deletedId) });
      queryClient.removeQueries({ queryKey: projectQueryKeys.sessions(deletedId) });

      // Invalidate lists and stats
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.stats() });
    },
    onError: (error) => {
      console.error('Failed to delete project:', error);
    },
  });
};

/**
 * Hook to fetch all sessions across projects
 */
export const useAllSessions = () => {
  return useQuery({
    queryKey: ['sessions', 'all'],
    queryFn: () => ProjectsService.getProjectsSessionsAll(),
    staleTime: 1000 * 60 * 5, // 5 minutes
    select: (response): ProjectSessionsData => ({
      sessions: (response.data as ProjectSessionsResponse | undefined)?.sessions as Session[] ?? [],
      total: (response.data as ProjectSessionsResponse | undefined)?.total ?? 0,
      raw: response as ApiSuccessResponse & { data?: ProjectSessionsResponse },
      data: response.data as ProjectSessionsResponse | undefined,
    }),
  });
};

/**
 * Hook to fetch rich sessions list from /api/sessions endpoint (Phase 2.1)
 * Returns sessions with full metrics: tokens, tasks, contexts, duration
 */
export const useSessionsList = (options?: {
  projectId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) => {
  return useQuery({
    queryKey: ['sessions', 'list', options],
    queryFn: () => SessionsService.getSessions({
      projectId: options?.projectId,
      status: options?.status,
      // Default to large limit for stats pages, can be overridden
      ...(options?.limit !== undefined ? { limit: options.limit } : {}),
      ...(options?.offset !== undefined ? { offset: options.offset } : {}),
    }),
    staleTime: 1000 * 60 * 5, // 5 minutes
    select: (response) => ({
      sessions: response.data?.sessions ?? [],
      total: response.data?.total ?? 0,
      raw: response,
      data: response.data,
    }),
  });
};

// Session query keys for cache management
export const sessionQueryKeys = {
  all: ['sessions'] as const,
  lists: () => [...sessionQueryKeys.all, 'list'] as const,
  details: () => [...sessionQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...sessionQueryKeys.details(), id] as const,
  current: () => [...sessionQueryKeys.all, 'current'] as const,
};

/**
 * Hook to fetch session details by ID
 */
export const useSessionDetail = (sessionId: string | undefined) => {
  return useQuery({
    queryKey: sessionQueryKeys.detail(sessionId!),
    queryFn: () => sessionsClient.getSessionDetail(sessionId!),
    enabled: !!sessionId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Hook to fetch current active session
 */
export const useCurrentSession = () => {
  return useQuery({
    queryKey: sessionQueryKeys.current(),
    queryFn: () => sessionsClient.getCurrentSession(),
    staleTime: 1000 * 60 * 2, // 2 minutes - current session changes more frequently
  });
};

/**
 * Hook to update a session's title and description
 */
export const useUpdateSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, updates }: { sessionId: string; updates: UpdateSessionRequest }) =>
      sessionsClient.updateSession(sessionId, updates),
    onSuccess: (updatedSession, variables) => {
      // Update the specific session in cache
      queryClient.setQueryData(
        sessionQueryKeys.detail(variables.sessionId),
        updatedSession
      );

      // Invalidate session lists to ensure they're fresh
      queryClient.invalidateQueries({ queryKey: sessionQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['sessions', 'all'] });

      // Invalidate current session if this is the current one
      queryClient.invalidateQueries({ queryKey: sessionQueryKeys.current() });

      // Invalidate project sessions that might include this session
      queryClient.invalidateQueries({
        queryKey: projectQueryKeys.all,
        predicate: (query) => query.queryKey.includes('sessions')
      });
    },
    onError: (error) => {
      console.error('Failed to update session:', error);
    },
  });
};

/**
 * Hook to assign current session to a project
 */
export const useAssignCurrentSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectName: string) => sessionsClient.assignSession(projectName),
    onSuccess: () => {
      // Invalidate current session to refetch with new project assignment
      queryClient.invalidateQueries({ queryKey: sessionQueryKeys.current() });

      // Invalidate all sessions lists as assignments might affect them
      queryClient.invalidateQueries({ queryKey: sessionQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['sessions', 'all'] });

      // Invalidate project sessions for all projects
      queryClient.invalidateQueries({
        queryKey: projectQueryKeys.all,
        predicate: (query) => query.queryKey.includes('sessions')
      });
    },
    onError: (error) => {
      console.error('Failed to assign session to project:', error);
    },
  });
};