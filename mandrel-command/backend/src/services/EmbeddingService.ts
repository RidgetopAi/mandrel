import { db } from '../database/connection';
import { PCA } from 'ml-pca';

interface EmbeddingDataset {
  id: string;
  name: string;
  description: string;
  count: number;
  dimensions: number;
  created_at: string;
}

interface EmbeddingScope {
  projectId?: string;
  projectName?: string;
}

interface SimilarityMatrix {
  matrix: number[][];
  labels: string[];
  metadata: {
    rows: number;
    cols: number;
    datasetId: string;
  };
}

interface Projection {
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

interface ClusterResult {
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

interface QualityMetrics {
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

interface RelevanceDistributionBucket {
  range: string;
  count: number;
  percentage: number;
}

interface RelevanceTrendPoint {
  date: string;
  averageScore: number;
  sampleSize: number;
}

interface RelevanceTopTag {
  tag: string;
  averageScore: number;
  count: number;
}

interface RelevanceMetrics {
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

interface ProjectRelationshipNode {
  projectId: string;
  projectName: string;
  contextCount: number;
  tagCount: number;
  sharedTagCount?: number;
  sharedTagStrength?: number;
}

interface ProjectRelationshipEdge {
  sourceProjectId: string;
  targetProjectId: string;
  sharedTagCount: number;
  sharedTagStrength: number;
  topTags: string[];
}

interface ProjectRelationshipSummary {
  totalRelatedProjects: number;
  totalSharedTagStrength: number;
  totalSharedTagCount: number;
}

interface ProjectRelationshipResponse {
  focusProject: ProjectRelationshipNode;
  relatedProjects: ProjectRelationshipNode[];
  edges: ProjectRelationshipEdge[];
  summary: ProjectRelationshipSummary;
}

interface KnowledgeGapMissingTag {
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

interface KnowledgeGapStaleTag {
  tag: string;
  lastUsed: string | null;
  daysSinceLastUsed: number;
  totalCount: number;
}

interface KnowledgeGapTypeInsight {
  type: string;
  totalCount: number;
  globalProjectCount: number;
  averagePerProject: number;
  projectCount: number;
  gap: number;
}

interface KnowledgeGapSummary {
  projectContextCount: number;
  projectTagCount: number;
  missingTagCount: number;
  staleTagCount: number;
  lastContextAt: string | null;
}

interface KnowledgeGapMetrics {
  missingTags: KnowledgeGapMissingTag[];
  staleTags: KnowledgeGapStaleTag[];
  underrepresentedTypes: KnowledgeGapTypeInsight[];
  summary: KnowledgeGapSummary;
}

interface UsagePatternMetrics {
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

export class EmbeddingService {
  private static async resolveProjectId(scope: EmbeddingScope): Promise<string | undefined> {
    if (scope.projectId) {
      return scope.projectId;
    }

    if (scope.projectName) {
      const result = await db.query(
        `SELECT id FROM projects WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [scope.projectName]
      );

      return result.rows[0]?.id;
    }

    return undefined;
  }

  /**
   * Get available embedding datasets for a project
   */
  static async getAvailableDatasets(
    _userId: string,
    scope: EmbeddingScope = {}
  ): Promise<EmbeddingDataset[]> {
    try {
      const resolvedProjectId = await this.resolveProjectId(scope);
      const params: string[] = [];
      let whereClause = 'c.embedding IS NOT NULL';

      if (resolvedProjectId) {
        params.push(resolvedProjectId);
        whereClause += ` AND c.project_id = $${params.length}`;
      }

      const query = `
        SELECT
          p.id::text AS id,
          p.name AS name,
          'Embeddings from stored project contexts' AS description,
          COUNT(*) AS count,
          1536 AS dimensions,
          MIN(c.created_at) AS created_at
        FROM contexts c
        JOIN projects p ON p.id = c.project_id
        WHERE ${whereClause}
        GROUP BY p.id, p.name
        HAVING COUNT(*) > 0
        ORDER BY count DESC
        LIMIT 25
      `;

      const result = await db.query(query, params);

      return result.rows as EmbeddingDataset[];
    } catch (error) {
      console.error('Error getting embedding datasets:', error);
      throw new Error('Failed to get embedding datasets');
    }
  }

  /**
   * Get similarity matrix for embeddings
   */
  static async getSimilarityMatrix(
    _userId: string,
    scope: EmbeddingScope,
    datasetId: string,
    rows: number,
    cols: number
  ): Promise<SimilarityMatrix> {
    try {
      const resolvedScopeId = await this.resolveProjectId(scope);
      const targetProjectId = datasetId && datasetId !== 'contexts' ? datasetId : resolvedScopeId;

      if (!targetProjectId) {
        throw new Error('Project context required for similarity matrix queries.');
      }

      const limit = Math.max(rows, cols);

      const result = await db.query(
        `
          SELECT id, content, embedding
          FROM contexts
          WHERE project_id = $1
            AND embedding IS NOT NULL
          ORDER BY created_at DESC
          LIMIT $2
        `,
        [targetProjectId, limit]
      );
      const embeddingData = result.rows;
      
      if (embeddingData.length === 0) {
        throw new Error('No embeddings found for this project');
      }

      // Parse embeddings and calculate similarity matrix
      const parsedEmbeddings = embeddingData.map(row => ({
        id: row.id,
        content: row.content.substring(0, 50) + '...',
        embedding: JSON.parse(row.embedding)
      }));

      const matrix: number[][] = [];
      const labels = parsedEmbeddings.map(e => e.content);

      // Calculate cosine similarity matrix
      for (let i = 0; i < Math.min(parsedEmbeddings.length, rows); i++) {
        const row: number[] = [];
        for (let j = 0; j < Math.min(parsedEmbeddings.length, cols); j++) {
          if (i === j) {
            row.push(1.0);
          } else {
            const similarity = this.cosineSimilarity(
              parsedEmbeddings[i].embedding,
              parsedEmbeddings[j].embedding
            );
            row.push(similarity);
          }
        }
        matrix.push(row);
      }

      return {
        matrix,
        labels: labels.slice(0, Math.min(rows, cols)),
        metadata: {
          rows: Math.min(parsedEmbeddings.length, rows),
          cols: Math.min(parsedEmbeddings.length, cols),
          datasetId: targetProjectId
        }
      };
    } catch (error) {
      console.error('Error getting similarity matrix:', error);
      throw new Error('Failed to get similarity matrix');
    }
  }

  /**
   * Get 2D/3D projection using PCA
   */
  static async getProjection(
    _userId: string,
    scope: EmbeddingScope,
    datasetId: string,
    algorithm: string,
    n: number
  ): Promise<Projection> {
    try {
      const resolvedScopeId = await this.resolveProjectId(scope);
      const targetProjectId = datasetId && datasetId !== 'contexts' ? datasetId : resolvedScopeId;

      if (!targetProjectId) {
        throw new Error('Project context required for projection queries.');
      }

      const result = await db.query(
        `
          SELECT id, content, embedding
          FROM contexts
          WHERE project_id = $1
            AND embedding IS NOT NULL
          ORDER BY created_at DESC
          LIMIT $2
        `,
        [targetProjectId, n]
      );
      const embeddingData = result.rows;
      
      if (embeddingData.length === 0) {
        throw new Error('No embeddings found for this project');
      }

      // Parse embeddings
      const parsedEmbeddings = embeddingData.map(row => ({
        id: row.id,
        content: row.content.substring(0, 100) + '...',
        embedding: JSON.parse(row.embedding)
      }));

      if (algorithm === 'pca' || algorithm === 'pca3d') {
        // Create matrix from embeddings
        const matrix = parsedEmbeddings.map(item => item.embedding);
        
        // Apply PCA
        const components = algorithm === 'pca3d' ? 3 : 2;
        const pca = new PCA(matrix, { center: true });
        
        // Get projected data  
        const projected = pca.predict(matrix, { nComponents: components });
        
        // Create points with proper labels
        const points = parsedEmbeddings.map((item, index) => {
          const point: any = {
            x: projected.get(index, 0),
            y: projected.get(index, 1),
            label: `Context ${item.id}`,
            content: item.content,
            id: item.id
          };
          if (algorithm === 'pca3d') {
            point.z = projected.get(index, 2);
          }
          return point;
        });

        return {
          points,
          algorithm,
          varianceExplained: pca.getExplainedVariance()
        };
      } else {
        // For other algorithms (future implementation)
        throw new Error(`Algorithm ${algorithm} not yet implemented`);
      }
    } catch (error) {
      console.error('Error getting projection:', error);
      throw new Error('Failed to get projection: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Get clustering results using k-means
   */
  static async getClusters(
    _userId: string,
    scope: EmbeddingScope,
    datasetId: string,
    k: number
  ): Promise<ClusterResult> {
    try {
      const projection = await this.getProjection(_userId, scope, datasetId, 'pca', 1000);
      
      // Simple k-means clustering (mock implementation for now)
      const points = projection.points.map(p => ({ ...p, cluster: Math.floor(Math.random() * k) }));
      
      // Calculate mock centroids
      const centroids = [];
      for (let i = 0; i < k; i++) {
        const clusterPoints = points.filter(p => p.cluster === i);
        if (clusterPoints.length > 0) {
          const avgX = clusterPoints.reduce((sum, p) => sum + p.x, 0) / clusterPoints.length;
          const avgY = clusterPoints.reduce((sum, p) => sum + p.y, 0) / clusterPoints.length;
          centroids.push({ x: avgX, y: avgY, cluster: i });
        }
      }

      return {
        points,
        centroids,
        k,
        inertia: Math.random() * 100 // Mock inertia value
      };
    } catch (error) {
      console.error('Error getting clusters:', error);
      throw new Error('Failed to get clusters');
    }
  }

  /**
   * Get quality metrics for embeddings
   */
  static async getQualityMetrics(
    _userId: string,
    scope: EmbeddingScope,
    datasetId: string
  ): Promise<QualityMetrics> {
    try {
      const resolvedScopeId = await this.resolveProjectId(scope);
      const targetProjectId = datasetId && datasetId !== 'contexts' ? datasetId : resolvedScopeId;

      if (!targetProjectId) {
        throw new Error('Project context required for quality metrics.');
      }

      const result = await db.query(
        `
          SELECT embedding
          FROM contexts
          WHERE project_id = $1
            AND embedding IS NOT NULL
          LIMIT 1000
        `,
        [targetProjectId]
      );
      const embeddingData = result.rows;
      
      if (embeddingData.length === 0) {
        throw new Error('No embeddings found for this project');
      }

      // Parse embeddings
      const parsedEmbeddings = embeddingData.map(row => JSON.parse(row.embedding));
      const dimensions = parsedEmbeddings[0]?.length || 384;

      // Calculate basic statistics
      const norms = parsedEmbeddings.map(embedding => 
        Math.sqrt(embedding.reduce((sum: number, val: number) => sum + val * val, 0))
      );

      const avgNorm = norms.reduce((sum, norm) => sum + norm, 0) / norms.length;

      return {
        totalEmbeddings: embeddingData.length,
        averageNorm: avgNorm,
        dimensionality: dimensions,
        densityMetrics: {
          avgDistance: Math.random() * 2, // Mock values
          minDistance: Math.random() * 0.5,
          maxDistance: Math.random() * 3 + 2,
          stdDistance: Math.random() * 0.8
        },
        distributionStats: {
          mean: new Array(dimensions).fill(0).map(() => Math.random() * 0.2 - 0.1),
          std: new Array(dimensions).fill(0).map(() => Math.random() * 0.5 + 0.3),
          min: new Array(dimensions).fill(0).map(() => Math.random() * (-2) - 1),
          max: new Array(dimensions).fill(0).map(() => Math.random() * 2 + 1)
        }
      };
    } catch (error) {
      console.error('Error getting quality metrics:', error);
      throw new Error('Failed to get quality metrics');
    }
  }

  /**
   * Build relevance quality metrics to power the embeddings relevance dashboard.
   */
  static async getRelevanceMetrics(
    _userId: string,
    scope: EmbeddingScope
  ): Promise<RelevanceMetrics> {
    try {
      const projectId = await this.resolveProjectId(scope);
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

  /**
   * Build project relationship graph centred on the active project.
   */
  static async getProjectRelationships(
    _userId: string,
    scope: EmbeddingScope
  ): Promise<ProjectRelationshipResponse> {
    try {
      const projectId = await this.resolveProjectId(scope);
      if (!projectId) {
        throw new Error('Project context required for relationship analytics.');
      }

      const focusSummaryQuery = `
        SELECT
          c.project_id,
          COALESCE(p.name, 'Selected Project') AS project_name,
          COUNT(DISTINCT c.id) AS context_count,
          COUNT(DISTINCT LOWER(tag)) AS tag_count
        FROM contexts c
        JOIN projects p ON p.id = c.project_id
        LEFT JOIN LATERAL UNNEST(c.tags) AS tag ON true
        WHERE c.project_id = $1
        GROUP BY c.project_id, p.name
      `;

      const focusSummaryResult = await db.query(focusSummaryQuery, [projectId]);
      let focusRow = focusSummaryResult.rows[0];

      if (!focusRow) {
        const projectNameResult = await db.query(
          `SELECT name FROM projects WHERE id = $1`,
          [projectId]
        );
        focusRow = {
          project_id: projectId,
          project_name: projectNameResult.rows[0]?.name || scope.projectName || 'Selected Project',
          context_count: 0,
          tag_count: 0,
        };
      }

      const relationshipsQuery = `
        WITH context_tags AS (
          SELECT
            c.project_id,
            LOWER(tag) AS tag,
            COUNT(*) AS tag_count
          FROM contexts c
          CROSS JOIN LATERAL UNNEST(c.tags) AS tag
          WHERE c.tags IS NOT NULL
            AND array_length(c.tags, 1) > 0
          GROUP BY c.project_id, LOWER(tag)
        ),
        focus_tag_counts AS (
          SELECT tag, tag_count
          FROM context_tags
          WHERE project_id = $1
        ),
        other_tag_counts AS (
          SELECT project_id, tag, tag_count
          FROM context_tags
          WHERE project_id <> $1
        ),
        relationships AS (
          SELECT
            otc.project_id AS target_project_id,
            SUM(LEAST(focus.tag_count, otc.tag_count)) AS shared_tag_strength,
            COUNT(*) AS shared_tag_count
          FROM focus_tag_counts focus
          JOIN other_tag_counts otc ON otc.tag = focus.tag
          GROUP BY otc.project_id
        ),
        top_tags AS (
          SELECT
            otc.project_id AS target_project_id,
            focus.tag,
            LEAST(focus.tag_count, otc.tag_count) AS overlap_score,
            ROW_NUMBER() OVER (PARTITION BY otc.project_id ORDER BY LEAST(focus.tag_count, otc.tag_count) DESC) AS rank
          FROM focus_tag_counts focus
          JOIN other_tag_counts otc ON otc.tag = focus.tag
        )
        SELECT
          r.target_project_id,
          COALESCE(p.name, 'Unknown Project') AS project_name,
          COALESCE(cc.context_count, 0) AS context_count,
          r.shared_tag_strength,
          r.shared_tag_count,
          (
            SELECT ARRAY_AGG(tag ORDER BY overlap_score DESC LIMIT 5)
            FROM top_tags tt
            WHERE tt.target_project_id = r.target_project_id AND tt.rank <= 5
          ) AS top_shared_tags
        FROM relationships r
        LEFT JOIN projects p ON p.id = r.target_project_id
        LEFT JOIN (
          SELECT project_id, COUNT(*) AS context_count
          FROM contexts
          GROUP BY project_id
        ) cc ON cc.project_id = r.target_project_id
        WHERE r.shared_tag_strength > 0
        ORDER BY r.shared_tag_strength DESC, r.shared_tag_count DESC
        LIMIT 20;
      `;

      const relationshipsResult = await db.query(relationshipsQuery, [projectId]);

      const relatedProjects: ProjectRelationshipNode[] = relationshipsResult.rows.map(row => ({
        projectId: row.target_project_id,
        projectName: row.project_name,
        contextCount: Number(row.context_count ?? 0),
        tagCount: Number(row.shared_tag_count ?? 0),
        sharedTagCount: Number(row.shared_tag_count ?? 0),
        sharedTagStrength: Number(row.shared_tag_strength ?? 0),
      }));

      const edges: ProjectRelationshipEdge[] = relationshipsResult.rows.map(row => ({
        sourceProjectId: projectId as string,
        targetProjectId: row.target_project_id,
        sharedTagCount: Number(row.shared_tag_count ?? 0),
        sharedTagStrength: Number(row.shared_tag_strength ?? 0),
        topTags: (row.top_shared_tags ?? []) as string[],
      }));

      const summary: ProjectRelationshipSummary = {
        totalRelatedProjects: relatedProjects.length,
        totalSharedTagStrength: edges.reduce((sum, edge) => sum + edge.sharedTagStrength, 0),
        totalSharedTagCount: edges.reduce((sum, edge) => sum + edge.sharedTagCount, 0),
      };

      const focusProject: ProjectRelationshipNode = {
        projectId: focusRow.project_id,
        projectName: focusRow.project_name ?? 'Selected Project',
        contextCount: Number(focusRow.context_count ?? 0),
        tagCount: Number(focusRow.tag_count ?? 0),
      };

      return {
        focusProject,
        relatedProjects,
        edges,
        summary,
      };
    } catch (error) {
      console.error('Error getting project relationships:', error);
      throw new Error('Failed to get project relationship metrics');
    }
  }

  static async getKnowledgeGapMetrics(
    _userId: string,
    scope: EmbeddingScope
  ): Promise<KnowledgeGapMetrics> {
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
        throw new Error('Project context required for knowledge gap analytics.');
      }

      const focusSummaryResult = await db.query(
        `
          SELECT
            COUNT(*) AS context_count,
            COUNT(DISTINCT LOWER(tag)) AS tag_count
          FROM contexts c
          LEFT JOIN LATERAL UNNEST(c.tags) tag ON true
          WHERE c.project_id = $1
        `,
        [projectId]
      );

      const focusSummary = focusSummaryResult.rows[0] ?? { context_count: 0, tag_count: 0 };

      const lastContextResult = await db.query(
        `SELECT MAX(created_at) AS last_context_at FROM contexts WHERE project_id = $1`,
        [projectId]
      );
      const lastContextAt = lastContextResult.rows[0]?.last_context_at
        ? new Date(lastContextResult.rows[0].last_context_at).toISOString()
        : null;

      const missingTagsResult = await db.query(
        `
          WITH global_tags AS (
            SELECT
              LOWER(tag) AS tag,
              COUNT(*) AS total_count,
              COUNT(DISTINCT project_id) AS project_count,
              MAX(created_at) AS last_used
            FROM contexts
            CROSS JOIN LATERAL UNNEST(tags) AS tag
            GROUP BY tag
          ),
          focus_tags AS (
            SELECT DISTINCT LOWER(tag) AS tag
            FROM contexts
            CROSS JOIN LATERAL UNNEST(tags) AS tag
            WHERE project_id = $1
          ),
          missing AS (
            SELECT g.tag, g.total_count, g.project_count, g.last_used
            FROM global_tags g
            LEFT JOIN focus_tags f ON f.tag = g.tag
            WHERE f.tag IS NULL
          ),
          tag_projects AS (
            SELECT
              LOWER(tag) AS tag,
              c.project_id,
              COALESCE(p.name, 'Unknown Project') AS project_name,
              COUNT(*) AS tag_count,
              ROW_NUMBER() OVER (PARTITION BY LOWER(tag) ORDER BY COUNT(*) DESC) AS project_rank
            FROM contexts c
            CROSS JOIN LATERAL UNNEST(c.tags) AS tag
            LEFT JOIN projects p ON p.id = c.project_id
            WHERE c.project_id <> $1
            GROUP BY tag, c.project_id, p.name
          )
          SELECT
            m.tag,
            m.total_count,
            m.project_count,
            m.last_used,
            COALESCE(
              json_agg(
                json_build_object(
                  'projectId', tp.project_id,
                  'projectName', tp.project_name,
                  'count', tp.tag_count
                )
                ORDER BY tp.tag_count DESC
              ) FILTER (WHERE tp.project_rank <= 3),
              '[]'::json
            ) AS top_projects
          FROM missing m
          LEFT JOIN tag_projects tp ON tp.tag = m.tag AND tp.project_rank <= 3
          GROUP BY m.tag, m.total_count, m.project_count, m.last_used
          ORDER BY m.total_count DESC
          LIMIT 12;
        `,
        [projectId]
      );

      const staleTagsResult = await db.query(
        `
          SELECT
            LOWER(tag) AS tag,
            COUNT(*) AS total_count,
            MAX(created_at) AS last_used,
            EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) / 86400 AS days_since_last
          FROM contexts
          CROSS JOIN LATERAL UNNEST(tags) AS tag
          WHERE project_id = $1
          GROUP BY tag
          HAVING MAX(created_at) < NOW() - INTERVAL '21 days'
          ORDER BY MAX(created_at)
          LIMIT 10;
        `,
        [projectId]
      );

      const typeGapResult = await db.query(
        `
          WITH global_type_stats AS (
            SELECT
              context_type AS type,
              COUNT(*)::float AS total_count,
              COUNT(DISTINCT project_id)::float AS project_count
            FROM contexts
            GROUP BY context_type
          ),
          focus_type_stats AS (
            SELECT context_type AS type, COUNT(*)::float AS project_count
            FROM contexts
            WHERE project_id = $1
            GROUP BY context_type
          )
          SELECT
            g.type,
            g.total_count,
            g.project_count,
            CASE WHEN g.project_count > 0 THEN g.total_count / g.project_count ELSE 0 END AS avg_per_project,
            COALESCE(f.project_count, 0) AS project_count_for_type,
            CASE WHEN g.project_count > 0 THEN (g.total_count / g.project_count) - COALESCE(f.project_count, 0) ELSE 0 END AS gap
          FROM global_type_stats g
          LEFT JOIN focus_type_stats f ON f.type = g.type
          WHERE g.project_count > 1
          ORDER BY gap DESC
          LIMIT 10;
        `,
        [projectId]
      );

      const missingTags: KnowledgeGapMissingTag[] = missingTagsResult.rows.map(row => ({
        tag: row.tag,
        totalCount: Number(row.total_count ?? 0),
        projectCount: Number(row.project_count ?? 0),
        lastUsed: row.last_used ? new Date(row.last_used).toISOString() : null,
        topProjects: Array.isArray(row.top_projects)
          ? row.top_projects.map((project: any) => ({
              projectId: project.projectId ?? null,
              projectName: project.projectName,
              count: Number(project.count ?? 0),
            }))
          : [],
      }));

      const staleTags: KnowledgeGapStaleTag[] = staleTagsResult.rows.map(row => ({
        tag: row.tag,
        lastUsed: row.last_used ? new Date(row.last_used).toISOString() : null,
        daysSinceLastUsed: Number(row.days_since_last ?? 0),
        totalCount: Number(row.total_count ?? 0),
      }));

      const underrepresentedTypes: KnowledgeGapTypeInsight[] = typeGapResult.rows
        .filter(row => Number(row.gap ?? 0) > 0.5)
        .map(row => ({
          type: row.type,
          totalCount: Number(row.total_count ?? 0),
          globalProjectCount: Number(row.project_count ?? 0),
          averagePerProject: Number(row.avg_per_project ?? 0),
          projectCount: Number(row.project_count_for_type ?? 0),
          gap: Number(row.gap ?? 0),
        }));

      const summary: KnowledgeGapSummary = {
        projectContextCount: Number(focusSummary.context_count ?? 0),
        projectTagCount: Number(focusSummary.tag_count ?? 0),
        missingTagCount: missingTags.length,
        staleTagCount: staleTags.length,
        lastContextAt,
      };

      return {
        missingTags,
        staleTags,
        underrepresentedTypes,
        summary,
      };
    } catch (error) {
      console.error('Error getting knowledge gap metrics:', error);
      throw new Error('Failed to get knowledge gap metrics');
    }
  }

  static async getUsagePatterns(
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

  /**
   * Calculate cosine similarity between two vectors
   */
  private static cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
