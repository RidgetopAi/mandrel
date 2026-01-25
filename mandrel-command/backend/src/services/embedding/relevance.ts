/**
 * Embedding Relevance Metrics
 * 
 * Relevance scoring analysis for contexts.
 */

import { db } from '../../database/connection.js';
import { resolveProjectId } from './core.js';
import type { 
  EmbeddingScope, 
  RelevanceMetrics, 
  RelevanceDistributionBucket, 
  RelevanceTrendPoint, 
  RelevanceTopTag 
} from './types.js';

/**
 * Build relevance quality metrics to power the embeddings relevance dashboard.
 */
export async function getRelevanceMetrics(
  _userId: string,
  scope: EmbeddingScope
): Promise<RelevanceMetrics> {
  try {
    const projectId = await resolveProjectId(scope);
    if (!projectId) {
      throw new Error('Project context required for relevance metrics');
    }

    const params: Array<string> = [projectId];

    const buildFilters = (alias?: string, includeRelevance = false) => {
      const column = (name: string) => (alias ? `${alias}.${name}` : name);
      const filters = [`${column('project_id')} = $1`];

      if (includeRelevance) {
        filters.push(`${column('relevance_score')} IS NOT NULL`);
      }

      return filters.join(' AND ');
    };

    const totalContextsQuery = `
      SELECT COUNT(*)::int AS total_contexts
      FROM contexts
      WHERE ${buildFilters()}
    `;
    const totalContextsResult = await db.query(totalContextsQuery, params);
    const totalContexts = Number(totalContextsResult.rows[0]?.total_contexts ?? 0);

    const scoredWhere = buildFilters(undefined, true);

    const statsQuery = `
      SELECT
        COUNT(*)::int AS scored_contexts,
        AVG(relevance_score)::float AS average_score,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY relevance_score) AS median_score,
        MIN(relevance_score)::float AS min_score,
        MAX(relevance_score)::float AS max_score,
        SUM(CASE WHEN relevance_score >= 8 THEN 1 ELSE 0 END)::int AS high_confidence_count,
        SUM(CASE WHEN relevance_score < 5 THEN 1 ELSE 0 END)::int AS low_confidence_count
      FROM contexts
      WHERE ${scoredWhere}
    `;
    const statsResult = await db.query(statsQuery, params);
    const statsRow = statsResult.rows[0] ?? {};

    const scoredContexts = Number(statsRow.scored_contexts ?? 0);
    const unscoredContexts = Math.max(totalContexts - scoredContexts, 0);

    const distributionQuery = `
      SELECT
        SUM(CASE WHEN relevance_score >= 9 THEN 1 ELSE 0 END)::int AS bucket_9_10,
        SUM(CASE WHEN relevance_score >= 7 AND relevance_score < 9 THEN 1 ELSE 0 END)::int AS bucket_7_8,
        SUM(CASE WHEN relevance_score >= 5 AND relevance_score < 7 THEN 1 ELSE 0 END)::int AS bucket_5_6,
        SUM(CASE WHEN relevance_score >= 3 AND relevance_score < 5 THEN 1 ELSE 0 END)::int AS bucket_3_4,
        SUM(CASE WHEN relevance_score < 3 THEN 1 ELSE 0 END)::int AS bucket_0_2
      FROM contexts
      WHERE ${scoredWhere}
    `;
    const distributionResult = await db.query(distributionQuery, params);
    const distributionRow = distributionResult.rows[0] ?? {};

    const distributionBuckets: RelevanceDistributionBucket[] = [
      { range: '9-10', count: Number(distributionRow.bucket_9_10 ?? 0), percentage: 0 },
      { range: '7-8.9', count: Number(distributionRow.bucket_7_8 ?? 0), percentage: 0 },
      { range: '5-6.9', count: Number(distributionRow.bucket_5_6 ?? 0), percentage: 0 },
      { range: '3-4.9', count: Number(distributionRow.bucket_3_4 ?? 0), percentage: 0 },
      { range: '0-2.9', count: Number(distributionRow.bucket_0_2 ?? 0), percentage: 0 },
    ].map(bucket => ({
      ...bucket,
      percentage: scoredContexts > 0 ? bucket.count / scoredContexts : 0,
    }));

    const trendQuery = `
      SELECT
        TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS bucket_day,
        COUNT(*)::int AS sample_size,
        AVG(relevance_score)::float AS average_score
      FROM contexts
      WHERE ${scoredWhere}
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY bucket_day
      ORDER BY bucket_day
    `;
    const trendResult = await db.query(trendQuery, params);
    const trend: RelevanceTrendPoint[] = trendResult.rows.map(row => ({
      date: row.bucket_day,
      averageScore: Number(row.average_score ?? 0),
      sampleSize: Number(row.sample_size ?? 0),
    }));

    const topTagsQuery = `
      SELECT
        tag,
        COUNT(*)::int AS count,
        AVG(c.relevance_score)::float AS average_score
      FROM contexts c
      CROSS JOIN LATERAL UNNEST(c.tags) AS tag
      WHERE ${buildFilters('c', true)}
      GROUP BY tag
      ORDER BY count DESC, average_score DESC
      LIMIT 5
    `;
    const topTagsResult = await db.query(topTagsQuery, params);
    const topTags: RelevanceTopTag[] = topTagsResult.rows.map(row => ({
      tag: row.tag,
      averageScore: Number(row.average_score ?? 0),
      count: Number(row.count ?? 0),
    }));

    return {
      totalContexts,
      scoredContexts,
      unscoredContexts,
      coverageRate: totalContexts > 0 ? scoredContexts / totalContexts : 0,
      averageScore: Number(statsRow.average_score ?? 0),
      medianScore: Number(statsRow.median_score ?? 0),
      minScore: Number(statsRow.min_score ?? 0),
      maxScore: Number(statsRow.max_score ?? 0),
      highConfidenceRate: scoredContexts > 0 ? Number(statsRow.high_confidence_count ?? 0) / scoredContexts : 0,
      lowConfidenceRate: scoredContexts > 0 ? Number(statsRow.low_confidence_count ?? 0) / scoredContexts : 0,
      distribution: distributionBuckets,
      trend,
      topTags,
    };
  } catch (error) {
    console.error('Error getting relevance metrics:', error);
    throw new Error('Failed to get relevance metrics');
  }
}
