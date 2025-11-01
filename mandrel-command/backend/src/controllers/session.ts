import { Request, Response } from 'express';
import { SessionAnalyticsService } from '../services/sessionAnalytics';
import { SessionDetailService } from '../services/sessionDetail';
import { db as pool } from '../database/connection';
import type { UpdateSessionData } from '../validation/schemas';

export class SessionController {
  /**
   * GET /sessions/:id - Get comprehensive session details with contexts, decisions, tasks
   */
  static async getSessionDetail(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const session = await SessionDetailService.getSessionDetail(id);

      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found'
        });
        return;
      }

      res.json({
        success: true,
        data: { session }
      });
    } catch (error) {
      console.error('Get session detail error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get session details'
      });
    }
  }

  /**
   * GET /sessions/analytics - Get session analytics
   */
  static async getSessionAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { project_id } = req.query;
      const projectId = typeof project_id === 'string' ? project_id : undefined;
      
      const analytics = await SessionAnalyticsService.getSessionAnalytics(projectId);

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      console.error('Get session analytics error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get session analytics'
      });
    }
  }

  /**
   * GET /sessions/trends - Get session trends over time
   */
  static async getSessionTrends(req: Request, res: Response): Promise<void> {
    try {
      const { days, project_id } = req.query;
      const numDays = typeof days === 'string' ? parseInt(days) : 30;
      const projectId = typeof project_id === 'string' ? project_id : undefined;
      
      const trends = await SessionAnalyticsService.getSessionTrends(numDays, projectId);

      res.json({
        success: true,
        data: trends
      });
    } catch (error) {
      console.error('Get session trends error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get session trends'
      });
    }
  }

  /**
   * GET /sessions/productive - Get most productive sessions
   */
  static async getProductiveSessions(req: Request, res: Response): Promise<void> {
    try {
      const { limit, project_id } = req.query;
      const limitNum = typeof limit === 'string' ? parseInt(limit) : 10;
      const projectId = typeof project_id === 'string' ? project_id : undefined;
      
      const sessions = await SessionAnalyticsService.getProductiveSessions(limitNum, projectId);

      res.json({
        success: true,
        data: { sessions }
      });
    } catch (error) {
      console.error('Get productive sessions error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get productive sessions'
      });
    }
  }

  /**
   * GET /sessions/token-patterns - Get token usage patterns by hour
   */
  static async getTokenUsagePatterns(req: Request, res: Response): Promise<void> {
    try {
      const { project_id } = req.query;
      const projectId = typeof project_id === 'string' ? project_id : undefined;
      
      const patterns = await SessionAnalyticsService.getTokenUsagePatterns(projectId);

      res.json({
        success: true,
        data: { patterns }
      });
    } catch (error) {
      console.error('Get token usage patterns error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get token usage patterns'
      });
    }
  }

  /**
   * GET /sessions/summaries - Get session summaries with activity counts
   */
  static async getSessionSummaries(req: Request, res: Response): Promise<void> {
    try {
      const { project_id, limit, offset } = req.query;
      const projectId = typeof project_id === 'string' ? project_id : undefined;
      const limitNum = typeof limit === 'string' ? parseInt(limit) : 20;
      const offsetNum = typeof offset === 'string' ? parseInt(offset) : 0;
      
      const summaries = await SessionDetailService.getSessionSummaries(projectId, limitNum, offsetNum);

      res.json({
        success: true,
        data: { summaries }
      });
    } catch (error) {
      console.error('Get session summaries error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get session summaries'
      });
    }
  }

  /**
   * GET /sessions/stats-by-period - Get aggregated session statistics by time period
   */
  static async getSessionStatsByPeriod(req: Request, res: Response): Promise<void> {
    try {
      const { period, project_id, limit } = req.query;
      const periodType = (period === 'day' || period === 'week' || period === 'month') ? period : 'day';
      const projectId = typeof project_id === 'string' ? project_id : undefined;
      const limitNum = typeof limit === 'string' ? parseInt(limit) : 30;
      
      const stats = await SessionDetailService.getSessionStatsByPeriod(periodType, projectId, limitNum);

      res.json({
        success: true,
        data: { stats }
      });
    } catch (error) {
      console.error('Get session stats by period error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get session statistics by period'
      });
    }
  }

  /**
   * GET /sessions/current - Get current active session
   * Returns the most recent MCP/agent session with activity
   */
  static async getCurrentSession(_req: Request, res: Response): Promise<void> {
    try {
      // Get the most recently active session (prefer MCP sessions, then any with recent activity)
      const result = await pool.query(`
        SELECT
          s.id,
          s.project_id,
          s.title,
          s.description,
          s.started_at,
          s.ended_at,
          s.last_activity_at,
          s.agent_type,
          s.status,
          s.ai_model,
          s.input_tokens,
          s.output_tokens,
          s.total_tokens,
          s.tasks_created,
          s.tasks_updated,
          s.tasks_completed,
          s.contexts_created,
          p.name as project_name,
          (SELECT COUNT(*) FROM contexts WHERE session_id = s.id) as context_count
        FROM sessions s
        LEFT JOIN projects p ON s.project_id = p.id
        WHERE s.agent_type != 'web-ui' OR s.agent_type IS NULL
        ORDER BY
          CASE WHEN s.agent_type = 'mcp-client' THEN 0 ELSE 1 END,
          s.last_activity_at DESC NULLS LAST,
          s.started_at DESC
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        res.json({
          success: true,
          data: { session: null }
        });
        return;
      }

      const row = result.rows[0];
      const session = {
        id: row.id,
        project_id: row.project_id,
        project_name: row.project_name || 'Unknown',
        title: row.title || `Session ${row.id.substring(0, 8)}`,
        description: row.description || '',
        created_at: row.started_at,
        ended_at: row.ended_at,
        last_activity_at: row.last_activity_at,
        agent_type: row.agent_type,
        status: row.status,
        ai_model: row.ai_model,
        input_tokens: parseInt(row.input_tokens) || 0,
        output_tokens: parseInt(row.output_tokens) || 0,
        total_tokens: parseInt(row.total_tokens) || 0,
        tasks_created: parseInt(row.tasks_created) || 0,
        tasks_updated: parseInt(row.tasks_updated) || 0,
        tasks_completed: parseInt(row.tasks_completed) || 0,
        contexts_created: parseInt(row.contexts_created) || 0,
        context_count: parseInt(row.context_count) || 0,
        last_context_at: row.last_activity_at
      };

      res.json({
        success: true,
        data: { session }
      });
    } catch (error) {
      console.error('Get current session error:', error);
      res.status(500).json({
        success: false,
        error: { type: 'internal', message: 'Failed to get current session' }
      });
    }
  }

  /**
   * POST /sessions/assign - Assign current session to a project
   */
  static async assignCurrentSession(_req: Request, res: Response): Promise<void> {
    // Temporarily disabled for task investigation
    res.status(501).json({
      success: false,
      error: 'Session assignment endpoint temporarily disabled'
    });
  }

  /**
   * PUT /sessions/:id - Update session metadata
   */
  static async updateSession(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body as UpdateSessionData;

      const existingSession = await SessionController.fetchSessionSummary(id);
      if (!existingSession) {
        res.status(404).json({
          success: false,
          error: {
            type: 'not_found',
            message: 'Session not found',
          },
        });
        return;
      }

      // Update sessions table (unified table)
      const fields: string[] = [];
      const values: Array<any> = [id];

      if (typeof updates.title !== 'undefined') {
        fields.push(`title = $${values.length + 1}`);
        values.push(updates.title);
      }

      if (typeof updates.description !== 'undefined') {
        fields.push(`description = $${values.length + 1}`);
        values.push(updates.description);
      }

      if (typeof updates.session_goal !== 'undefined') {
        fields.push(`session_goal = $${values.length + 1}`);
        values.push(updates.session_goal);
      }

      if (typeof updates.tags !== 'undefined') {
        fields.push(`tags = $${values.length + 1}`);
        values.push(updates.tags);
      }

      if (typeof updates.ai_model !== 'undefined') {
        fields.push(`ai_model = $${values.length + 1}`);
        values.push(updates.ai_model);
      }

      if (typeof updates.project_id !== 'undefined') {
        fields.push(`project_id = $${values.length + 1}::uuid`);
        values.push(updates.project_id);
      }

      if (fields.length > 0) {
        fields.push('updated_at = NOW()');
        const updateQuery = `UPDATE sessions SET ${fields.join(', ')} WHERE id = $1`;
        await pool.query(updateQuery, values);
      }

      const updatedSession = await SessionController.fetchSessionSummary(id);
      if (!updatedSession) {
        res.status(500).json({
          success: false,
          error: {
            type: 'internal',
            message: 'Failed to load updated session',
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          session: updatedSession,
        },
      });
    } catch (error) {
      console.error('Update session error:', error);
      res.status(500).json({
        success: false,
        error: {
          type: 'internal',
          message: error instanceof Error ? error.message : 'Failed to update session',
        },
      });
    }
  }

  /**
   * GET /sessions - Get sessions list with filtering
   */
  static async getSessionsList(req: Request, res: Response): Promise<void> {
    try {
      const { project_id, status, limit, offset } = req.query;
      
      const params: {
        projectId?: string;
        status?: string;
        limit?: number;
        offset?: number;
      } = {
        limit: typeof limit === 'string' ? parseInt(limit) : 50,
        offset: typeof offset === 'string' ? parseInt(offset) : 0,
      };
      
      if (typeof project_id === 'string') {
        params.projectId = project_id;
      }
      
      if (typeof status === 'string') {
        params.status = status;
      }
      
      const sessions = await SessionAnalyticsService.getSessionsList(params);

      res.json({
        success: true,
        data: sessions
      });
    } catch (error) {
      console.error('Get sessions list error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get sessions list'
      });
    }
  }

  /**
   * GET /sessions/stats - Get session statistics for dashboard
   */
  static async getSessionStats(req: Request, res: Response): Promise<void> {
    try {
      const { project_id } = req.query;
      const projectId = typeof project_id === 'string' ? project_id : undefined;
      
      const stats = await SessionAnalyticsService.getSessionStats(projectId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get session stats error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get session stats'
      });
    }
  }
  private static async fetchSessionSummary(sessionId: string): Promise<SessionSummary | null> {
    // Query unified sessions table
    const sessionsQuery = `
      SELECT
        s.id,
        s.project_id,
        p.name AS project_name,
        s.title,
        s.description,
        s.session_goal,
        s.tags,
        s.ai_model,
        s.agent_type as session_type,
        s.status,
        s.started_at as created_at,
        s.updated_at,
        s.contexts_created AS context_count,
        COALESCE(s.last_activity_at, s.ended_at, s.started_at) AS last_context_at
      FROM sessions s
      LEFT JOIN projects p ON p.id = s.project_id
      WHERE s.id = $1
    `;

    const { rows } = await pool.query<SessionSummaryRow>(sessionsQuery, [sessionId]);
    
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      project_id: row.project_id ?? undefined,
      project_name: row.project_name,
      title: row.title,
      description: row.description,
      session_goal: row.session_goal,
      tags: row.tags,
      ai_model: row.ai_model,
      session_type: row.session_type,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      context_count: row.context_count !== null ? Number(row.context_count) : undefined,
      last_context_at: row.last_context_at,
    };
  }
}

interface SessionSummaryRow {
  id: string;
  project_id: string | null;
  project_name: string | null;
  title: string | null;
  description: string | null;
  session_goal?: string | null;
  tags?: string[] | null;
  ai_model?: string | null;
  session_type: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  context_count: string | null;
  last_context_at: string | null;
}

interface SessionSummary {
  id: string;
  project_id?: string;
  project_name?: string | null;
  title?: string | null;
  description?: string | null;
  session_goal?: string | null;
  tags?: string[] | null;
  ai_model?: string | null;
  session_type?: string | null;
  status?: string | null;
  created_at: string;
  updated_at: string;
  context_count?: number;
  last_context_at?: string | null;
}