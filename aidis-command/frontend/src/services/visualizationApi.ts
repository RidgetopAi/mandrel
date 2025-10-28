/**
 * Visualization API Service
 * Provides access to dependency analysis and visualization endpoints on MCP server
 * Endpoints: http://localhost:8080/api/v2/analyze/* and /api/v2/visualizations/*
 */

import axios, { AxiosInstance } from 'axios';

// MCP Server base URL (where visualization API lives)
const MCP_BASE_URL = process.env.REACT_APP_MCP_URL || 'http://localhost:8080';

// Request/Response Types
export interface DependencyAnalysisOptions {
  targetPath?: string;
  extensions?: string[];
  tsConfig?: string;
  generateGraph?: boolean;
  exportJSON?: boolean;
  graphFormat?: 'svg' | 'png' | 'dot';
  graphLayout?: 'dot' | 'neato' | 'fdp' | 'sfdp' | 'circo' | 'twopi';
}

export interface CircularDependency {
  chain: string[];
  length: number;
}

export interface ComplexModule {
  file: string;
  dependencies: number;
}

export interface DependencyAnalysisResult {
  summary: {
    filesAnalyzed: number;
    totalDependencies: number;
    circularDependencies: number;
    orphanFiles: number;
    leafModules: number;
    executionTime: number;
  };
  circular: CircularDependency[];
  orphans: string[];
  graphPath?: string;
  jsonPath?: string;
}

// Backend API response structure
interface BackendAnalysisResponse {
  success: boolean;
  data: {
    summary: {
      fileCount: number;
      dependencyCount: number;
      circularCount: number;
      orphanCount: number;
      leafCount: number;
      analysisTime: number;
    };
    circular: CircularDependency[];
    orphans: string[];
    graphPath?: string;
    jsonPath?: string;
  };
}

export interface CircularDependenciesResult {
  count: number;
  circular: CircularDependency[];
}

export interface ComplexModulesResult {
  modules: ComplexModule[];
}

export interface GraphGenerationOptions {
  targetPath?: string;
  format?: 'svg' | 'png' | 'dot';
  layout?: 'dot' | 'neato' | 'fdp' | 'sfdp' | 'circo' | 'twopi';
  extensions?: string[];
  tsConfig?: string;
}

export interface GraphGenerationResult {
  graphPath: string;
  format: string;
  size: number;
}

export interface VisualizationFile {
  name: string;
  size: number;
  created: string;
  type: 'svg' | 'png' | 'json' | 'dot';
}

export interface VisualizationsListResult {
  files: VisualizationFile[];
  count: number;
}

/**
 * Visualization API Client
 * Communicates with MCP Server visualization endpoints
 */
class VisualizationApi {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: MCP_BASE_URL,
      timeout: 60000, // 60 seconds for analysis operations
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('Visualization API Error:', error.response?.data || error.message);

        const apiError = {
          message: error.response?.data?.error || error.message || 'Unknown error occurred',
          status: error.response?.status,
          details: error.response?.data,
        };

        return Promise.reject(apiError);
      }
    );
  }

  /**
   * Run full dependency analysis with optional graph and JSON export
   * POST /api/v2/analyze/dependencies
   */
  async analyzeDependencies(options: DependencyAnalysisOptions = {}): Promise<DependencyAnalysisResult> {
    const response = await this.client.post<BackendAnalysisResponse>(
      '/api/v2/analyze/dependencies',
      {
        targetPath: options.targetPath || 'src/main.ts',
        extensions: options.extensions || ['ts', 'tsx', 'js', 'jsx'],
        tsConfig: options.tsConfig || 'tsconfig.json',
        generateGraph: options.generateGraph ?? true,
        exportJSON: options.exportJSON ?? true,
        graphFormat: options.graphFormat || 'svg',
        graphLayout: options.graphLayout || 'dot',
      }
    );

    // Transform backend response to frontend format
    const backendData = response.data.data;
    return {
      summary: {
        filesAnalyzed: backendData.summary.fileCount,
        totalDependencies: backendData.summary.dependencyCount,
        circularDependencies: backendData.summary.circularCount,
        orphanFiles: backendData.summary.orphanCount,
        leafModules: backendData.summary.leafCount,
        executionTime: backendData.summary.analysisTime,
      },
      circular: backendData.circular,
      orphans: backendData.orphans,
      graphPath: backendData.graphPath,
      jsonPath: backendData.jsonPath,
    };
  }

  /**
   * Get circular dependencies only
   * GET /api/v2/analyze/circular?targetPath=...&extensions=...
   */
  async getCircularDependencies(
    targetPath: string = 'src/main.ts',
    extensions: string[] = ['ts', 'tsx', 'js', 'jsx'],
    tsConfig: string = 'tsconfig.json'
  ): Promise<CircularDependenciesResult> {
    const params = new URLSearchParams({
      targetPath,
      extensions: extensions.join(','),
      tsConfig,
    });

    const response = await this.client.get<{ success: boolean; data: CircularDependenciesResult }>(
      `/api/v2/analyze/circular?${params.toString()}`
    );
    return response.data.data;
  }

  /**
   * Get most complex modules (highest dependency counts)
   * GET /api/v2/analyze/complex?targetPath=...&limit=10
   */
  async getComplexModules(
    targetPath: string = 'src/main.ts',
    limit: number = 10,
    extensions: string[] = ['ts', 'tsx', 'js', 'jsx']
  ): Promise<ComplexModulesResult> {
    const params = new URLSearchParams({
      targetPath,
      limit: limit.toString(),
      extensions: extensions.join(','),
    });

    const response = await this.client.get<{ success: boolean; data: ComplexModulesResult }>(
      `/api/v2/analyze/complex?${params.toString()}`
    );
    return response.data.data;
  }

  /**
   * Generate graph visualization only (no full analysis)
   * POST /api/v2/analyze/graph
   */
  async generateGraph(options: GraphGenerationOptions = {}): Promise<GraphGenerationResult> {
    const response = await this.client.post<{ success: boolean; data: GraphGenerationResult }>(
      '/api/v2/analyze/graph',
      {
        targetPath: options.targetPath || 'src/main.ts',
        format: options.format || 'svg',
        layout: options.layout || 'dot',
        extensions: options.extensions || ['ts', 'tsx', 'js', 'jsx'],
        tsConfig: options.tsConfig || 'tsconfig.json',
      }
    );
    return response.data.data;
  }

  /**
   * List all generated visualization files
   * GET /api/v2/visualizations
   */
  async listVisualizations(): Promise<VisualizationsListResult> {
    const response = await this.client.get<{ success: boolean; data: { files: VisualizationFile[]; count: number } }>('/api/v2/visualizations');
    return response.data.data;
  }

  /**
   * Download a specific visualization file
   * GET /api/v2/visualizations/:filename
   * Returns blob for download
   */
  async downloadVisualization(filename: string): Promise<Blob> {
    const response = await this.client.get(`/api/v2/visualizations/${filename}`, {
      responseType: 'blob',
    });
    return response.data;
  }

  /**
   * Helper: Get visualization URL for direct display (e.g., in iframe or img tag)
   */
  getVisualizationUrl(filename: string): string {
    return `${MCP_BASE_URL}/api/v2/visualizations/${filename}`;
  }

  /**
   * Helper: Trigger browser download of visualization file
   */
  async triggerDownload(filename: string): Promise<void> {
    const blob = await this.downloadVisualization(filename);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}

// Export singleton instance
const visualizationApi = new VisualizationApi();
export default visualizationApi;
