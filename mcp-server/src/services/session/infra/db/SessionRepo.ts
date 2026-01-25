/**
 * SessionRepo - Database operations for sessions table
 */

import { db } from '../../../../config/database.js';
import { logger } from '../../../../utils/logger.js';
import type { SessionData } from '../../types.js';

export interface CreateSessionParams {
  sessionId: string;
  projectId: string | null;
  sessionType: string;
  startTime: Date;
  title?: string | null;
  description?: string | null;
  sessionGoal?: string | null;
  tags?: string[];
  aiModel?: string | null;
  activeBranch?: string | null;
  workingCommitSha?: string | null;
  metadata?: Record<string, any>;
}

export interface EndSessionParams {
  sessionId: string;
  endTime: Date;
  durationMs: number;
  tokenUsage: { input: number; output: number; total: number };
  activityCounts: {
    tasks_created: number;
    tasks_updated: number;
    tasks_completed: number;
    contexts_created: number;
  };
  operationsCount: number;
  productivityScore: number;
}

export const SessionRepo = {
  /**
   * Create a new session record
   */
  async create(params: CreateSessionParams): Promise<{ id: string; started_at: Date } | null> {
    try {
      const sql = `
        INSERT INTO sessions (
          id, project_id, agent_type, started_at, last_activity_at, title, description,
          session_goal, tags, ai_model, active_branch, working_commit_sha, metadata
        ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, started_at
      `;

      const result = await db.query(sql, [
        params.sessionId,
        params.projectId,
        params.sessionType,
        params.startTime,
        params.title || null,
        params.description || null,
        params.sessionGoal || null,
        params.tags || [],
        params.aiModel || null,
        params.activeBranch || null,
        params.workingCommitSha || null,
        JSON.stringify(params.metadata || {})
      ]);

      return result.rows[0] || null;

    } catch (error) {
      logger.error('Failed to create session', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionRepo',
        operation: 'create',
        metadata: { sessionId: params.sessionId }
      });
      throw error;
    }
  },

  /**
   * Finalize a session with end time and metrics
   */
  async finish(params: EndSessionParams): Promise<boolean> {
    try {
      const sql = `
        UPDATE sessions
        SET ended_at = $1,
            tokens_used = $2,
            input_tokens = $3,
            output_tokens = $4,
            total_tokens = $5,
            tasks_created = $6,
            tasks_updated = $7,
            tasks_completed = $8,
            contexts_created = $9,
            context_summary = $10,
            metadata = metadata || $11::jsonb
        WHERE id = $12
      `;

      const contextSummary = `Session completed with ${params.activityCounts.tasks_created} tasks and ${params.activityCounts.contexts_created} contexts`;

      await db.query(sql, [
        params.endTime,
        params.tokenUsage.total,
        params.tokenUsage.input,
        params.tokenUsage.output,
        params.tokenUsage.total,
        params.activityCounts.tasks_created,
        params.activityCounts.tasks_updated,
        params.activityCounts.tasks_completed,
        params.activityCounts.contexts_created,
        contextSummary,
        JSON.stringify({
          end_time: params.endTime.toISOString(),
          duration_ms: params.durationMs,
          contexts_created: params.activityCounts.contexts_created,
          tasks_created: params.activityCounts.tasks_created,
          tasks_updated: params.activityCounts.tasks_updated,
          tasks_completed: params.activityCounts.tasks_completed,
          operations_count: params.operationsCount,
          productivity_score: params.productivityScore,
          input_tokens: params.tokenUsage.input,
          output_tokens: params.tokenUsage.output,
          total_tokens: params.tokenUsage.total,
          completed_by: 'aidis-session-tracker'
        }),
        params.sessionId
      ]);

      return true;

    } catch (error) {
      logger.error('Failed to finish session', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionRepo',
        operation: 'finish',
        metadata: { sessionId: params.sessionId }
      });
      throw error;
    }
  },

  /**
   * Update productivity score
   */
  async updateProductivityScore(sessionId: string, score: number): Promise<void> {
    await db.query('UPDATE sessions SET productivity_score = $1 WHERE id = $2', [score, sessionId]);
  },

  /**
   * Get the last active (non-ended) session
   */
  async getLastActive(): Promise<string | null> {
    try {
      const sql = `
        SELECT id
        FROM sessions
        WHERE ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1
      `;

      const result = await db.query(sql);
      return result.rows[0]?.id || null;

    } catch (error) {
      logger.error('Failed to get last active session', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionRepo',
        operation: 'getLastActive'
      });
      return null;
    }
  },

  /**
   * Update last activity timestamp
   */
  async touchActivity(sessionId: string): Promise<void> {
    try {
      await db.query(
        `UPDATE sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'active'`,
        [sessionId]
      );
    } catch (error) {
      logger.error('Failed to update session activity', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionRepo',
        operation: 'touchActivity',
        metadata: { sessionId }
      });
    }
  },

  /**
   * Update activity count and last activity
   */
  async updateActivityCount(sessionId: string): Promise<void> {
    try {
      const sql = `
        UPDATE sessions
        SET activity_count = (SELECT COUNT(*) FROM session_activities WHERE session_id = $1),
            last_activity_at = NOW()
        WHERE id = $1
      `;
      await db.query(sql, [sessionId]);
    } catch (error) {
      logger.error('Failed to update activity count', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionRepo',
        operation: 'updateActivityCount',
        metadata: { sessionId }
      });
    }
  },

  /**
   * Update file aggregate metrics
   */
  async updateFileMetrics(sessionId: string): Promise<void> {
    try {
      const sql = `
        UPDATE sessions
        SET
          files_modified_count = (SELECT COUNT(DISTINCT file_path) FROM session_files WHERE session_id = $1),
          lines_added = (SELECT COALESCE(SUM(lines_added), 0) FROM session_files WHERE session_id = $1),
          lines_deleted = (SELECT COALESCE(SUM(lines_deleted), 0) FROM session_files WHERE session_id = $1),
          lines_net = (SELECT COALESCE(SUM(lines_added - lines_deleted), 0) FROM session_files WHERE session_id = $1)
        WHERE id = $1
      `;
      await db.query(sql, [sessionId]);
    } catch (error) {
      logger.error('Failed to update file metrics', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionRepo',
        operation: 'updateFileMetrics',
        metadata: { sessionId }
      });
    }
  },

  /**
   * Get full session data
   */
  async getSessionData(sessionId: string): Promise<SessionData | null> {
    try {
      const sql = `
        SELECT
          s.id,
          s.project_id,
          s.started_at,
          s.ended_at,
          s.title,
          s.description,
          s.session_goal,
          s.tags,
          s.lines_added,
          s.lines_deleted,
          s.lines_net,
          s.productivity_score,
          s.ai_model,
          s.files_modified_count,
          s.activity_count,
          s.status,
          s.last_activity_at,
          s.input_tokens,
          s.output_tokens,
          s.total_tokens,
          s.contexts_created,
          s.tasks_created,
          s.tasks_updated,
          s.tasks_completed,
          EXTRACT(EPOCH FROM (COALESCE(s.ended_at, NOW()) - s.started_at)) * 1000 as duration_ms
        FROM sessions s
        WHERE s.id = $1
      `;

      const result = await db.query(sql, [sessionId]);

      if (result.rows.length === 0) {
        return null;
      }

      const session = result.rows[0];

      return {
        session_id: session.id,
        start_time: session.started_at,
        end_time: session.ended_at,
        duration_ms: parseFloat(session.duration_ms) || 0,
        project_id: session.project_id,
        title: session.title,
        description: session.description,
        session_goal: session.session_goal,
        tags: session.tags || [],
        lines_added: session.lines_added || 0,
        lines_deleted: session.lines_deleted || 0,
        lines_net: session.lines_net || 0,
        productivity_score: parseFloat(session.productivity_score) || 0,
        ai_model: session.ai_model,
        files_modified_count: session.files_modified_count || 0,
        activity_count: session.activity_count || 0,
        contexts_created: session.contexts_created || 0,
        decisions_created: 0, // Filled by caller
        operations_count: session.activity_count || 0,
        success_status: !session.ended_at ? 'active' :
                       (session.activity_count > 0 ? 'completed' : 'abandoned'),
        status: session.status || 'active',
        last_activity_at: session.last_activity_at,
        input_tokens: session.input_tokens || 0,
        output_tokens: session.output_tokens || 0,
        total_tokens: session.total_tokens || 0
      };

    } catch (error) {
      logger.error('Failed to get session data', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionRepo',
        operation: 'getSessionData',
        metadata: { sessionId }
      });
      return null;
    }
  },

  /**
   * Update session details (title, description, goal, tags)
   */
  async updateDetails(
    sessionId: string,
    title?: string,
    description?: string,
    sessionGoal?: string,
    tags?: string[]
  ): Promise<boolean> {
    try {
      const sql = `
        UPDATE sessions
        SET title = COALESCE($2, title),
            description = COALESCE($3, description),
            session_goal = COALESCE($4, session_goal),
            tags = COALESCE($5, tags),
            updated_at = NOW(),
            metadata = metadata || $6::jsonb
        WHERE id = $1
        RETURNING id
      `;

      const result = await db.query(sql, [
        sessionId,
        title || null,
        description || null,
        sessionGoal || null,
        tags || null,
        JSON.stringify({
          title_updated: !!title,
          description_updated: !!description,
          session_goal_updated: !!sessionGoal,
          tags_updated: !!(tags && tags.length > 0),
          updated_by: 'aidis-session-tracker',
          updated_at: new Date().toISOString()
        })
      ]);

      return result.rows.length > 0;

    } catch (error) {
      logger.error('Failed to update session details', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionRepo',
        operation: 'updateDetails',
        metadata: { sessionId }
      });
      return false;
    }
  },

  /**
   * Get session with basic details
   */
  async getWithDetails(sessionId: string): Promise<{
    id: string;
    title?: string;
    description?: string;
    project_id?: string;
    started_at: Date;
    ended_at?: Date;
  } | null> {
    try {
      const sql = `
        SELECT id, title, description, project_id, started_at, ended_at
        FROM sessions 
        WHERE id = $1
      `;

      const result = await db.query(sql, [sessionId]);
      return result.rows[0] || null;

    } catch (error) {
      logger.error('Failed to get session with details', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionRepo',
        operation: 'getWithDetails',
        metadata: { sessionId }
      });
      return null;
    }
  },

  /**
   * Add tokens to session (for batch flushing)
   */
  async addTokens(
    sessionId: string,
    inputTokens: number,
    outputTokens: number,
    totalTokens: number
  ): Promise<void> {
    try {
      const sql = `
        UPDATE sessions
        SET input_tokens = COALESCE(input_tokens, 0) + $2,
            output_tokens = COALESCE(output_tokens, 0) + $3,
            total_tokens = COALESCE(total_tokens, 0) + $4,
            tokens_used = COALESCE(tokens_used, 0) + $4,
            last_activity_at = NOW()
        WHERE id = $1
      `;

      await db.query(sql, [sessionId, inputTokens, outputTokens, totalTokens]);

    } catch (error) {
      logger.error('Failed to add tokens', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionRepo',
        operation: 'addTokens',
        metadata: { sessionId }
      });
    }
  },

  /**
   * Apply activity counts to session (for batch flushing)
   */
  async applyActivityCounts(
    sessionId: string,
    tasksCreated: number,
    tasksUpdated: number,
    tasksCompleted: number,
    contextsCreated: number
  ): Promise<void> {
    try {
      const sql = `
        UPDATE sessions
        SET tasks_created = COALESCE(tasks_created, 0) + $2,
            tasks_updated = COALESCE(tasks_updated, 0) + $3,
            tasks_completed = COALESCE(tasks_completed, 0) + $4,
            contexts_created = COALESCE(contexts_created, 0) + $5,
            last_activity_at = NOW()
        WHERE id = $1
      `;

      await db.query(sql, [sessionId, tasksCreated, tasksUpdated, tasksCompleted, contextsCreated]);

    } catch (error) {
      logger.error('Failed to apply activity counts', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionRepo',
        operation: 'applyActivityCounts',
        metadata: { sessionId }
      });
    }
  },

  /**
   * Get starting commit SHA for a session
   */
  async getStartingCommitSha(sessionId: string): Promise<string | null> {
    try {
      const result = await db.query(
        'SELECT working_commit_sha FROM sessions WHERE id = $1',
        [sessionId]
      );
      return result.rows[0]?.working_commit_sha || null;
    } catch (error) {
      logger.error('Failed to get starting commit SHA', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionRepo',
        operation: 'getStartingCommitSha',
        metadata: { sessionId }
      });
      return null;
    }
  },

  /**
   * Get project root directory for a session
   */
  async getProjectRootDir(sessionId: string): Promise<string | null> {
    try {
      const result = await db.query(`
        SELECT p.root_directory
        FROM sessions s
        JOIN projects p ON s.project_id = p.id
        WHERE s.id = $1
      `, [sessionId]);
      return result.rows[0]?.root_directory || null;
    } catch (error) {
      logger.error('Failed to get project root dir', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionRepo',
        operation: 'getProjectRootDir',
        metadata: { sessionId }
      });
      return null;
    }
  },

  /**
   * Count decisions for a session
   */
  async countDecisions(sessionId: string): Promise<number> {
    try {
      const result = await db.query(
        'SELECT COUNT(*) as count FROM technical_decisions WHERE session_id = $1',
        [sessionId]
      );
      return parseInt(result.rows[0]?.count || '0');
    } catch (error) {
      logger.error('Failed to count decisions', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionRepo',
        operation: 'countDecisions',
        metadata: { sessionId }
      });
      return 0;
    }
  },

  /**
   * Count contexts for a session
   */
  async countContexts(sessionId: string): Promise<number> {
    try {
      const result = await db.query(
        'SELECT COUNT(*) as count FROM contexts WHERE session_id = $1',
        [sessionId]
      );
      return parseInt(result.rows[0]?.count || '0');
    } catch (error) {
      logger.error('Failed to count contexts', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionRepo',
        operation: 'countContexts',
        metadata: { sessionId }
      });
      return 0;
    }
  },

  /**
   * Get productivity config
   */
  async getProductivityConfig(configName: string = 'default'): Promise<Record<string, any> | null> {
    try {
      const result = await db.query(
        'SELECT formula_weights FROM productivity_config WHERE config_name = $1',
        [configName]
      );
      return result.rows[0]?.formula_weights || null;
    } catch (error) {
      logger.error('Failed to get productivity config', error instanceof Error ? error : new Error('Unknown error'), {
        component: 'SessionRepo',
        operation: 'getProductivityConfig',
        metadata: { configName }
      });
      return null;
    }
  }
};
