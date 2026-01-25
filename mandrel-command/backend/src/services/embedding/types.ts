/**
 * Embedding Service Types
 * 
 * Shared type definitions for embedding analytics.
 */

export interface EmbeddingDataset {
  id: string;
  name: string;
  description: string;
  count: number;
  dimensions: number;
  created_at: string;
}

export interface EmbeddingScope {
  projectId?: string;
  projectName?: string;
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

export interface Projection {
  points: Array<{
    x: number;
    y: number;
    z?: number;
    label: string;
    content: string;
    id: number;
  }>;
  algorithm: string;
  varianceExplained?: number[];
}

export interface ClusterResult {
  points: Array<{
    x: number;
    y: number;
    cluster: number;
    label: string;
    content: string;
    id: number;
  }>;
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

export interface RelevanceDistributionBucket {
  range: string;
  count: number;
  percentage: number;
}

export interface RelevanceTrendPoint {
  date: string;
  averageScore: number;
  sampleSize: number;
}

export interface RelevanceTopTag {
  tag: string;
  averageScore: number;
  count: number;
}

export interface RelevanceMetrics {
  totalContexts: number;
  scoredContexts: number;
  unscoredContexts: number;
  coverageRate: number;
  averageScore: number;
  medianScore: number;
  minScore: number;
  maxScore: number;
  highConfidenceRate: number;
  lowConfidenceRate: number;
  distribution: RelevanceDistributionBucket[];
  trend: RelevanceTrendPoint[];
  topTags: RelevanceTopTag[];
}

export interface ProjectRelationshipNode {
  projectId: string;
  projectName: string;
  contextCount: number;
  tagCount: number;
  sharedTagCount?: number;
  sharedTagStrength?: number;
}

export interface ProjectRelationshipEdge {
  sourceProjectId: string;
  targetProjectId: string;
  sharedTagCount: number;
  sharedTagStrength: number;
  topTags: string[];
}

export interface ProjectRelationshipSummary {
  totalRelatedProjects: number;
  totalSharedTagStrength: number;
  totalSharedTagCount: number;
}

export interface ProjectRelationshipResponse {
  focusProject: ProjectRelationshipNode;
  relatedProjects: ProjectRelationshipNode[];
  edges: ProjectRelationshipEdge[];
  summary: ProjectRelationshipSummary;
}

export interface KnowledgeGapMissingTag {
  tag: string;
  totalCount: number;
  projectCount: number;
  lastUsed: string | null;
  topProjects: Array<{
    projectId: string | null;
    projectName: string;
    count: number;
  }>;
}

export interface KnowledgeGapStaleTag {
  tag: string;
  lastUsed: string | null;
  daysSinceLastUsed: number;
  totalCount: number;
}

export interface KnowledgeGapTypeInsight {
  type: string;
  totalCount: number;
  globalProjectCount: number;
  averagePerProject: number;
  projectCount: number;
  gap: number;
}

export interface KnowledgeGapSummary {
  projectContextCount: number;
  projectTagCount: number;
  missingTagCount: number;
  staleTagCount: number;
  lastContextAt: string | null;
}

export interface KnowledgeGapMetrics {
  missingTags: KnowledgeGapMissingTag[];
  staleTags: KnowledgeGapStaleTag[];
  underrepresentedTypes: KnowledgeGapTypeInsight[];
  summary: KnowledgeGapSummary;
}

export interface UsagePatternMetrics {
  dailyActivity: Array<{ date: string; contexts: number }>;
  contextsByType: Array<{ type: string; count: number; percentage: number }>;
  topTags: Array<{ tag: string; count: number }>;
  hourlyDistribution: Array<{ hour: number; contexts: number }>;
  summary: {
    contextsLast7Days: number;
    contextsLast30Days: number;
    uniqueTags: number;
    totalContexts: number;
    lastContextAt: string | null;
  };
}
