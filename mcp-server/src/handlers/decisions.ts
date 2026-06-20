/**
 * AIDIS Technical Decisions Handler
 * 
 * This is the INSTITUTIONAL MEMORY KEEPER - preventing teams from repeating mistakes!
 * 
 * Functions:
 * - Record architectural decisions with full context and rationale
 * - Track alternatives considered and why they were rejected
 * - Monitor decision outcomes and lessons learned
 * - Search decisions by impact, component, or topic
 * - Manage decision lifecycle (active -> deprecated -> superseded)
 * - Generate decision reports and summaries
 * 
 * This solves critical problems:
 * - "Why did we choose this library/framework/pattern?"
 * - "What were the trade-offs when we made this choice?"
 * - "Have we tried this approach before? What happened?"
 * - "What decisions are affecting this component?"
 * - Knowledge loss when team members leave
 */

import { db } from '../config/database.js';
import { embeddingService } from '../services/embedding.js';
import { projectHandler } from './project.js';
import { logDecisionEvent, logEvent } from '../middleware/eventLogger.js';
import { logger } from '../utils/logger.js';

/**
 * Build the hybrid embedding text for a decision, mirroring how context_store
 * combines title + tags + type + content. A decision's "content" is the union of
 * its human-authored prose fields — title, description, rationale, and (when set)
 * the problem statement and success criteria — so a semantically-equivalent query
 * ('critical security decision', 'authentication') lands near the right row.
 *
 * Pure + side-effect-free so it can be reused by record, update, and the backfill.
 */
export function buildDecisionEmbeddingText(parts: {
  decisionType?: string | null;
  title?: string | null;
  description?: string | null;
  rationale?: string | null;
  problemStatement?: string | null;
  successCriteria?: string | null;
  tags?: string[] | null;
}): string {
  return [
    parts.decisionType ? `Type: ${parts.decisionType}` : '',
    parts.tags && parts.tags.length ? `Tags: ${parts.tags.join(', ')}` : '',
    parts.title || '',
    parts.description || '',
    parts.rationale || '',
    parts.problemStatement || '',
    parts.successCriteria || '',
  ].map(s => (s || '').trim()).filter(Boolean).join('\n');
}

/** Format a JS number[] as a pgvector literal: `[a,b,c]`. */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export interface TechnicalDecision {
  id: string;
  projectId: string;
  sessionId: string | null;
  decisionType: DecisionType;
  title: string;
  description: string;
  rationale: string;
  problemStatement: string | null;
  successCriteria: string | null;
  alternativesConsidered: Alternative[];
  decisionDate: Date;
  decidedBy: string | null;
  stakeholders: string[];
  status: DecisionStatus;
  supersededBy: string | null;
  supersededDate: Date | null;
  supersededReason: string | null;
  impactLevel: ImpactLevel;
  affectedComponents: string[];
  tags: string[];
  category: string | null;
  outcomeStatus: OutcomeStatus;
  outcomeNotes: string | null;
  lessonsLearned: string | null;
  implementationStatus: ImplementationStatus;
  /**
   * Vector-similarity score (0–100) to the search query, populated ONLY by
   * searchDecisions when a semantic `query` was supplied. Mirrors the `similarity`
   * surfaced by context_search so callers/UI can rank + display a relevance number.
   * Undefined for record/update results and for filter-only searches.
   */
  similarity?: number;
}

export type DecisionType = 
  | 'architecture' | 'library' | 'framework' | 'pattern' | 'api_design' 
  | 'database' | 'deployment' | 'security' | 'performance' | 'ui_ux' 
  | 'testing' | 'tooling' | 'process' | 'naming_convention' | 'code_style';

export type DecisionStatus = 'active' | 'deprecated' | 'superseded' | 'under_review';

export type ImpactLevel = 'low' | 'medium' | 'high' | 'critical';

export type OutcomeStatus = 'unknown' | 'successful' | 'failed' | 'mixed' | 'too_early';

export type ImplementationStatus = 'planned' | 'in_progress' | 'implemented' | 'validated' | 'deprecated';

export interface Alternative {
  name: string;
  pros: string[];
  cons: string[];
  reasonRejected: string;
  cost?: string;
  timeframe?: string;
}

