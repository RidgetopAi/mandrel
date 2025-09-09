import { Request, Response } from 'express';
import { SessionService } from '../services/session';
import { SessionAnalyticsService } from '../services/sessionAnalytics';

export class SessionController {
  /**
   * GET /sessions/:id - Get session details with contexts
   */
  static async getSessionDetail(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const session = await SessionService.getSessionDetail(id);

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
        data: { analytics }
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
        data: { trends }
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
}
