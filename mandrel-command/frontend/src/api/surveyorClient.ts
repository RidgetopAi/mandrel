/**
 * Surveyor API Client
 * REST API client for Surveyor codebase analysis endpoints
 * Part of MandrelV2 Surveyor Integration - Phase 3
 */

// Base URL for Surveyor REST API endpoints
const MCP_BASE_URL = process.env.REACT_APP_MCP_URL || 'http://localhost:8080';
const SURVEYOR_API_BASE = `${MCP_BASE_URL}/api/v2/surveyor`;

// Types matching backend responses
export interface ScanStats {
  totalFiles: number;
  totalFunctions: number;
  totalClasses: number;
  totalConnections?: number;
  totalWarnings: number;
  warningsByLevel: Record<string, number>;
  nodesByType: Record<string, number>;
  analyzedCount?: number;
  pendingAnalysis?: number;
}

export interface ScanSummary {
  id: string;
  projectName: string;
  projectPath: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  healthScore: number | null;
  stats: ScanStats;
  summaryL0: string | null;
}

export interface ScanDetail extends ScanSummary {
  projectId: string;
  nodes?: Record<string, any>;
  connections?: any[];
  clusters?: any[];
  errors?: any[];
  summaries: {
    l0: string | null;
    l1: string | null;
    l2: string | null;
  };
}

export interface Warning {
  id: string;
  category: string;
  level: 'info' | 'warning' | 'error';
  title: string;
  description: string;
  affectedNodes: string[];
  filePath: string | null;
  suggestion: any | null;
  detectedAt: string;
}

export interface ProjectStats {
  totalScans: number;
  latestScan: ScanSummary | null;
  averageHealthScore: number | null;
  warningTrends: { date: string; count: number }[];
}

// API response wrapper
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Helper for fetch requests
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('aidis_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Correlation-ID': crypto.randomUUID(),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${SURVEYOR_API_BASE}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const data: ApiResponse<T> = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Request failed');
  }

  return data.data as T;
}

/**
 * Surveyor API Client
 */
export const surveyorClient = {
  /**
   * List scans for a project
   */
  async listScans(
    projectId: string,
    options?: { status?: string; limit?: number; offset?: number }
  ): Promise<{ scans: ScanSummary[]; total: number }> {
    const params = new URLSearchParams({ projectId });
    if (options?.status) params.set('status', options.status);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));

    return fetchApi(`/scans?${params}`);
  },

  /**
   * Get a single scan by ID
   */
  async getScan(scanId: string, includeNodes: boolean = false): Promise<ScanDetail> {
    const params = new URLSearchParams({ includeNodes: String(includeNodes) });
    return fetchApi(`/scans/${scanId}?${params}`);
  },

  /**
   * Trigger or store a new scan
   */
  async triggerScan(
    projectPath: string,
    projectId: string,
    scanData?: any
  ): Promise<{ scanId?: string; status: string; healthScore?: number }> {
    return fetchApi('/scan', {
      method: 'POST',
      body: JSON.stringify({ projectPath, projectId, scanData }),
    });
  },

  /**
   * Delete a scan
   */
  async deleteScan(scanId: string): Promise<{ message: string }> {
    return fetchApi(`/scans/${scanId}`, { method: 'DELETE' });
  },

  /**
   * Get warnings for a scan
   */
  async getWarnings(
    scanId: string,
    options?: {
      level?: string;
      category?: string;
      filePath?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ warnings: Warning[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.level) params.set('level', options.level);
    if (options?.category) params.set('category', options.category);
    if (options?.filePath) params.set('filePath', options.filePath);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));

    const queryString = params.toString();
    return fetchApi(`/warnings/${scanId}${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * Query nodes in a scan
   */
  async queryNodes(
    scanId: string,
    options?: {
      type?: string;
      filePath?: string;
      search?: string;
      hasFlag?: string;
    }
  ): Promise<{ nodes: any[]; count: number }> {
    const params = new URLSearchParams({ scanId });
    if (options?.type) params.set('type', options.type);
    if (options?.filePath) params.set('filePath', options.filePath);
    if (options?.search) params.set('search', options.search);
    if (options?.hasFlag) params.set('hasFlag', options.hasFlag);

    return fetchApi(`/query?${params}`);
  },

  /**
   * Get AI summary by level
   */
  async getSummary(
    scanId: string,
    level: 0 | 1 | 2 = 0
  ): Promise<{ summary: string | null; level: number }> {
    return fetchApi(`/summary/${scanId}?level=${level}`);
  },

  /**
   * Get file details (imports/exports)
   */
  async getFileDetails(
    scanId: string,
    filePath: string
  ): Promise<{ file: any }> {
    const params = new URLSearchParams({ scanId, filePath });
    return fetchApi(`/file?${params}`);
  },

  /**
   * Get project statistics
   */
  async getProjectStats(projectId: string): Promise<ProjectStats> {
    return fetchApi(`/stats/${projectId}`);
  },
};