export interface RecordDecisionRequest {
  projectId?: string;
  sessionId?: string;
  /** Connection scope for per-connection session attribution (no global fallback). */
  connectionId?: string;
  decisionType: DecisionType;
  title: string;
  description: string;
  rationale: string;
  problemStatement?: string;
  successCriteria?: string;
  implementationStatus?: ImplementationStatus;
  // A1: outcome fields are settable up front at record time (mirroring
  // implementationStatus). Default outcome_status stays 'unknown' in the DB if unset.
  outcomeStatus?: OutcomeStatus;
  outcomeNotes?: string;
  lessonsLearned?: string;
  alternativesConsidered?: Alternative[];
  decidedBy?: string;
  stakeholders?: string[];
  impactLevel: ImpactLevel;
  affectedComponents?: string[];
  tags?: string[];
  category?: string;
}

export interface UpdateDecisionRequest {
  decisionId: string;
  status?: DecisionStatus;
  outcomeStatus?: OutcomeStatus;
  outcomeNotes?: string;
  lessonsLearned?: string;
  implementationStatus?: ImplementationStatus;
  successCriteria?: string;
  problemStatement?: string;
  supersededBy?: string;
  supersededReason?: string;
}

export interface SearchDecisionsRequest {
  projectId?: string;
  decisionType?: DecisionType;
  status?: DecisionStatus;
  // outcomeStatus filters the learning-loop RESULT column (outcome_status), which is a
  // DIFFERENT column from `status` (the active/deprecated/… lifecycle). This is the
  // moat-critical read filter: "which decisions FAILED / SUCCEEDED?" — what the GAP1
  // Evaluator needs and what `status` cannot express.
  outcomeStatus?: OutcomeStatus;
  impactLevel?: ImpactLevel;
  component?: string;
  tags?: string[];
  query?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  // A6: surfaced through the route so the filter the model can set actually arrives.
  // The handler ALWAYS selects the outcome columns (SELECT *) and the route maps
  // outcomeStatus/outcomeNotes/lessonsLearned into every result, so this is the
  // display/intent hint the search advertises; accepting it here keeps the
  // declared==forwarded==accepted contract intact (no silently-dropped param).
  includeOutcome?: boolean;
}

class DecisionsHandler {

