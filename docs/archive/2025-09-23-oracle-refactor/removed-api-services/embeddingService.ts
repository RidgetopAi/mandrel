import { apiClient } from './api';

const API_BASE = '/api/embedding';

export interface EmbeddingDataset {
  id: string;
  name: string;
  description: string;
  count: number;
  dimensions: number;
  created_at: string;
}

export interface SimilarityMatrix {
  matrix: number[][];
  labels: string[];
  metadata: {
    rows: number;
    cols: number;
    datasetId: string;
  };
}

export interface ProjectionPoint {
  x: number;
  y: number;
  z?: number;
  label: string;
  content: string;
  id: number;
}

export interface Projection {
  points: ProjectionPoint[];
  algorithm: string;
  varianceExplained?: number[];
}

export interface ClusterPoint {
  x: number;
  y: number;
  cluster: number;
  label: string;
  content: string;
  id: number;
}

export interface ClusterResult {
  points: ClusterPoint[];
  centroids: Array<{ x: number; y: number; cluster: number }>;
  k: number;
  inertia: number;
}

export interface QualityMetrics {
  totalEmbeddings: number;
  averageNorm: number;
  dimensionality: number;
  densityMetrics: {
    avgDistance: number;
    minDistance: number;
    maxDistance: number;
    stdDistance: number;
  };
  distributionStats: {
    mean: number[];
    std: number[];
    min: number[];
    max: number[];
  };
}

export class EmbeddingService {
  /**
   * Get available embedding datasets
   */
  static async getDatasets(projectName?: string): Promise<EmbeddingDataset[]> {
    const headers = projectName ? { project: projectName } : {};
    const response = await apiClient.instance.get(`${API_BASE}/list`, { headers });
    return response.data;
  }

  /**
   * Get similarity matrix for heatmap visualization
   */
  static async getSimilarityMatrix(
    datasetId: string,
    rows: number = 50,
    cols: number = 50,
    projectName?: string
  ): Promise<SimilarityMatrix> {
    const headers = projectName ? { project: projectName } : {};
    const response = await apiClient.instance.get(
      `${API_BASE}/similarity?id=${datasetId}&rows=${rows}&cols=${cols}`,
      { headers }
    );
    return response.data;
  }

  /**
   * Get 2D/3D projection for scatter plot
   */
  static async getProjection(
    datasetId: string,
    algorithm: string = 'pca',
    n: number = 1000,
    projectName?: string
  ): Promise<Projection> {
    const headers = projectName ? { project: projectName } : {};
    const response = await apiClient.instance.get(
      `${API_BASE}/projection?id=${datasetId}&algo=${algorithm}&n=${n}`,
      { headers }
    );
    return response.data;
  }

  /**
   * Get clustering results
   */
  static async getClusters(
    datasetId: string,
    k: number = 8,
    projectName?: string
  ): Promise<ClusterResult> {
    const headers = projectName ? { project: projectName } : {};
    const response = await apiClient.instance.get(
      `${API_BASE}/cluster?id=${datasetId}&k=${k}`,
      { headers }
    );
    return response.data;
  }

  /**
   * Get embedding quality metrics
   */
  static async getMetrics(
    datasetId: string,
    projectName?: string
  ): Promise<QualityMetrics> {
    const headers = projectName ? { project: projectName } : {};
    const response = await apiClient.instance.get(
      `${API_BASE}/metrics?id=${datasetId}`,
      { headers }
    );
    return response.data;
  }
}
