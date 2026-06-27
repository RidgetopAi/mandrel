/**
 * Surveyor backend client — the command-UI's typed access to the P4c-backend
 * REST surface (Surveyor P4c-frontend, Mandrel task 7aaa4509, decision 8f330f96).
 *
 *   GET  /surveyor/projects/:projectId/graph     — nodes + connections (canvas)
 *   GET  /surveyor/projects/:projectId/file      — one file card (?file=)
 *   GET  /surveyor/projects/:projectId/findings  — findings (?minConfidence=&category=)
 *   POST /surveyor/projects/:projectId/scan      — trigger a scan of a server path
 *
 * Calls ride the shared axios `apiClient`, which already attaches the auth token
 * and the X-Project-ID header and resolves the API base URL (configs-not-
 * hardcoded — the base lives in services/api.ts, not here). Every endpoint
 * returns the backend envelope `{ success, data }`; we unwrap `data`.
 */

import { apiClient } from '../../services/api';
import { SURVEYOR_REQUEST } from '../config/request.config';

/** Scan header returned with every read (mirrors backend StoredScanHeader). */
export interface ScanHeaderDto {
  scanId: string;
  projectId: string;
  projectName: string | null;
  projectPath: string;
  status: string;
  sourceScanId: string | null;
  stats: Record<string, unknown>;
  totals: {
    files: number;
    functions: number;
    classes: number;
    connections: number;
    warnings: number;
  };
  createdAt: string;
  completedAt: string | null;
}

export interface NodeDto {
  key: string;
  type: string;
  name: string;
  filePath: string | null;
  line: number | null;
  endLine: number | null;
  data: Record<string, unknown>;
}

export interface ConnectionDto {
  key: string;
  sourceKey: string;
  targetKey: string;
  type: string;
  weight: number;
  metadata: Record<string, unknown>;
}

export interface GraphDto {
  found: boolean;
  scan: ScanHeaderDto | null;
  nodes: NodeDto[];
  connections: ConnectionDto[];
  truncated: boolean;
}

export interface WarningDto {
  key: string;
  category: string;
  level: string;
  title: string;
  description: string | null;
  affectedNodes: string[];
  suggestion: unknown;
  source: string | null;
  confidence: number | null;
  dismissible: boolean;
  detectedAt: string | null;
}

export interface FindingsDto {
  found: boolean;
  scan: ScanHeaderDto | null;
  warnings: WarningDto[];
  totalInScan: number;
  filtered: boolean;
}

/** A single function member of a file card (node + optional behavioral summary). */
export interface FileMemberDto extends NodeDto {
  summary?: {
    summary: string;
    source: string | null;
    flags: Record<string, unknown>;
    analyzedAt: string | null;
  } | null;
}

export interface FileCardDto {
  found: boolean;
  scan: ScanHeaderDto | null;
  file: {
    node: NodeDto;
    imports: unknown[];
    exports: unknown[];
    functions: FileMemberDto[];
    classes: NodeDto[];
  } | null;
}

export interface ScanSummaryDto {
  scanId: string;
  projectId: string;
  projectName: string | null;
  projectPath: string;
  status: string;
  sourceScanId: string | null;
  totals: {
    files: number;
    functions: number;
    classes: number;
    connections: number;
    warnings: number;
    functionSummaries: number;
  };
  createdAt: string;
  completedAt: string | null;
}

interface Envelope<T> {
  success: boolean;
  data: T;
  error?: string;
}

interface GetGraphParams {
  scanId?: string;
  nodeTypes?: string[];
  limit?: number;
}

interface GetFindingsParams {
  scanId?: string;
  minConfidence?: number;
  category?: string;
  limit?: number;
}

const base = (projectId: string) => `/surveyor/projects/${encodeURIComponent(projectId)}`;

export const surveyorClient = {
  async getGraph(projectId: string, params: GetGraphParams = {}): Promise<GraphDto> {
    const res = await apiClient.get<Envelope<GraphDto>>(`${base(projectId)}/graph`, {
      params: {
        scanId: params.scanId,
        nodeTypes: params.nodeTypes?.join(','),
        limit: params.limit,
      },
    });
    return res.data;
  },

  async getFindings(projectId: string, params: GetFindingsParams = {}): Promise<FindingsDto> {
    const res = await apiClient.get<Envelope<FindingsDto>>(`${base(projectId)}/findings`, {
      params: {
        scanId: params.scanId,
        minConfidence: params.minConfidence,
        category: params.category,
        limit: params.limit,
      },
    });
    return res.data;
  },

  async getFile(projectId: string, fileRef: string, scanId?: string): Promise<FileCardDto> {
    const res = await apiClient.get<Envelope<FileCardDto>>(`${base(projectId)}/file`, {
      params: { file: fileRef, scanId },
    });
    return res.data;
  },

  async scan(projectId: string, path: string, scanId?: string): Promise<ScanSummaryDto> {
    // The scan is synchronous + slow → override the client's default 10s timeout.
    const res = await apiClient.post<Envelope<{ scan: ScanSummaryDto }>>(
      `${base(projectId)}/scan`,
      { path, scanId },
      { timeout: SURVEYOR_REQUEST.scanTimeoutMs },
    );
    return res.data.scan;
  },
};
