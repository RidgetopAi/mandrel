/**
 * AIDIS Context Handler
 * 
 * This handles all context management operations:
 * - Storing context with automatic embedding generation
 * - Searching context using vector similarity
 * - Managing context metadata and relationships
 * 
 * This is where AI agents store their memories and retrieve them later!
 */

import { db } from '../config/database.js';
import { embeddingService } from '../services/embedding.js';
import { dimensionalityReductionService } from '../services/dimensionality-reduction.js';
import { projectHandler } from './project.js';
import { logContextEvent, logHierarchicalMemorySearch } from '../middleware/eventLogger.js';
import { logger } from '../utils/logger.js';
import { isValidUuid } from '../utils/uuid.js';

export interface StoreContextRequest {
  projectId?: string;
  sessionId?: string;
  /**
   * Connection scope for session attribution. When set, the active session is
   * resolved per-connection (no global "last active anywhere" fallback), closing
   * the cross-connection attribution leak.
   */
  connectionId?: string;
  type: 'code' | 'decision' | 'error' | 'discussion' | 'planning' | 'completion' | 'milestone' | 'reflections' | 'handoff' | 'lessons';
  content: string;
  tags?: string[];
  relevanceScore?: number;
  metadata?: Record<string, any>;
}

export interface ContextEntry {
  id: string;
  projectId: string;
  sessionId: string | null;
  contextType: string;
  content: string;
  createdAt: Date;
  relevanceScore: number;
  tags: string[];
  metadata: Record<string, any>;
  embedding?: number[];
}

export interface SearchContextRequest {
  projectId?: string;
  query: string;
  type?: string;
  limit?: number;
  offset?: number;
  minSimilarity?: number;
  tags?: string[];
}

export interface SearchResult extends ContextEntry {
  similarity?: number;
  searchReason?: string;
  // Score components for observability (Instance #49)
  recency_score?: number;
  importance_score?: number;
  type_weight?: number;
  combined_score?: number;
}

/**
 * Hierarchical-memory ranking BLEND weights — made configurable (task a85726eb).
 *
 * context_search combines four signals into `combined_score`:
 *   similarity  — cosine similarity to the query (the semantic match)
 *   recency     — EXP time-decay of created_at (half-life configurable)
 *   importance  — relevance_score/10
 *   type_weight — milestone 1.0 … discussion 0.4
 *
 * Historically these were HARDCODED into the SQL:
 *   BALANCED  = (similarity + recency + importance + type) / 4   → 0.25 each
 *   RECENCY   = 0.05·sim + 0.90·recency + 0.025·imp + 0.025·type
 *
 * They are now lifted into env-overridable config so a ranking sweep can change the
 * blend WITHOUT editing code. The DEFAULTS below reproduce the previous hardcoded
 * behavior EXACTLY: BALANCED 0.25/0.25/0.25/0.25 is algebraically identical to the
 * old `(a+b+c+d)/4`, and the RECENCY defaults match the old literals. Decay
 * half-lives (in days) are also configurable; defaults are the historical 30d
 * (balanced) and 7d (recency-focused).
 *
 * Env overrides (all optional; bad/missing values fall back to the default):
 *   MANDREL_RANK_BAL_SIM, MANDREL_RANK_BAL_REC, MANDREL_RANK_BAL_IMP, MANDREL_RANK_BAL_TYPE
 *   MANDREL_RANK_REC_SIM, MANDREL_RANK_REC_REC, MANDREL_RANK_REC_IMP, MANDREL_RANK_REC_TYPE
 *   MANDREL_RANK_BAL_HALFLIFE_DAYS (default 30), MANDREL_RANK_REC_HALFLIFE_DAYS (default 7)
 *
 * NOTE: weights are NOT auto-normalized — the defaults intentionally do not sum to 1
 * for the recency profile (matching history). The sweep supplies its own sets.
 */
