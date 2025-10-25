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
   */
  static async getCurrentSession(_req: Request, res: Response): Promise<void> {
    try {
      // Import dynamically to avoid circular dependencies
      const { MCPIntegrationService } = await import('../services/mcpIntegration');
      
      // Get current session from MCP server
      const mcpSession = await MCPIntegrationService.getCurrentSession();
      
      if (!mcpSession) {
        res.json({
          success: true,
          data: { session: null }
        });
        return;
      }
      
      // Transform MCP session to UI session format
      const session = {
        id: mcpSession.sessionId,
        project_id: mcpSession.projectId || 'unknown',
        project_name: mcpSession.projectName || 'Unknown',
        title: mcpSession.title || `Session ${mcpSession.sessionId.substring(0, 8)}`,
        description: mcpSession.description || '',
        created_at: mcpSession.startedAt || new Date().toISOString(),
        context_count: mcpSession.contextCount || 0,
        last_context_at: mcpSession.lastContextAt || null
      };

      res.json({
        success: true,
        data: { session }
      });
    } catch (error) {
      console.error('Get current session error:', error);
      // If MCP integration fails, return null instead of erroring
      res.json({
        success: true,
        data: { session: null }
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

      // Determine which table contains this session
      const userSessionCheck = await pool.query('SELECT id FROM user_sessions WHERE id = $1', [id]);
      const isUserSession = userSessionCheck.rows.length > 0;

      if (isUserSession) {
        // user_sessions table doesn't have title/description columns
        if (updates.title || updates.description) {
          console.warn(`Session ${id} is in user_sessions table which doesn't support title/description updates`);
        }
        
        // Only update timestamp
        await pool.query('UPDATE user_sessions SET updated_at = NOW() WHERE id = $1', [id]);
      } else {
        // sessions table - supports all session fields
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
    // Try user_sessions first (no title/description columns)
    const userSessionQuery = `
      SELECT
        s.id,
        s.project_id,
        p.name AS project_name,
        NULL::text as title,
        NULL::text as description,
        s.session_type,
        NULL::text as status,
        s.created_at,
        s.updated_at,
        ctx.total_contexts AS context_count,
        ctx.last_context_at
      FROM user_sessions s
      LEFT JOIN projects p ON p.id = s.project_id
      LEFT JOIN (
        SELECT session_id, COUNT(*)::text AS total_contexts, MAX(created_at) AS last_context_at
        FROM contexts
        GROUP BY session_id
      ) ctx ON ctx.session_id = s.id
      WHERE s.id = $1
    `;

    const { rows: userRows } = await pool.query<SessionSummaryRow>(userSessionQuery, [sessionId]);
    
    if (userRows.length > 0) {
      const row = userRows[0];
      return {
        id: row.id,
        project_id: row.project_id ?? undefined,
        project_name: row.project_name,
        title: row.title,
        description: row.description,
        session_type: row.session_type,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        context_count: row.context_count !== null ? Number(row.context_count) : undefined,
        last_context_at: row.last_context_at,
      };
    }

    // Fallback to sessions table
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
        NULL::text as session_type,
        s.status,
        s.started_at as created_at,
        s.updated_at,
        ctx.total_contexts AS context_count,
        ctx.last_context_at
      FROM sessions s
      LEFT JOIN projects p ON p.id = s.project_id
      LEFT JOIN (
        SELECT session_id, COUNT(*)::text AS total_contexts, MAX(created_at) AS last_context_at
        FROM contexts
        GROUP BY session_id
      ) ctx ON ctx.session_id = s.id
      WHERE s.id = $1
    `;

    const { rows: sessionRows } = await pool.query<SessionSummaryRow>(sessionsQuery, [sessionId]);
    
    if (sessionRows.length === 0) {
      return null;
    }

    const row = sessionRows[0];
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