  /**
   * Record a new technical decision
   */
  async recordDecision(request: RecordDecisionRequest): Promise<TechnicalDecision> {
    logger.info(`📝 Recording ${request.decisionType} decision: "${request.title}"`);

    try {
      const projectId = await this.ensureProjectId(request.projectId);

      // Get active session for decision tracking
      let sessionId: string | null = request.sessionId || null;
      if (!sessionId) {
        try {
          const { SessionTracker } = await import('../services/sessionTracker.js');
          // Connection-scoped: attach to THIS connection's session only (no leak).
          sessionId = await SessionTracker.getActiveSession(request.connectionId);
          if (sessionId) {
            logger.info(`📋 Linking decision to active session: ${sessionId.substring(0, 8)}...`);
          }
        } catch (error) {
          logger.warn('⚠️  Failed to get active session for decision', { metadata: { error } });
        }
      }

      // Validate required fields
      if (!request.title?.trim()) {
        throw new Error('Decision title is required');
      }
      if (!request.description?.trim()) {
        throw new Error('Decision description is required');
      }
      if (!request.rationale?.trim()) {
        throw new Error('Decision rationale is required');
      }

      // Check for duplicate decisions
      const existingDecision = await this.checkForDuplicate(
        projectId,
        request.title,
        request.decisionType
      );

      if (existingDecision) {
        logger.info(`⚠️  Similar decision exists: ${existingDecision.title}`);
        // Could return warning but allow duplicate, or suggest linking
      }

      // EMBED-ON-WRITE: generate a semantic embedding from the decision's prose,
      // mirroring context_store. Reuses the SAME local embedder + 1536 dimensions
      // contexts use (FREE — no paid API). If embedding generation fails, we degrade
      // gracefully: store the decision WITHOUT an embedding (search falls back to the
      // trgm path) rather than failing the whole record — the decision must persist.
      const embeddingText = buildDecisionEmbeddingText({
        decisionType: request.decisionType,
        title: request.title,
        description: request.description,
        rationale: request.rationale,
        problemStatement: request.problemStatement,
        successCriteria: request.successCriteria,
        tags: request.tags,
      });
      let embeddingLiteral: string | null = null;
      try {
        const embeddingResult = await embeddingService.generateEmbedding({ text: embeddingText });
        embeddingLiteral = toVectorLiteral(embeddingResult.embedding);
        logger.info(`🔮 Generated decision embedding (${embeddingResult.dimensions}D, model: ${embeddingResult.model})`);
      } catch (embedError) {
        logger.warn('⚠️  Failed to generate decision embedding — storing without it (trgm fallback applies)', {
          metadata: { message: (embedError as Error)?.message }
        });
      }

      // Insert decision.
      // A1: outcome_status/outcome_notes/lessons_learned are now persisted on CREATE
      // (mirroring implementation_status, which already round-tripped on create).
      // outcome_status COALESCEs to 'unknown' (the DB default) when the caller omits it,
      // so existing callers are unaffected; when supplied (e.g. 'too_early') it sticks.
      const result = await db.query(`
        INSERT INTO technical_decisions (
          project_id, session_id, decision_type, title, description, rationale,
          problem_statement, success_criteria, alternatives_considered,
          decided_by, stakeholders, impact_level, affected_components,
          tags, category, implementation_status,
          outcome_status, outcome_notes, lessons_learned, embedding
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          COALESCE($16, 'planned'), COALESCE($17, 'unknown'), $18, $19, $20::vector)
        RETURNING *
      `, [
        projectId,
        sessionId,
        request.decisionType,
        request.title.trim(),
        request.description.trim(),
        request.rationale.trim(),
        request.problemStatement?.trim() || null,
        request.successCriteria?.trim() || null,
        JSON.stringify(request.alternativesConsidered || []),
        request.decidedBy?.trim() || null,
        request.stakeholders || [],
        request.impactLevel,
        request.affectedComponents || [],
        request.tags || [],
        request.category?.trim() || null,
        request.implementationStatus || null,
        request.outcomeStatus || null,
        request.outcomeNotes?.trim() || null,
        request.lessonsLearned?.trim() || null,
        embeddingLiteral
      ]);

      const decision = this.mapDatabaseRowToDecision(result.rows[0]);

      // TS004-1: Update session activity after decision recording
      if (request.sessionId) {
        const { SessionTracker } = await import('../services/sessionTracker.js');
        await SessionTracker.updateSessionActivity(request.sessionId);
      }

      logger.info(`✅ Decision recorded: ${decision.id.substring(0, 8)}...`);
      logger.info(`🎯 Impact: ${decision.impactLevel} | Type: ${decision.decisionType}`);
      logger.info(`📊 Alternatives considered: ${decision.alternativesConsidered.length}`);

      // Log the decision creation event
      await logDecisionEvent(decision.id, 'recorded', {
        decision_type: decision.decisionType,
        title: decision.title,
        impact_level: decision.impactLevel,
        affected_components: decision.affectedComponents,
        alternatives_count: decision.alternativesConsidered.length,
        tags: decision.tags,
        has_problem_statement: !!decision.problemStatement,
        has_success_criteria: !!decision.successCriteria
      });

      return decision;

    } catch (error) {
      logger.error('❌ Failed to record decision', error as Error);
      throw new Error(`Decision recording failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update an existing decision (status, outcomes, lessons learned)
   */
  async updateDecision(request: UpdateDecisionRequest): Promise<TechnicalDecision> {
    logger.info(`📝 Updating decision: ${request.decisionId.substring(0, 8)}...`);

    try {
      // Build dynamic update query
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (request.status !== undefined) {
        updateFields.push(`status = $${paramIndex}`);
        values.push(request.status);
        paramIndex++;
      }

      if (request.outcomeStatus !== undefined) {
        updateFields.push(`outcome_status = $${paramIndex}`);
        values.push(request.outcomeStatus);
        paramIndex++;
      }

      if (request.outcomeNotes !== undefined) {
        updateFields.push(`outcome_notes = $${paramIndex}`);
        values.push(request.outcomeNotes);
        paramIndex++;
      }

      if (request.lessonsLearned !== undefined) {
        updateFields.push(`lessons_learned = $${paramIndex}`);
        values.push(request.lessonsLearned);
        paramIndex++;
      }

      if (request.implementationStatus !== undefined) {
        updateFields.push(`implementation_status = $${paramIndex}`);
        values.push(request.implementationStatus);
        paramIndex++;
      }

      if (request.successCriteria !== undefined) {
        updateFields.push(`success_criteria = $${paramIndex}`);
        values.push(request.successCriteria);
        paramIndex++;
      }

      if (request.problemStatement !== undefined) {
        updateFields.push(`problem_statement = $${paramIndex}`);
        values.push(request.problemStatement);
        paramIndex++;
      }

      if (request.supersededBy !== undefined) {
        updateFields.push(`superseded_by = $${paramIndex}`);
        updateFields.push(`superseded_date = CURRENT_TIMESTAMP`);
        // A2: only auto-set status='superseded' here when the caller did NOT separately
        // provide `status`. Previously this branch ALWAYS injected status='superseded'
        // while the status branch above also emitted `status = $N` → two assignments to
        // the same column → Postgres "multiple assignments to column status". When the
        // caller passes status explicitly, that branch already set it (so we must not
        // emit a second one); when they don't, supersession implies 'superseded'.
        if (request.status === undefined) {
          updateFields.push(`status = 'superseded'`);
        }
        values.push(request.supersededBy);
        paramIndex++;
      }

      if (request.supersededReason !== undefined) {
        updateFields.push(`superseded_reason = $${paramIndex}`);
        values.push(request.supersededReason);
        paramIndex++;
      }

      if (updateFields.length === 0) {
        throw new Error('No update fields provided');
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(request.decisionId);

      const sql = `
        UPDATE technical_decisions 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await db.query(sql, values);

      if (result.rows.length === 0) {
        throw new Error(`Decision ${request.decisionId} not found`);
      }

      const decision = this.mapDatabaseRowToDecision(result.rows[0]);

      // RE-EMBED ON TEXT CHANGE: if any field that feeds the embedding text changed
      // (problem_statement or success_criteria are the only text fields update can
      // touch), regenerate the embedding from the UPDATED row so semantic search
      // stays in sync. Best-effort: a failure leaves the prior embedding intact and
      // never fails the update.
      const textChanged =
        request.problemStatement !== undefined || request.successCriteria !== undefined;
      if (textChanged) {
        try {
          const row = result.rows[0];
          const embeddingText = buildDecisionEmbeddingText({
            decisionType: row.decision_type,
            title: row.title,
            description: row.description,
            rationale: row.rationale,
            problemStatement: row.problem_statement,
            successCriteria: row.success_criteria,
            tags: row.tags,
          });
          const embeddingResult = await embeddingService.generateEmbedding({ text: embeddingText });
          await db.query(
            `UPDATE technical_decisions SET embedding = $1::vector WHERE id = $2`,
            [toVectorLiteral(embeddingResult.embedding), decision.id]
          );
          logger.info(`🔮 Re-embedded decision ${decision.id.substring(0, 8)}... after text change`);
        } catch (embedError) {
          logger.warn('⚠️  Failed to re-embed decision after text change — prior embedding retained', {
            metadata: { message: (embedError as Error)?.message }
          });
        }
      }

      logger.info(`✅ Decision updated: ${decision.status} | Outcome: ${decision.outcomeStatus}`);
      
      // Log the decision update event
      await logDecisionEvent(decision.id, 'updated', {
        status: decision.status,
        outcome_status: decision.outcomeStatus,
        outcome_notes: decision.outcomeNotes,
        lessons_learned: decision.lessonsLearned,
        superseded_by: decision.supersededBy,
        superseded_reason: decision.supersededReason,
        update_fields: Object.keys(request).filter(k => k !== 'decisionId' && request[k as keyof typeof request] !== undefined)
      });
      
      return decision;

    } catch (error) {
      logger.error('❌ Failed to update decision', error as Error);
      throw new Error(`Decision update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search technical decisions with various filters
   */
  async searchDecisions(request: SearchDecisionsRequest): Promise<TechnicalDecision[]> {
    logger.info(`🔍 Searching decisions...`);

    try {
      const projectId = await this.ensureProjectId(request.projectId);

      // SEMANTIC SEARCH (mirrors context_search): when a free-text query is given,
      // rank by vector similarity `1 - (embedding <=> queryVec)` instead of plain
      // text matching, so a semantically-equivalent query surfaces the right
      // decision even with zero literal word overlap (the eval's failing case).
      //
      // The text/trgm signal is BLENDED in as a fallback so:
      //   - un-embedded rows (legacy, pre-backfill) still match on their text, and
      //   - an exact literal hit isn't demoted by a slightly-lower cosine score.
      // A row with NEITHER signal (no embedding AND no text match) is excluded —
      // same effect as the old ILIKE filter, so we never flood results with noise.
      const isSemantic = !!(request.query && request.query.trim() && request.query !== '*');

      let queryEmbeddingLiteral: string | null = null;
      if (isSemantic) {
        try {
          const queryEmbedding = await embeddingService.generateEmbedding({ text: request.query!.trim() });
          queryEmbeddingLiteral = toVectorLiteral(queryEmbedding.embedding);
        } catch (embedError) {
          // Degrade to pure text matching if the embedder is unavailable.
          logger.warn('⚠️  Failed to embed decision search query — falling back to text matching', {
            metadata: { message: (embedError as Error)?.message }
          });
        }
      }

      const params: any[] = [projectId];
      let paramIndex = 2;

      // Build the optional semantic-score SELECT expression. Cosine similarity in
      // [0,1] (0 when the row has no embedding). Trgm word_similarity in [0,1] over
      // the concatenated prose. Final score: max of the two — a row ranks on whichever
      // signal is stronger, so semantic wins when present, text rescues legacy rows.
      let scoreSelect = '';
      let queryParamIdx = -1;
      if (isSemantic) {
        queryParamIdx = paramIndex;
        params.push(request.query!.trim()); // text param for trgm fallback ($2)
        paramIndex++;

        if (queryEmbeddingLiteral !== null) {
          const embParamIdx = paramIndex;
          params.push(queryEmbeddingLiteral); // vector param ($3)
          paramIndex++;
          scoreSelect = `,
        GREATEST(
          CASE WHEN embedding IS NULL THEN 0
               ELSE 1 - (embedding <=> $${embParamIdx}::vector) END,
          word_similarity($${queryParamIdx},
            coalesce(title,'') || ' ' || coalesce(description,'') || ' ' ||
            coalesce(rationale,'') || ' ' || coalesce(problem_statement,''))
        ) AS search_score`;
        } else {
          // Embedder unavailable → text-only score.
          scoreSelect = `,
        word_similarity($${queryParamIdx},
          coalesce(title,'') || ' ' || coalesce(description,'') || ' ' ||
          coalesce(rationale,'') || ' ' || coalesce(problem_statement,'')) AS search_score`;
        }
      }

      let sql = `
        SELECT *${scoreSelect} FROM technical_decisions
        WHERE project_id = $1
      `;

      // Add filters
      if (request.decisionType) {
        sql += ` AND decision_type = $${paramIndex}`;
        params.push(request.decisionType);
        paramIndex++;
      }

      if (request.status) {
        sql += ` AND status = $${paramIndex}`;
        params.push(request.status);
        paramIndex++;
      }

      // outcome_status is a SEPARATE column from `status` (lifecycle). This filters the
      // learning-loop result so the GAP1 Evaluator can read back "all the failed/
      // successful decisions" via the tool alone.
      if (request.outcomeStatus) {
        sql += ` AND outcome_status = $${paramIndex}`;
        params.push(request.outcomeStatus);
        paramIndex++;
      }

      if (request.impactLevel) {
        sql += ` AND impact_level = $${paramIndex}`;
        params.push(request.impactLevel);
        paramIndex++;
      }

      if (request.component) {
        sql += ` AND $${paramIndex} = ANY(affected_components)`;
        params.push(request.component);
        paramIndex++;
      }

      if (request.tags && request.tags.length > 0) {
        sql += ` AND tags && $${paramIndex}`;
        params.push(request.tags);
        paramIndex++;
      }

      if (isSemantic) {
        // Keep ONLY rows with a real signal: an embedding (semantic candidate) OR a
        // text/trigram overlap. Mirrors the old ILIKE gate but additionally admits
        // semantic-only matches that share no literal substring.
        sql += ` AND (
          embedding IS NOT NULL OR
          title ILIKE $${paramIndex} OR
          description ILIKE $${paramIndex} OR
          rationale ILIKE $${paramIndex} OR
          problem_statement ILIKE $${paramIndex} OR
          word_similarity($${queryParamIdx},
            coalesce(title,'') || ' ' || coalesce(description,'') || ' ' ||
            coalesce(rationale,'') || ' ' || coalesce(problem_statement,'')) > 0.1
        )`;
        params.push(`%${request.query!.trim()}%`);
        paramIndex++;
      }

      if (request.dateFrom) {
        sql += ` AND decision_date >= $${paramIndex}`;
        params.push(request.dateFrom);
        paramIndex++;
      }

      if (request.dateTo) {
        sql += ` AND decision_date <= $${paramIndex}`;
        params.push(request.dateTo);
        paramIndex++;
      }

      // Rank by semantic relevance when querying; else newest-first (unchanged).
      if (isSemantic) {
        sql += ` ORDER BY search_score DESC, decision_date DESC LIMIT $${paramIndex}`;
      } else {
        sql += ` ORDER BY decision_date DESC LIMIT $${paramIndex}`;
      }
      params.push(request.limit || 20);

      const result = await db.query(sql, params);
      const decisions = result.rows.map(row => {
        const decision = this.mapDatabaseRowToDecision(row);
        // Surface the similarity/relevance the row ranked on (0–100), consistent
        // with context_search. Only present on semantic searches.
        if (row.search_score !== undefined && row.search_score !== null) {
          const s = parseFloat(row.search_score);
          decision.similarity = Number.isFinite(s)
            ? Math.round(Math.max(0, Math.min(1, s)) * 100 * 10) / 10
            : undefined;
        }
        return decision;
      });

      logger.info(`✅ Found ${decisions.length} matching decisions${isSemantic ? ' (semantic ranking)' : ''}`);
      
      // Log the search event
      await logEvent({
        actor: 'ai',
        event_type: 'decision_search',
        payload: {
          filters: {
            decisionType: request.decisionType,
            status: request.status,
            outcomeStatus: request.outcomeStatus,
            impactLevel: request.impactLevel,
            component: request.component,
            tags: request.tags,
            query: request.query,
            dateFrom: request.dateFrom,
            dateTo: request.dateTo
          },
          results_count: decisions.length
        },
        status: 'closed',
        tags: ['decision', 'search']
      });
      
      return decisions;

    } catch (error) {
      logger.error('❌ Failed to search decisions', error as Error);
      throw new Error(`Decision search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch a SINGLE decision by its id with FULL detail (all fields, incl. the
   * learning-loop outcome fields). Mirrors context_search's `id` direct-lookup idiom:
   * a precise by-id read that bypasses semantic search entirely, so the GAP1 Evaluator
   * (and any tool-only agent) can pull one decision's complete outcome record without
   * re-running a fuzzy query.
   *
   * Returns null when no row matches the id — the route turns that into an actionable
   * not-found error. `projectId`, when supplied, scopes the lookup (defence in depth
   * for multi-project callers); omit it to look the decision up by id alone.
   */
  async getDecisionById(decisionId: string, projectId?: string): Promise<TechnicalDecision | null> {
    logger.info(`🔎 Fetching decision by id: ${decisionId.substring(0, 8)}...`);

    const params: any[] = [decisionId];
    let sql = `SELECT * FROM technical_decisions WHERE id = $1`;
    if (projectId) {
      sql += ` AND project_id = $2`;
      params.push(projectId);
    }

    const result = await db.query(sql, params);
    if (result.rows.length === 0) {
      return null;
    }
    return this.mapDatabaseRowToDecision(result.rows[0]);
  }

  /**
   * Get decisions affecting a specific component
   */
  async getDecisionsForComponent(component: string, projectId?: string): Promise<TechnicalDecision[]> {
    logger.info(`🎯 Getting decisions for component: ${component}`);

    return await this.searchDecisions({
      projectId,
      component,
      status: 'active',
      limit: 10
    });
  }

  /**
   * Get recent decisions (last 30 days)
   */
  async getRecentDecisions(projectId?: string, limit: number = 10): Promise<TechnicalDecision[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return await this.searchDecisions({
      projectId,
      dateFrom: thirtyDaysAgo,
      limit
    });
  }

  /**
   * Deprecate a decision (mark as no longer active)
   */
  async deprecateDecision(
    decisionId: string, 
    reason: string, 
    replacementId?: string
  ): Promise<TechnicalDecision> {
    logger.info(`📋 Deprecating decision: ${decisionId.substring(0, 8)}...`);

    return await this.updateDecision({
      decisionId,
      status: 'deprecated',
      supersededBy: replacementId,
      supersededReason: reason
    });
  }

  /**
   * Get decision statistics for a project
   */
  async getDecisionStats(projectId?: string): Promise<{
    totalDecisions: number;
    decisionsByType: Record<string, number>;
    decisionsByStatus: Record<string, number>;
    decisionsByImpact: Record<string, number>;
    decisionsByProject: Record<string, number>;
    outcomeSuccess: number;
    recentActivity: number;
    totalProjects: number;
  }> {
    const actualProjectId = await this.ensureProjectId(projectId);

    const [total, byType, byStatus, byImpact, outcomes, recent, byProject, projectCount] = await Promise.all([
      // Total decisions
      db.query('SELECT COUNT(*) as count FROM technical_decisions WHERE project_id = $1', [actualProjectId]),

      // Decisions by type
      db.query(`
        SELECT decision_type, COUNT(*) as count
        FROM technical_decisions
        WHERE project_id = $1
        GROUP BY decision_type
        ORDER BY count DESC
      `, [actualProjectId]),

      // Decisions by status
      db.query(`
        SELECT status, COUNT(*) as count
        FROM technical_decisions
        WHERE project_id = $1
        GROUP BY status
      `, [actualProjectId]),

      // Decisions by impact level
      db.query(`
        SELECT impact_level, COUNT(*) as count
        FROM technical_decisions
        WHERE project_id = $1
        GROUP BY impact_level
        ORDER BY
          CASE impact_level
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
          END
      `, [actualProjectId]),

      // Outcome success rate
      db.query(`
        SELECT outcome_status, COUNT(*) as count
        FROM technical_decisions
        WHERE project_id = $1 AND outcome_status != 'unknown'
        GROUP BY outcome_status
      `, [actualProjectId]),

      // Recent activity (last 30 days)
      db.query(`
        SELECT COUNT(*) as count
        FROM technical_decisions
        WHERE project_id = $1 AND decision_date > NOW() - INTERVAL '30 days'
      `, [actualProjectId]),

      // Decisions by project (with project names)
      db.query(`
        SELECT p.name as project_name, COUNT(td.id) as count
        FROM technical_decisions td
        JOIN projects p ON td.project_id = p.id
        GROUP BY p.id, p.name
        ORDER BY count DESC
      `),

      // Total distinct projects with decisions
      db.query(`
        SELECT COUNT(DISTINCT project_id) as count
        FROM technical_decisions
      `)
    ]);

    const decisionsByType: Record<string, number> = {};
    byType.rows.forEach(row => {
      decisionsByType[row.decision_type] = parseInt(row.count);
    });

    const decisionsByStatus: Record<string, number> = {};
    byStatus.rows.forEach(row => {
      decisionsByStatus[row.status] = parseInt(row.count);
    });

    const decisionsByImpact: Record<string, number> = {};
    byImpact.rows.forEach(row => {
      decisionsByImpact[row.impact_level] = parseInt(row.count);
    });

    const decisionsByProject: Record<string, number> = {};
    byProject.rows.forEach(row => {
      decisionsByProject[row.project_name] = parseInt(row.count);
    });

    // Calculate success rate
    let totalOutcomes = 0;
    let successfulOutcomes = 0;
    outcomes.rows.forEach(row => {
      const count = parseInt(row.count);
      totalOutcomes += count;
      if (row.outcome_status === 'successful') {
        successfulOutcomes += count;
      }
    });

    const outcomeSuccess = totalOutcomes > 0 ? Math.round((successfulOutcomes / totalOutcomes) * 100) : 0;

    return {
      totalDecisions: parseInt(total.rows[0].count),
      decisionsByType,
      decisionsByStatus,
      decisionsByImpact,
      decisionsByProject,
      outcomeSuccess,
      recentActivity: parseInt(recent.rows[0].count),
      totalProjects: parseInt(projectCount.rows[0].count)
    };
  }

  /**
   * Generate a decision report for a component or time period
   */
  async generateDecisionReport(
    component?: string, 
    projectId?: string, 
    timeframe?: 'week' | 'month' | 'quarter'
  ): Promise<{
    summary: string;
    keyDecisions: TechnicalDecision[];
    impacts: string[];
    recommendations: string[];
  }> {
    logger.info(`📊 Generating decision report...`);

    const actualProjectId = await this.ensureProjectId(projectId);
    let decisions: TechnicalDecision[] = [];

    if (component) {
      decisions = await this.getDecisionsForComponent(component, actualProjectId);
    } else if (timeframe) {
      const days = timeframe === 'week' ? 7 : timeframe === 'month' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      decisions = await this.searchDecisions({
        projectId: actualProjectId,
        dateFrom: startDate,
        limit: 50
      });
    } else {
      decisions = await this.searchDecisions({
        projectId: actualProjectId,
        limit: 20
      });
    }

    // Analyze decisions for report
    const highImpact = decisions.filter(d => d.impactLevel === 'high' || d.impactLevel === 'critical');
    const successful = decisions.filter(d => d.outcomeStatus === 'successful');
    const failed = decisions.filter(d => d.outcomeStatus === 'failed');

    const summary = `Found ${decisions.length} decisions${component ? ` affecting ${component}` : ''}. ` +
                   `${highImpact.length} high/critical impact decisions. ` +
                   `Success rate: ${successful.length}/${decisions.length} evaluated decisions.`;

    const impacts = [
      ...new Set(decisions.flatMap(d => d.affectedComponents))
    ].slice(0, 10);

    const recommendations = [];
    if (failed.length > successful.length) {
      recommendations.push('Consider reviewing recent decisions - higher failure rate detected');
    }
    if (decisions.some(d => d.outcomeStatus === 'unknown')) {
      recommendations.push('Update outcome status for recent decisions to track effectiveness');
    }
    if (highImpact.length > decisions.length * 0.5) {
      recommendations.push('High concentration of critical decisions - consider breaking down large changes');
    }

    return {
      summary,
      keyDecisions: highImpact.slice(0, 10),
      impacts,
      recommendations
    };
  }

  /**
   * Private helper methods
   */

  private async ensureProjectId(projectId?: string): Promise<string> {
    if (projectId) {
      return projectId;
    }

    await projectHandler.initializeSession();
    const currentProject = await projectHandler.getCurrentProject();
    
    if (currentProject) {
      return currentProject.id;
    }

    throw new Error('No current project set. Use project_switch to set an active project or specify a project ID.');
  }

  private async checkForDuplicate(
    projectId: string, 
    title: string, 
    decisionType: DecisionType
  ): Promise<TechnicalDecision | null> {
    const result = await db.query(`
      SELECT * FROM technical_decisions 
      WHERE project_id = $1 AND decision_type = $2 
        AND similarity(title, $3) > 0.7
      ORDER BY similarity(title, $3) DESC
      LIMIT 1
    `, [projectId, decisionType, title]);

    if (result.rows.length > 0) {
      return this.mapDatabaseRowToDecision(result.rows[0]);
    }
    
    return null;
  }

  private mapDatabaseRowToDecision(row: any): TechnicalDecision {
    return {
      id: row.id,
      projectId: row.project_id,
      sessionId: row.session_id,
      decisionType: row.decision_type,
      title: row.title,
      description: row.description,
      rationale: row.rationale,
      problemStatement: row.problem_statement,
      successCriteria: row.success_criteria,
      alternativesConsidered: typeof row.alternatives_considered === 'string' 
        ? JSON.parse(row.alternatives_considered) 
        : row.alternatives_considered,
      decisionDate: row.decision_date,
      decidedBy: row.decided_by,
      stakeholders: row.stakeholders || [],
      status: row.status,
      supersededBy: row.superseded_by,
      supersededDate: row.superseded_date,
      supersededReason: row.superseded_reason,
      impactLevel: row.impact_level,
      affectedComponents: row.affected_components || [],
      tags: row.tags || [],
      category: row.category,
      outcomeStatus: row.outcome_status,
      outcomeNotes: row.outcome_notes,
      lessonsLearned: row.lessons_learned,
      implementationStatus: row.implementation_status
    };
  }
}

// Export singleton instance
export const decisionsHandler = new DecisionsHandler();