interface RankWeights {
  similarity: number;
  recency: number;
  importance: number;
  typeWeight: number;
  halfLifeDays: number;
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

const RANK_WEIGHTS: { balanced: RankWeights; recency: RankWeights } = {
  // BALANCED default: 0.25 each → identical to old (sim+rec+imp+type)/4
  balanced: {
    similarity: envFloat('MANDREL_RANK_BAL_SIM', 0.25),
    recency: envFloat('MANDREL_RANK_BAL_REC', 0.25),
    importance: envFloat('MANDREL_RANK_BAL_IMP', 0.25),
    typeWeight: envFloat('MANDREL_RANK_BAL_TYPE', 0.25),
    halfLifeDays: envFloat('MANDREL_RANK_BAL_HALFLIFE_DAYS', 30.0),
  },
  // RECENCY-FOCUSED default: matches old 0.05 / 0.90 / 0.025 / 0.025 literals
  recency: {
    similarity: envFloat('MANDREL_RANK_REC_SIM', 0.05),
    recency: envFloat('MANDREL_RANK_REC_REC', 0.90),
    importance: envFloat('MANDREL_RANK_REC_IMP', 0.025),
    typeWeight: envFloat('MANDREL_RANK_REC_TYPE', 0.025),
    halfLifeDays: envFloat('MANDREL_RANK_REC_HALFLIFE_DAYS', 7.0),
  },
};

/**
 * Build the SQL fragment for `combined_score` from a weight profile. The four
 * signal expressions are passed in (so the SECONDS in the decay differ per mode),
 * and each is multiplied by its configured weight. Numeric literals are emitted
 * with full precision so the default 0.25 path is byte-equivalent in value to the
 * historical `/4` form.
 */
function buildCombinedScoreSql(w: RankWeights, simExpr: string, recExpr: string,
                               impExpr: string, typeExpr: string): string {
  return `(
              (${simExpr}) * ${w.similarity} +
              (${recExpr}) * ${w.recency} +
              (${impExpr}) * ${w.importance} +
              (${typeExpr}) * ${w.typeWeight}
            )`;
}

class ContextHandler {

