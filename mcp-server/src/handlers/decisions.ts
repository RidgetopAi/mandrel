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
import { projectHandler } from './project.js';
import { logDecisionEvent, logEvent } from '../middleware/eventLogger.js';

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
}

export type DecisionType = 
  | 'architecture' | 'library' | 'framework' | 'pattern' | 'api_design' 
  | 'database' | 'deployment' | 'security' | 'performance' | 'ui_ux' 
  | 'testing' | 'tooling' | 'process' | 'naming_convention' | 'code_style';

export type DecisionStatus = 'active' | 'deprecated' | 'superseded' | 'under_review';

export type ImpactLevel = 'low' | 'medium' | 'high' | 'critical';

export type OutcomeStatus = 'unknown' | 'successful' | 'failed' | 'mixed' | 'too_early';

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
  decisionType: DecisionType;
  title: string;
  description: string;
  rationale: string;
  problemStatement?: string;
  successCriteria?: string;
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
  supersededBy?: string;
  supersededReason?: string;
}

export interface SearchDecisionsRequest {
  projectId?: string;
  decisionType?: DecisionType;
  status?: DecisionStatus;
  impactLevel?: ImpactLevel;
  component?: string;
  tags?: string[];
  query?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}

export class DecisionsHandler {

  /**
   * Record a new technical decision
   */
  async recordDecision(request: RecordDecisionRequest): Promise<TechnicalDecision> {
    console.log(`📝 Recording ${request.decisionType} decision: "${request.title}"`);

    try {
      const projectId = await this.ensureProjectId(request.projectId);

      // Get active session for decision tracking
      let sessionId: string | null = request.sessionId || null;
      if (!sessionId) {
        try {
          const { SessionTracker } = await import('../services/sessionTracker.js');
          sessionId = await SessionTracker.getActiveSession();
          if (sessionId) {
            console.log(`📋 Linking decision to active session: ${sessionId.substring(0, 8)}...`);
          }
        } catch (error) {
          console.warn('⚠️  Failed to get active session for decision:', error);
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
        console.log(`⚠️  Similar decision exists: ${existingDecision.title}`);
        // Could return warning but allow duplicate, or suggest linking
      }

      // Insert decision
      const result = await db.query(`
        INSERT INTO technical_decisions (
          project_id, session_id, decision_type, title, description, rationale,
          problem_statement, success_criteria, alternatives_considered,
          decided_by, stakeholders, impact_level, affected_components,
          tags, category
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
        request.category?.trim() || null
      ]);

      const decision = this.mapDatabaseRowToDecision(result.rows[0]);

      // TS004-1: Update session activity after decision recording
      if (request.sessionId) {
        const { SessionTracker } = await import('../services/sessionTracker.js');
        await SessionTracker.updateSessionActivity(request.sessionId);
      }

      console.log(`✅ Decision recorded: ${decision.id.substring(0, 8)}...`);
      console.log(`🎯 Impact: ${decision.impactLevel} | Type: ${decision.decisionType}`);
      console.log(`📊 Alternatives considered: ${decision.alternativesConsidered.length}`);

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
      console.error('❌ Failed to record decision:', error);
      throw new Error(`Decision recording failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update an existing decision (status, outcomes, lessons learned)
   */
  async updateDecision(request: UpdateDecisionRequest): Promise<TechnicalDecision> {
    console.log(`📝 Updating decision: ${request.decisionId.substring(0, 8)}...`);

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

      if (request.supersededBy !== undefined) {
        updateFields.push(`superseded_by = $${paramIndex}`);
        updateFields.push(`superseded_date = CURRENT_TIMESTAMP`);
        updateFields.push(`status = 'superseded'`);
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

      console.log(`✅ Decision updated: ${decision.status} | Outcome: ${decision.outcomeStatus}`);
      
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
      console.error('❌ Failed to update decision:', error);
      throw new Error(`Decision update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search technical decisions with various filters
   */
  async searchDecisions(request: SearchDecisionsRequest): Promise<TechnicalDecision[]> {
    console.log(`🔍 Searching decisions...`);

    try {
      const projectId = await this.ensureProjectId(request.projectId);
      
      let sql = `
        SELECT * FROM technical_decisions 
        WHERE project_id = $1
      `;
      const params: any[] = [projectId];
      let paramIndex = 2;

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

      if (request.query && request.query !== '*') {
        sql += ` AND (
          title ILIKE $${paramIndex} OR 
          description ILIKE $${paramIndex} OR 
          rationale ILIKE $${paramIndex} OR
          problem_statement ILIKE $${paramIndex}
        )`;
        params.push(`%${request.query}%`);
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

      sql += ` ORDER BY decision_date DESC LIMIT $${paramIndex}`;
      params.push(request.limit || 20);

      const result = await db.query(sql, params);
      const decisions = result.rows.map(row => this.mapDatabaseRowToDecision(row));

      console.log(`✅ Found ${decisions.length} matching decisions`);
      
      // Log the search event
      await logEvent({
        actor: 'ai',
        event_type: 'decision_search',
        payload: {
          filters: {
            decisionType: request.decisionType,
            status: request.status,
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
      console.error('❌ Failed to search decisions:', error);
      throw new Error(`Decision search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get decisions affecting a specific component
   */
  async getDecisionsForComponent(component: string, projectId?: string): Promise<TechnicalDecision[]> {
    console.log(`🎯 Getting decisions for component: ${component}`);

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
    console.log(`📋 Deprecating decision: ${decisionId.substring(0, 8)}...`);

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
    outcomeSuccess: number;
    recentActivity: number;
  }> {
    const actualProjectId = await this.ensureProjectId(projectId);

    const [total, byType, byStatus, byImpact, outcomes, recent] = await Promise.all([
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
      `, [actualProjectId])
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
      outcomeSuccess,
      recentActivity: parseInt(recent.rows[0].count)
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
    console.log(`📊 Generating decision report...`);

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
      lessonsLearned: row.lessons_learned
    };
  }
}

// Export singleton instance
export const decisionsHandler = new DecisionsHandler();
