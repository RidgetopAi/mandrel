/**
 * Surveyor Data Hooks
 * React Query hooks for Surveyor data fetching and caching
 * Part of MandrelV2 Surveyor Integration - Phase 3
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  surveyorClient,
  type ScanSummary,
  type ScanDetail,
  type Warning,
  type ProjectStats,
} from '../api/surveyorClient';

// Query keys for cache management
export const surveyorKeys = {
  all: ['surveyor'] as const,
  scans: (projectId: string) => [...surveyorKeys.all, 'scans', projectId] as const,
  scan: (scanId: string) => [...surveyorKeys.all, 'scan', scanId] as const,
  scanWithNodes: (scanId: string) => [...surveyorKeys.all, 'scan', scanId, 'nodes'] as const,
  warnings: (scanId: string) => [...surveyorKeys.all, 'warnings', scanId] as const,
  nodes: (scanId: string, filters: any) => [...surveyorKeys.all, 'nodes', scanId, filters] as const,
  summary: (scanId: string, level: number) => [...surveyorKeys.all, 'summary', scanId, level] as const,
  fileDetails: (scanId: string, filePath: string) => [...surveyorKeys.all, 'file', scanId, filePath] as const,
  projectStats: (projectId: string) => [...surveyorKeys.all, 'stats', projectId] as const,
};

/**
 * Hook to list scans for a project
 */
export function useScans(
  projectId: string | undefined,
  options?: { status?: string; limit?: number; offset?: number }
) {
  return useQuery({
    queryKey: surveyorKeys.scans(projectId || ''),
    queryFn: () => surveyorClient.listScans(projectId!, options),
    enabled: !!projectId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to get a single scan
 */
export function useScan(scanId: string | undefined, includeNodes: boolean = false) {
  return useQuery({
    queryKey: includeNodes ? surveyorKeys.scanWithNodes(scanId || '') : surveyorKeys.scan(scanId || ''),
    queryFn: () => surveyorClient.getScan(scanId!, includeNodes),
    enabled: !!scanId,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to get warnings for a scan
 */
export function useWarnings(
  scanId: string | undefined,
  options?: {
    level?: string;
    category?: string;
    filePath?: string;
    limit?: number;
  }
) {
  return useQuery({
    queryKey: surveyorKeys.warnings(scanId || ''),
    queryFn: () => surveyorClient.getWarnings(scanId!, options),
    enabled: !!scanId,
    staleTime: 60000,
  });
}

/**
 * Hook to query nodes in a scan
 */
export function useNodes(
  scanId: string | undefined,
  filters?: {
    type?: string;
    filePath?: string;
    search?: string;
    hasFlag?: string;
  }
) {
  return useQuery({
    queryKey: surveyorKeys.nodes(scanId || '', filters),
    queryFn: () => surveyorClient.queryNodes(scanId!, filters),
    enabled: !!scanId,
    staleTime: 60000,
  });
}

/**
 * Hook to get AI summary
 */
export function useSummary(scanId: string | undefined, level: 0 | 1 | 2 = 0) {
  return useQuery({
    queryKey: surveyorKeys.summary(scanId || '', level),
    queryFn: () => surveyorClient.getSummary(scanId!, level),
    enabled: !!scanId,
    staleTime: 300000, // 5 minutes - summaries don't change
  });
}

/**
 * Hook to get file details
 */
export function useFileDetails(scanId: string | undefined, filePath: string | undefined) {
  return useQuery({
    queryKey: surveyorKeys.fileDetails(scanId || '', filePath || ''),
    queryFn: () => surveyorClient.getFileDetails(scanId!, filePath!),
    enabled: !!scanId && !!filePath,
    staleTime: 60000,
  });
}

/**
 * Hook to get project statistics
 */
export function useProjectStats(projectId: string | undefined) {
  return useQuery({
    queryKey: surveyorKeys.projectStats(projectId || ''),
    queryFn: () => surveyorClient.getProjectStats(projectId!),
    enabled: !!projectId,
    staleTime: 60000,
  });
}

/**
 * Hook to trigger a new scan
 */
export function useTriggerScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectPath,
      projectId,
      scanData,
    }: {
      projectPath: string;
      projectId: string;
      scanData?: any;
    }) => surveyorClient.triggerScan(projectPath, projectId, scanData),
    onSuccess: (_, variables) => {
      // Invalidate scans list for the project
      queryClient.invalidateQueries({
        queryKey: surveyorKeys.scans(variables.projectId),
      });
      // Invalidate project stats
      queryClient.invalidateQueries({
        queryKey: surveyorKeys.projectStats(variables.projectId),
      });
    },
  });
}

/**
 * Hook to delete a scan
 */
export function useDeleteScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (scanId: string) => surveyorClient.deleteScan(scanId),
    onSuccess: () => {
      // Invalidate all surveyor queries
      queryClient.invalidateQueries({ queryKey: surveyorKeys.all });
    },
  });
}

/**
 * Hook to get the latest scan for a project
 */
export function useLatestScan(projectId: string | undefined) {
  const scansQuery = useScans(projectId, { limit: 1 });

  return {
    ...scansQuery,
    data: scansQuery.data?.scans?.[0] ?? null,
  };
}

/**
 * Hook to check if AI analysis is available
 */
export function useAnalyzeStatus() {
  return useQuery({
    queryKey: [...surveyorKeys.all, 'analyzeStatus'],
    queryFn: () => surveyorClient.getAnalyzeStatus(),
    staleTime: 300000, // 5 minutes - status doesn't change often
    retry: false, // Don't retry if API key not configured
  });
}

/**
 * Hook to trigger AI behavioral analysis on a scan
 */
export function useTriggerAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      scanId,
      options,
    }: {
      scanId: string;
      options?: { skipAnalyzed?: boolean; maxFunctions?: number };
    }) => surveyorClient.triggerAnalysis(scanId, options),
    onSuccess: (data, variables) => {
      // Invalidate the scan with nodes to refresh behavioral data
      queryClient.invalidateQueries({
        queryKey: surveyorKeys.scanWithNodes(variables.scanId),
      });
      // Also invalidate the scan without nodes
      queryClient.invalidateQueries({
        queryKey: surveyorKeys.scan(variables.scanId),
      });
    },
  });
}
