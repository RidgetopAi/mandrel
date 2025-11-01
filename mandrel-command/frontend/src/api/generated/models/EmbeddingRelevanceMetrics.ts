/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EmbeddingRelevanceDistributionBucket } from './EmbeddingRelevanceDistributionBucket';
import type { EmbeddingRelevanceTopTag } from './EmbeddingRelevanceTopTag';
import type { EmbeddingRelevanceTrendPoint } from './EmbeddingRelevanceTrendPoint';
export type EmbeddingRelevanceMetrics = {
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
    distribution: Array<EmbeddingRelevanceDistributionBucket>;
    trend: Array<EmbeddingRelevanceTrendPoint>;
    topTags: Array<EmbeddingRelevanceTopTag>;
};

