import { EmbeddingsService } from './generated';
import type {
  EmbeddingClusterResult,
  EmbeddingDataset,
  EmbeddingProjection,
  EmbeddingQualityMetrics,
  EmbeddingSimilarityMatrix,
  EmbeddingProjectRelationships,
  EmbeddingKnowledgeGaps,
  EmbeddingUsagePatterns,
} from './generated';

const projectIdKeys = ['aidis_selected_project', 'aidis_current_project'] as const;

const readStoredProjectId = (): string | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  for (const key of projectIdKeys) {
    const stored = localStorage.getItem(key);
    if (!stored) {
      continue;
    }

    try {
      const parsed = JSON.parse(stored) as { id?: string } | string | null;
      if (typeof parsed === 'string') {
        return parsed;
      }
      if (parsed && typeof parsed === 'object' && parsed.id && parsed.id !== '00000000-0000-0000-0000-000000000000') {
        return parsed.id;
      }
    } catch {
      if (stored && stored !== '00000000-0000-0000-0000-000000000000') {
        return stored;
      }
    }
  }

  return undefined;
};

const requireProjectId = (requested?: string): string => {
  if (requested) {
    return requested;
  }

  const projectId = readStoredProjectId();
  if (!projectId) {
    throw new Error('Select a project to view embedding analytics.');
  }
  return projectId;
};

export const embeddingsClient = {
  async getDatasets(projectId?: string): Promise<EmbeddingDataset[]> {
    const effectiveProjectId = projectId ?? readStoredProjectId();
    const params: { xProjectId?: string } = {};
    if (effectiveProjectId) {
      params.xProjectId = effectiveProjectId;
    }
    return EmbeddingsService.getEmbeddingList(params);
  },

  async getSimilarityMatrix(
    datasetId: string,
    rows: number,
    cols: number,
    projectId?: string
  ): Promise<EmbeddingSimilarityMatrix> {
    const effectiveProjectId = requireProjectId(projectId);
    return EmbeddingsService.getEmbeddingSimilarity({
      xProjectId: effectiveProjectId,
      id: datasetId,
      rows,
      cols,
    });
  },

  async getProjection(
    datasetId: string,
    algorithm: string,
    sampleSize: number,
    projectId?: string
  ): Promise<EmbeddingProjection> {
    const effectiveProjectId = requireProjectId(projectId);
    return EmbeddingsService.getEmbeddingProjection({
      xProjectId: effectiveProjectId,
      id: datasetId,
      algo: algorithm,
      n: sampleSize,
    });
  },

  async getClusters(
    datasetId: string,
    clusterCount: number,
    projectId?: string
  ): Promise<EmbeddingClusterResult> {
    const effectiveProjectId = requireProjectId(projectId);
    return EmbeddingsService.getEmbeddingCluster({
      xProjectId: effectiveProjectId,
      id: datasetId,
      k: clusterCount,
    });
  },

  async getQualityMetrics(
    datasetId: string,
    projectId?: string
  ): Promise<EmbeddingQualityMetrics> {
    const effectiveProjectId = requireProjectId(projectId);
    return EmbeddingsService.getEmbeddingMetrics({
      xProjectId: effectiveProjectId,
      id: datasetId,
    });
  },

  async getProjectRelationships(projectId?: string): Promise<EmbeddingProjectRelationships> {
    const effectiveProjectId = requireProjectId(projectId);
    return EmbeddingsService.getEmbeddingRelationships({
      xProjectId: effectiveProjectId,
    });
  },

  async getKnowledgeGaps(projectId?: string): Promise<EmbeddingKnowledgeGaps> {
    const effectiveProjectId = requireProjectId(projectId);
    return EmbeddingsService.getEmbeddingKnowledgeGaps({
      xProjectId: effectiveProjectId,
    });
  },

  async getUsagePatterns(projectId?: string): Promise<EmbeddingUsagePatterns> {
    const effectiveProjectId = requireProjectId(projectId);
    return EmbeddingsService.getEmbeddingUsage({
      xProjectId: effectiveProjectId,
    });
  },
};

export default embeddingsClient;
