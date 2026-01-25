/**
 * Embedding Service Module
 * 
 * Barrel exports for embedding analytics functionality.
 * 
 * Structure:
 * - core.ts          - Shared utilities (resolveProjectId, cosineSimilarity)
 * - datasets.ts      - Available embedding datasets
 * - visualization.ts - Matrix, projection, clustering
 * - quality.ts       - Embedding quality metrics
 * - relevance.ts     - Relevance scoring analytics
 * - relationships.ts - Project relationship graphs
 * - knowledgeGap.ts  - Missing/stale tag analysis
 * - usagePatterns.ts - Activity patterns
 */

// Types
export * from './types.js';

// Core utilities
export { resolveProjectId, cosineSimilarity } from './core.js';

// Domain functions
export { getAvailableDatasets } from './datasets.js';
export { getSimilarityMatrix, getProjection, getClusters } from './visualization.js';
export { getQualityMetrics } from './quality.js';
export { getRelevanceMetrics } from './relevance.js';
export { getProjectRelationships } from './relationships.js';
export { getKnowledgeGapMetrics } from './knowledgeGap.js';
export { getUsagePatterns } from './usagePatterns.js';

// Re-export as EmbeddingService class for backward compatibility
import { resolveProjectId, cosineSimilarity } from './core.js';
import { getAvailableDatasets } from './datasets.js';
import { getSimilarityMatrix, getProjection, getClusters } from './visualization.js';
import { getQualityMetrics } from './quality.js';
import { getRelevanceMetrics } from './relevance.js';
import { getProjectRelationships } from './relationships.js';
import { getKnowledgeGapMetrics } from './knowledgeGap.js';
import { getUsagePatterns } from './usagePatterns.js';

export class EmbeddingService {
  private static resolveProjectId = resolveProjectId;
  private static cosineSimilarity = cosineSimilarity;
  
  static getAvailableDatasets = getAvailableDatasets;
  static getSimilarityMatrix = getSimilarityMatrix;
  static getProjection = getProjection;
  static getClusters = getClusters;
  static getQualityMetrics = getQualityMetrics;
  static getRelevanceMetrics = getRelevanceMetrics;
  static getProjectRelationships = getProjectRelationships;
  static getKnowledgeGapMetrics = getKnowledgeGapMetrics;
  static getUsagePatterns = getUsagePatterns;
}
