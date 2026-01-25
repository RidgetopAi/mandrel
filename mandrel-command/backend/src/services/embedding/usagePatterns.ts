/**
 * Usage Pattern Analytics
 * 
 * Daily activity, type breakdown, tag usage, and hourly distribution.
 */

import { db } from '../../database/connection.js';
import type { EmbeddingScope, UsagePatternMetrics } from './types.js';

/**
 * Get usage pattern metrics for a project
 */
export async function getUsagePatterns(
  _userId: string,
  scope: EmbeddingScope
): Promise<UsagePatternMetrics> {
  try {
    let projectId = scope.projectId;

    if (!projectId && scope.projectName) {
      const projectLookup = await db.query(
        `SELECT id FROM projects WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [scope.projectName]
      );
      projectId = projectLookup.rows[0]?.id || undefined;
    }

    if (!projectId) {
      throw new Error('Project context required for usage analytics.');
    }

    const [dailyActivityResult, typeBreakdownResult, tagActivityResult, hourlyResult, summaryResult] = await Promise.all([
      db.query(
        `
          SELECT
            TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
            COUNT(*) AS context_count
          FROM contexts
          WHERE project_id = $1
            AND created_at >= NOW() - INTERVAL '30 days'
          GROUP BY day
          ORDER BY day
        `,
        [projectId]
      ),
      db.query(
        `
          SELECT context_type AS type, COUNT(*) AS context_count
          FROM contexts
          WHERE project_id = $1
          GROUP BY context_type
        `,
        [projectId]
      ),
      db.query(
        `
          SELECT LOWER(tag) AS tag, COUNT(*) AS context_count
          FROM contexts
          CROSS JOIN LATERAL UNNEST(tags) AS tag
          WHERE project_id = $1
          GROUP BY tag
          ORDER BY context_count DESC
          LIMIT 10
        `,
        [projectId]
      ),
      db.query(
        `
          SELECT
            EXTRACT(HOUR FROM created_at)::int AS hour,
            COUNT(*) AS context_count
          FROM contexts
          WHERE project_id = $1
          GROUP BY hour
          ORDER BY hour
        `,
        [projectId]
      ),
      db.query(
        `
          SELECT
            COUNT(*) AS total_contexts,
            COUNT(DISTINCT LOWER(tag)) AS unique_tags,
            SUM(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END) AS contexts_last_7,
            SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END) AS contexts_last_30,
            MAX(created_at) AS last_context_at
          FROM contexts
          LEFT JOIN LATERAL UNNEST(tags) tag ON true
          WHERE project_id = $1
        `,
        [projectId]
      ),
    ]);

    const totalContexts = Number(summaryResult.rows[0]?.total_contexts ?? 0);

    const dailyActivity = dailyActivityResult.rows.map(row => ({
      date: row.day,
      contexts: Number(row.context_count ?? 0),
    }));

    const contextsByType = typeBreakdownResult.rows.map(row => ({
      type: row.type,
      count: Number(row.context_count ?? 0),
      percentage:
        totalContexts > 0 ? (Number(row.context_count ?? 0) / totalContexts) * 100 : 0,
    }));

    const topTags = tagActivityResult.rows.map(row => ({
      tag: row.tag,
      count: Number(row.context_count ?? 0),
    }));

    const hourlyDistribution = hourlyResult.rows.map(row => ({
      hour: Number(row.hour ?? 0),
      contexts: Number(row.context_count ?? 0),
    }));

    const summaryRow = summaryResult.rows[0] ?? {};

    const summary = {
      contextsLast7Days: Number(summaryRow.contexts_last_7 ?? 0),
      contextsLast30Days: Number(summaryRow.contexts_last_30 ?? 0),
      uniqueTags: Number(summaryRow.unique_tags ?? 0),
      totalContexts,
      lastContextAt: summaryRow.last_context_at
        ? new Date(summaryRow.last_context_at).toISOString()
        : null,
    };

    return {
      dailyActivity,
      contextsByType,
      topTags,
      hourlyDistribution,
      summary,
    };
  } catch (error) {
    console.error('Error getting usage pattern metrics:', error);
    throw new Error('Failed to get usage pattern metrics');
  }
}
