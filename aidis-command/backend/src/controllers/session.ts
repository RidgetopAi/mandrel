import { Request, Response } from 'express';
import { SessionAnalyticsService } from '../services/sessionAnalytics';
import { SessionDetailService } from '../services/sessionDetail';

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
      // For now, return null as there's no active session tracking
      // This will be enhanced when MCP integration is properly set up
      res.json({
        success: true,
        data: { session: null }
      });
    } catch (error) {
      console.error('Get current session error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get current session'
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
}