  /**
   * Extract meaningful title from content for hybrid embeddings
   */
  private extractTitle(content: string): string {
    const trimmed = content.trim();

    // Look for markdown-style headers or bold text
    const markdownTitleMatch = trimmed.match(/^#{1,6}\s*(.+)|^\*\*(.+?)\*\*/);
    if (markdownTitleMatch) {
      return markdownTitleMatch[1] || markdownTitleMatch[2];
    }

    // Look for lines that look like titles (short first lines)
    const firstLine = trimmed.split('\n')[0];
    if (firstLine && firstLine.length <= 100 && firstLine.length >= 10) {
      // Check if it's likely a title (no punctuation at end except : or -)
      if (!/[.!?]$/.test(firstLine) || /[:-]$/.test(firstLine)) {
        return firstLine;
      }
    }

    // Fall back to first 50 characters
    return trimmed.substring(0, 50).replace(/\s+$/, '');
  }

  /**
   * Store new context with automatic hybrid embedding generation
   * Combines title + tags + type + content for better semantic search
   */
  async storeContext(request: StoreContextRequest): Promise<ContextEntry> {
    if (process.env.AIDIS_DETAILED_LOGGING === 'true') {
        logger.info(`📝 Storing ${request.type} context: "${request.content.substring(0, 60)}..."`);
      }

    try {
      // Validate required fields
      if (!request.content?.trim()) {
        throw new Error('Context content cannot be empty');
      }

      if (!request.type) {
        throw new Error('Context type is required');
      }

      // Get or create project/session
      const projectId = await this.ensureProjectId(request.projectId);
      const sessionId = await this.ensureSessionId(request.sessionId, projectId, request.connectionId);

      // Create hybrid embedding text combining title, tags, type, and content
      const extractedTitle = this.extractTitle(request.content);
      const embeddingText = [
        `Type: ${request.type}`,
        request.tags?.length ? `Tags: ${request.tags.join(', ')}` : '',
        extractedTitle,
        request.content.substring(0, 1000) // Limit content to avoid dilution
      ].filter(Boolean).join('\n');

      // Generate hybrid embedding
      logger.info('🔮 Generating hybrid embedding (title + tags + content)...');
      logger.info(`📋 Extracted title: "${extractedTitle}"`);
      const embeddingResult = await embeddingService.generateEmbedding({
        text: embeddingText
      });

      // Prepare context data
      const contextData = {
        project_id: projectId,
        session_id: sessionId,
        context_type: request.type,
        content: request.content.trim(),
        embedding: JSON.stringify(embeddingResult.embedding), // PostgreSQL vector format
        relevance_score: request.relevanceScore || 5.0,
        tags: request.tags || [],
        metadata: JSON.stringify(request.metadata || {})
      };

      // DEBUG: Track context creation calls to detect duplicates
      const callStack = new Error().stack;
      logger.error(`🔍 CONTEXT_STORE CALLED: "${extractedTitle}" - Stack: ${callStack?.split('\n')[2]?.trim()}`);

      logger.info(`🔍 DEBUG: About to insert context_type = "${contextData.context_type}" (type: ${typeof contextData.context_type})`);
      logger.info(`🔍 DEBUG: context_type length = ${contextData.context_type.length}`);
      logger.info(`🔍 DEBUG: context_type char codes = [${Array.from(contextData.context_type).map(c => c.charCodeAt(0)).join(',')}]`);

      // Generate 3D coordinates for the vector
      let vectorCoords = { x: 0, y: 0, z: 0 };
      try {
        // Get existing vectors for context-aware mapping
        const existingVectorsResult = await db.query(
          `SELECT embedding, vector_x, vector_y, vector_z 
           FROM contexts 
           WHERE project_id = $1 AND vector_x IS NOT NULL 
           ORDER BY created_at DESC 
           LIMIT 100`,
          [projectId]
        );

        if (existingVectorsResult.rows.length > 0) {
          const referenceVectors = existingVectorsResult.rows.map(r => 
            typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding
          );
          const referenceCoords = existingVectorsResult.rows.map(r => [r.vector_x, r.vector_y, r.vector_z]);
          
          const result = await dimensionalityReductionService.mapSingleVector(
            embeddingResult.embedding,
            referenceVectors,
            referenceCoords
          );
          vectorCoords = { x: result.x, y: result.y, z: result.z || 0 };
        } else {
          // First vector in project - use fallback
          const fallback = await dimensionalityReductionService.reduceVectors([embeddingResult.embedding], { dimensions: 3 });
          vectorCoords = { x: fallback[0][0], y: fallback[0][1], z: fallback[0][2] };
        }
      } catch (coordError) {
        logger.warn('⚠️  Failed to generate coordinates, using default', { metadata: { coordError } });
      }

      // Insert into database
      const sqlQuery = `
        INSERT INTO contexts (
          project_id, session_id, context_type, content, 
          embedding, relevance_score, tags, metadata,
          vector_x, vector_y, vector_z, mapping_method, mapped_at
        ) VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
        RETURNING id, created_at
      `;
      
      const sqlParams = [
        contextData.project_id,
        contextData.session_id,
        contextData.context_type,
        contextData.content,
        `[${embeddingResult.embedding.join(',')}]`, // Convert to PostgreSQL vector format
        contextData.relevance_score,
        contextData.tags,
        contextData.metadata,
        vectorCoords.x,
        vectorCoords.y,
        vectorCoords.z,
        'umap'
      ];

      if (process.env.AIDIS_DETAILED_LOGGING === 'true') {
        logger.info(`🔍 DEBUG: Executing SQL query with parameters:`);
        logger.info(`🔍 DEBUG: SQL: ${sqlQuery.replace(/\s+/g, ' ').trim()}`);
        logger.info(`🔍 DEBUG: Param $3 (context_type): "${sqlParams[2]}" (${typeof sqlParams[2]})`);
      }
      
      const result = await db.query(sqlQuery, sqlParams);

      // TS004-1: Update session activity after context storage
      if (sessionId) {
        const { SessionTracker } = await import('../services/sessionTracker.js');
        await SessionTracker.updateSessionActivity(sessionId);
        // TS007-2: Record context creation for activity tracking
        SessionTracker.recordContextCreated(sessionId);
      }

      const storedContext: ContextEntry = {
        id: result.rows[0].id,
        projectId: projectId,
        sessionId: sessionId,
        contextType: request.type,
        content: request.content,
        createdAt: result.rows[0].created_at,
        relevanceScore: request.relevanceScore || 5.0,
        tags: request.tags || [],
        metadata: request.metadata || {},
        embedding: embeddingResult.embedding
      };

      if (process.env.AIDIS_DETAILED_LOGGING === 'true') {
        logger.info(`✅ Context stored successfully! ID: ${storedContext.id}`);
        logger.info(`🔍 Embedding: ${embeddingResult.dimensions}D vector (${embeddingResult.model})`);
        logger.info(`🏷️  Tags: [${storedContext.tags.join(', ')}]`);
      }
      
      // Log the context creation event
      await logContextEvent(storedContext.id, 'stored', {
        context_type: storedContext.contextType,
        content_length: storedContext.content.length,
        tags: storedContext.tags,
        relevance_score: storedContext.relevanceScore,
        embedding_model: embeddingResult.model,
        embedding_dimensions: embeddingResult.dimensions
      });
      
      return storedContext;

    } catch (error) {
      logger.error('❌ Failed to store context', error as Error);
      throw new Error(`Context storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if hierarchical memory is enabled for a project
   * Instance #48: Changed to default-on (opt-out instead of opt-in)
   * After 10 instances of validation, hierarchical memory is production-ready
   */
  private async isHierarchicalEnabled(projectId?: string): Promise<boolean> {
    if (!projectId) return false;

    try {
      const result = await db.query(
        `SELECT metadata->>'hierarchical_memory_enabled' as enabled FROM projects WHERE id = $1`,
        [projectId]
      );
      const flagValue = result.rows[0]?.enabled;
      
      // Default to enabled unless explicitly set to 'false'
      // This enables hierarchical memory for all projects by default
      return flagValue !== 'false';
    } catch (error) {
      logger.error('Error checking hierarchical memory flag', error as Error);
      return false;
    }
  }

  /**
   * Detect if query explicitly requests recent/current information
   * Instance #43: Fix for hierarchical memory recency limitation
   */
  private isRecencyQuery(query: string): boolean {
    const recencyKeywords = [
      'recent', 'latest', 'current', 'now',
      'today', 'yesterday', 'this week', 'this month',
      'new', 'newest', 'just', 'last'
    ];

    const queryLower = query.toLowerCase();
    return recencyKeywords.some(keyword => queryLower.includes(keyword));
  }

  /**
   * Extract which recency keywords matched in the query
   * Instance #49: For observability logging
   */
  private extractRecencyKeywords(query: string): string[] {
    const recencyKeywords = [
      'recent', 'latest', 'current', 'now',
      'today', 'yesterday', 'this week', 'this month',
      'new', 'newest', 'just', 'last'
    ];

    const queryLower = query.toLowerCase();
    return recencyKeywords.filter(keyword => queryLower.includes(keyword));
  }

  /**
   * Search contexts using vector similarity and filters
   * Supports hierarchical memory scoring when enabled for project
   */
  async searchContext(request: SearchContextRequest): Promise<SearchResult[]> {
    logger.info(`🔍 Searching contexts: "${request.query}"`);

    // Instance #49: Start performance timing for observability
    const startTime = performance.now();

    try {
      // Generate embedding for search query
      const queryEmbedding = await embeddingService.generateEmbedding({
        text: request.query
      });

      // Check if hierarchical memory is enabled for this project
      const hierarchicalEnabled = await this.isHierarchicalEnabled(request.projectId);

      // Check if query explicitly requests recent information (Instance #43 fix)
      const isRecencyFocused = hierarchicalEnabled && this.isRecencyQuery(request.query);

      // Log scoring mode
      if (hierarchicalEnabled) {
        logger.info(`🧠 Hierarchical memory: ${isRecencyFocused ? 'RECENCY-FOCUSED' : 'BALANCED'}`);
      } else {
        logger.info(`🧠 Hierarchical memory: disabled`);
      }

      // Build search query with filters
      let sql: string;

      // Shared signal expressions (referenced by both hierarchical branches and the
      // configurable combined_score builder). Decay half-life (days) is per-profile.
      const TYPE_WEIGHT_CASE = `CASE context_type
              WHEN 'milestone' THEN 1.0
              WHEN 'decision' THEN 0.9
              WHEN 'completion' THEN 0.8
              WHEN 'reflections' THEN 0.7
              WHEN 'planning' THEN 0.6
              WHEN 'code' THEN 0.5
              ELSE 0.4
            END`;
      const SIM_EXPR = `1 - (embedding <=> $1::vector)`;
      const IMP_EXPR = `COALESCE(relevance_score, 5.0) / 10.0`;
      const recExprFor = (halfLifeDays: number) =>
        `EXP(-EXTRACT(EPOCH FROM (NOW() - created_at)) / (${halfLifeDays} * 24.0 * 3600))`;

      if (hierarchicalEnabled && isRecencyFocused) {
        // Recency-focused: TEMPORAL FILTER + dominant recency weighting.
        // Instance #43: temporal filter (last 60 days) + recency-dominant blend.
        // Blend weights/half-life now from RANK_WEIGHTS.recency (defaults preserve
        // the historical 0.05/0.90/0.025/0.025 @ 7-day half-life exactly).
        const w = RANK_WEIGHTS.recency;
        const REC_EXPR = recExprFor(w.halfLifeDays);
        sql = `
          SELECT
            id, project_id, session_id, context_type, content,
            created_at, relevance_score, tags, metadata,
            ${SIM_EXPR} as similarity,
            ${REC_EXPR} as recency_score,
            ${IMP_EXPR} as importance_score,
            ${TYPE_WEIGHT_CASE} as type_weight,
            ${buildCombinedScoreSql(w, SIM_EXPR, REC_EXPR, IMP_EXPR, TYPE_WEIGHT_CASE)} as combined_score
          FROM contexts
          WHERE embedding IS NOT NULL
            AND created_at > NOW() - INTERVAL '60 days'
        `;
      } else if (hierarchicalEnabled) {
        // Balanced: vector similarity + recency + importance + context type weights.
        // Instance #43: 30-day half-life. Blend weights/half-life now from
        // RANK_WEIGHTS.balanced (defaults 0.25 each = the historical (a+b+c+d)/4).
        const w = RANK_WEIGHTS.balanced;
        const REC_EXPR = recExprFor(w.halfLifeDays);
        sql = `
          SELECT
            id, project_id, session_id, context_type, content,
            created_at, relevance_score, tags, metadata,
            ${SIM_EXPR} as similarity,
            ${REC_EXPR} as recency_score,
            ${IMP_EXPR} as importance_score,
            ${TYPE_WEIGHT_CASE} as type_weight,
            ${buildCombinedScoreSql(w, SIM_EXPR, REC_EXPR, IMP_EXPR, TYPE_WEIGHT_CASE)} as combined_score
          FROM contexts
          WHERE embedding IS NOT NULL
        `;
      } else {
        // Baseline: vector similarity only
        sql = `
          SELECT
            id, project_id, session_id, context_type, content,
            created_at, relevance_score, tags, metadata,
            1 - (embedding <=> $1::vector) as similarity
          FROM contexts
          WHERE embedding IS NOT NULL
        `;
      }

      const params: any[] = [`[${queryEmbedding.embedding.join(',')}]`];
      let paramIndex = 2;

      // Add filters
      if (request.projectId) {
        sql += ` AND project_id = $${paramIndex}`;
        params.push(request.projectId);
        paramIndex++;
      }

      if (request.type) {
        sql += ` AND context_type = $${paramIndex}`;
        params.push(request.type);
        paramIndex++;
      }

      if (request.tags && request.tags.length > 0) {
        sql += ` AND tags && $${paramIndex}`;
        params.push(request.tags);
        paramIndex++;
      }

      // Order by appropriate score and limit results
      if (hierarchicalEnabled) {
        sql += ` ORDER BY combined_score DESC LIMIT $${paramIndex}`;
      } else {
        sql += ` ORDER BY similarity DESC LIMIT $${paramIndex}`;
      }
      params.push(request.limit || 10);
      paramIndex++;

      // OFFSET pagination: zod accepts `offset` but it was previously never applied
      // (silent no-op). Wire it through here. Only the ordering/scoring above is
      // out-of-scope (the MEASURED ranking tranche) — OFFSET is plain pagination
      // applied AFTER ordering, so it does not alter the sort.
      if (request.offset !== undefined && Number.isInteger(request.offset) && request.offset > 0) {
        sql += ` OFFSET $${paramIndex}`;
        params.push(request.offset);
        paramIndex++;
      }

      logger.info('🔍 Executing vector similarity search...');
      const result = await db.query(sql, params);

      // Convert results and calculate similarities with substring boosting
      const results: SearchResult[] = result.rows.map(row => {
        // Handle potential null/undefined similarity values to prevent NaN
        const rawSimilarity = row.similarity;
        let similarity = Math.max(0, (rawSimilarity && !isNaN(parseFloat(rawSimilarity))) ? parseFloat(rawSimilarity) : 0) * 100;

        // Apply substring boosting for exact matches
        const queryLower = request.query.toLowerCase();
        const contentLower = row.content.toLowerCase();
        const tagsLower = (row.tags || []).join(' ').toLowerCase();

        let boost = 0;
        let boostReason = '';

        // Word-level substring matching (improved from whole-phrase matching)
        // Tokenize query into meaningful terms (filter out very short words)
        const queryTerms = queryLower.split(/\s+/).filter(term => term.length >= 3);

        if (queryTerms.length > 0) {
          // Check content for individual word matches
          const contentMatches = queryTerms.filter(term => contentLower.includes(term));
          const contentMatchRatio = contentMatches.length / queryTerms.length;

          // Check tags for individual word matches
          const tagMatches = queryTerms.filter(term => tagsLower.includes(term));
          const tagMatchRatio = tagMatches.length / queryTerms.length;

          // Apply proportional boosts based on match ratio
          // Max +25% for content matches, +15% for tag matches
          if (contentMatchRatio > 0) {
            const contentBoost = Math.round(contentMatchRatio * 25);
            boost += contentBoost;
            boostReason = `${contentMatches.length}/${queryTerms.length} terms matched`;
          }

          if (tagMatchRatio > 0) {
            const tagBoost = Math.round(tagMatchRatio * 15);
            boost += tagBoost;
            const tagReason = `${tagMatches.length}/${queryTerms.length} in tags`;
            boostReason = boostReason ? boostReason + ' + ' + tagReason : tagReason;
          }
        } else if (queryLower.length >= 2) {
          // Fallback for very short queries (1-2 char terms only)
          if (contentLower.includes(queryLower)) {
            boost += 20;
            boostReason = 'Exact match';
          }
          if (tagsLower.includes(queryLower)) {
            boost += 15;
            boostReason = boostReason ? boostReason + ' + tag match' : 'Tag match';
          }
        }

        // Apply boost
        if (boost > 0) {
          similarity = Math.min(100, similarity + boost); // Cap at 100%
        }

        const finalSearchReason = boostReason ?
          `${similarity > 70 ? 'High' : similarity > 40 ? 'Moderate' : 'Low'} similarity match (${boostReason})` :
          similarity > 70 ? 'High similarity match' :
          similarity > 40 ? 'Moderate similarity match' :
          'Low similarity match';

        return {
          id: row.id,
          projectId: row.project_id,
          sessionId: row.session_id,
          contextType: row.context_type,
          content: row.content,
          createdAt: row.created_at,
          relevanceScore: row.relevance_score,
          tags: row.tags || [],
          metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
          similarity: Math.round(similarity * 10) / 10, // Round to 1 decimal place
          searchReason: finalSearchReason,
          // Include score components for observability (Instance #49)
          recency_score: row.recency_score ? parseFloat(row.recency_score) : undefined,
          importance_score: row.importance_score ? parseFloat(row.importance_score) : undefined,
          type_weight: row.type_weight ? parseFloat(row.type_weight) : undefined,
          combined_score: row.combined_score ? parseFloat(row.combined_score) : undefined
        };
      });

      // Filter by minimum similarity if specified
      const filtered = request.minSimilarity 
        ? results.filter(r => r.similarity! >= request.minSimilarity!)
        : results;

      logger.info(`✅ Found ${filtered.length} matching contexts`);
      if (filtered.length > 0) {
        logger.info(`🎯 Top match: ${filtered[0].similarity}% similarity - "${filtered[0].content.substring(0, 60)}..."`);
      }

      // Instance #49: Calculate query latency and log hierarchical memory search with observability data
      const queryLatency = Math.round(performance.now() - startTime);

      // Determine mode and extract matched keywords
      const mode = hierarchicalEnabled ? (isRecencyFocused ? 'recency' : 'balanced') : 'baseline';
      const intentKeywordsMatched = isRecencyFocused ? this.extractRecencyKeywords(request.query) : [];

      // Log with detailed observability data (Oracle Priority 1)
      await logHierarchicalMemorySearch({
        query: request.query,
        mode: mode,
        intentKeywordsMatched: intentKeywordsMatched,
        results: filtered,
        queryLatencyMs: queryLatency,
        filters: request,
        projectId: request.projectId,
        hierarchicalEnabled: hierarchicalEnabled
      });

      return filtered;

    } catch (error) {
      logger.error('❌ Context search failed', error as Error);
      throw new Error(`Context search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Ensure we have a valid project ID (get current project or specified project)
   * Accepts both UUID and project name
   */
  private async ensureProjectId(projectId?: string): Promise<string> {
    if (projectId) {
      // Check if projectId is a valid UUID format
      const isUuid = isValidUuid(projectId);

      // Query by UUID or name
      const result = await db.query(
        isUuid
          ? 'SELECT id FROM projects WHERE id = $1'
          : 'SELECT id FROM projects WHERE name = $1',
        [projectId]
      );

      if (result.rows.length > 0) {
        return result.rows[0].id;
      }
      throw new Error(`Project ${projectId} not found`);
    }

    // Use current active project from project handler
    await projectHandler.initializeSession(); // Ensure session is initialized
    const currentProject = await projectHandler.getCurrentProject();

    if (currentProject) {
      logger.info(`📋 Using current project: ${currentProject.name}`);
      return currentProject.id;
    }

    throw new Error('No current project set. Use project_switch to set an active project or specify a project ID.');
  }

  /**
   * Ensure we have a valid session ID (get current or create new)
   */
  private async ensureSessionId(sessionId?: string, _projectId?: string, connectionId?: string): Promise<string | null> {
    if (sessionId) {
      // Verify the session exists
      const result = await db.query('SELECT id FROM sessions WHERE id = $1', [sessionId]);
      if (result.rows.length > 0) {
        return sessionId;
      }
      throw new Error(`Session ${sessionId} not found`);
    }

    // Resolve the active session for THIS connection only. No global fallback —
    // a context must never attach to another connection's session (the leak).
    // The route-level action gate lazily creates this connection's session
    // before the write, so this normally resolves to that session.
    try {
      const { SessionTracker } = await import('../services/sessionTracker.js');
      const activeSessionId = await SessionTracker.getActiveSession(connectionId);
      if (activeSessionId) {
        // DEFENSIVE HARDENING (belt-and-suspenders): never trust the active-session
        // id blindly. The explicit-sessionId branch above already verifies existence
        // before returning; mirror that here so a stale/missing session can NEVER be
        // passed as a dangling FK to the contexts INSERT (contexts_session_id_fkey).
        // contexts.session_id is NULLABLE, so storing without a session is valid and
        // strictly safer than crashing the user's context_store. The root-cause guard
        // in getActiveSession should already prevent this, but this guarantees the
        // write path itself can never throw an FK error on a bad session id.
        const verify = await db.query('SELECT id FROM sessions WHERE id = $1', [activeSessionId]);
        if (verify.rows.length > 0) {
          logger.info(`📋 Using active session: ${activeSessionId.substring(0, 8)}... for context storage`);
          return activeSessionId;
        }
        logger.warn(
          `⚠️  Active session ${activeSessionId.substring(0, 8)}... not found in database - ` +
          `storing context WITHOUT session association to avoid an FK violation`
        );
        return null;
      }

      logger.warn('⚠️  No active session found - context will be stored without session association');
      return null;
    } catch (error) {
      logger.warn('⚠️  Failed to get active session, storing context without session', { metadata: { error } });
      return null; // Fallback to no session if session tracking fails
    }
  }

  /**
   * Get recent contexts in chronological order (newest first)
   */
  async getRecentContext(projectId?: string, limit: number = 5): Promise<SearchResult[]> {
    logger.info(`📋 Getting ${limit} most recent contexts`);

    try {
      // Ensure we have a valid project
      const actualProjectId = await this.ensureProjectId(projectId);

      // Build query to get recent contexts
      const sql = `
        SELECT 
          id, project_id, session_id, context_type, content,
          created_at, relevance_score, tags, metadata
        FROM contexts 
        WHERE project_id = $1
        ORDER BY created_at DESC 
        LIMIT $2
      `;
      
      logger.info('🔍 Executing recent contexts query...');
      const result = await db.query(sql, [actualProjectId, limit]);

      // Convert results to SearchResult format (same as searchContext)
      const results: SearchResult[] = result.rows.map(row => ({
        id: row.id,
        projectId: row.project_id,
        sessionId: row.session_id,
        contextType: row.context_type,
        content: row.content,
        createdAt: row.created_at,
        relevanceScore: row.relevance_score,
        tags: row.tags || [],
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        searchReason: 'Recent context (chronological order)'
      }));

      logger.info(`✅ Found ${results.length} recent contexts`);
      if (results.length > 0) {
        logger.info(`📅 Most recent: ${results[0].createdAt} - "${results[0].content.substring(0, 60)}..."`);
      }

      return results;

    } catch (error) {
      logger.error('❌ Failed to get recent contexts', error as Error);
      throw new Error(`Recent context retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get context statistics for a project
   */
  async getContextStats(projectId?: string): Promise<{
    totalContexts: number;
    contextsByType: Record<string, number>;
    recentContexts: number;
    embeddedContexts: number;
  }> {
    const actualProjectId = await this.ensureProjectId(projectId);

    const [total, byType, recent, embedded] = await Promise.all([
      // Total contexts
      db.query('SELECT COUNT(*) as count FROM contexts WHERE project_id = $1', [actualProjectId]),
      
      // Contexts by type
      db.query(`
        SELECT context_type, COUNT(*) as count 
        FROM contexts 
        WHERE project_id = $1 
        GROUP BY context_type
        ORDER BY count DESC
      `, [actualProjectId]),
      
      // Recent contexts (last 24 hours)
      db.query(`
        SELECT COUNT(*) as count 
        FROM contexts 
        WHERE project_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
      `, [actualProjectId]),
      
      // Contexts with embeddings
      db.query(`
        SELECT COUNT(*) as count 
        FROM contexts 
        WHERE project_id = $1 AND embedding IS NOT NULL
      `, [actualProjectId])
    ]);

    const contextsByType: Record<string, number> = {};
    byType.rows.forEach(row => {
      contextsByType[row.context_type] = parseInt(row.count);
    });

    return {
      totalContexts: parseInt(total.rows[0].count),
      contextsByType,
      recentContexts: parseInt(recent.rows[0].count),
      embeddedContexts: parseInt(embedded.rows[0].count)
    };
  }
}

// Export singleton instance
export const contextHandler = new ContextHandler();