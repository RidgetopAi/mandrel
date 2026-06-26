import { Request, Response } from 'express';
import { ProjectService } from '../services/project';
import { McpService } from '../services/mcp';
import { ProjectInsightsService } from '../services/projectInsights';
import { db } from '../database/connection';
import { logger } from '../config/logger';
import { isValidUuid } from '../utils/uuid';

export class ProjectController {
  /**
   * GET /projects/watchable - Get projects with root_directory for mandrel-watcher
   * This endpoint is unauthenticated - used by local watcher daemon
   */
  static async getWatchableProjects(_req: Request, res: Response): Promise<void> {
    try {
      const projects = await ProjectService.getWatchableProjects();

      res.json({
        success: true,
        data: {
          projects,
          total: projects.length
        }
      });
    } catch (error) {
      logger.error('Get watchable projects error', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get watchable projects'
      });
    }
  }

  /**
   * GET /projects - Get all projects
   */
  static async getAllProjects(_req: Request, res: Response): Promise<void> {
    try {
      const projects = await ProjectService.getAllProjects();
      
      res.json({
        success: true,
        data: {
          projects,
          total: projects.length
        }
      });
    } catch (error) {
      logger.error('Get all projects error', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get projects'
      });
    }
  }

  /**
   * GET /projects/:id - Get single project by ID
   */
  static async getProject(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const project = await ProjectService.getProjectById(id);

      if (!project) {
        res.status(404).json({
          success: false,
          error: 'Project not found'
        });
        return;
      }

      res.json({
        success: true,
        data: { project }
      });
    } catch (error) {
      logger.error('Get project error', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get project'
      });
    }
  }

  /**
   * POST /projects - Create new project
   */
  static async createProject(req: Request, res: Response): Promise<void> {
    try {
      const projectData = req.body;

      // Basic validation
      if (!projectData.name || projectData.name.trim() === '') {
        res.status(400).json({
          success: false,
          error: 'Project name is required'
        });
        return;
      }

      const project = await ProjectService.createProject(projectData);

      res.status(201).json({
        success: true,
        data: { project }
      });
    } catch (error) {
      logger.error('Create project error', { error });
      
      if (error instanceof Error && error.message === 'Project name already exists') {
        res.status(409).json({
          success: false,
          error: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create project'
      });
    }
  }

  /**
   * PUT /projects/:id - Update project
   */
  static async updateProject(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      const project = await ProjectService.updateProject(id, updates);

      if (!project) {
        res.status(404).json({
          success: false,
          error: 'Project not found'
        });
        return;
      }

      res.json({
        success: true,
        data: { project }
      });
    } catch (error) {
      logger.error('Update project error', { error });
      
      if (error instanceof Error && error.message === 'Project name already exists') {
        res.status(409).json({
          success: false,
          error: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update project'
      });
    }
  }

  /**
   * DELETE /projects/:id - Delete project
   */
  static async deleteProject(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const deleted = await ProjectService.deleteProject(id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Project not found'
        });
        return;
      }

      res.json({
        success: true,
        data: { message: 'Project deleted successfully' }
      });
    } catch (error) {
      logger.error('Delete project error', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete project'
      });
    }
  }

  /**
   * GET /projects/:id/sessions - Get project sessions
   */
  static async getProjectSessions(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const sessions = await ProjectService.getProjectSessions(id);

      res.json({
        success: true,
        data: {
          sessions,
          total: sessions.length
        }
      });
    } catch (error) {
      logger.error('Get project sessions error', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get project sessions'
      });
    }
  }

  /**
   * GET /projects/sessions/all - Get all sessions across projects
   */
  static async getAllSessions(req: Request, res: Response): Promise<void> {
    try {
      // Honor the query filters the dashboard widget sends. Previously these
      // were ignored (the param was `_req`), so the UI thought it was filtering
      // by project/limit but always received every session.
      const rawProjectId = req.query.project_id;
      const projectId =
        typeof rawProjectId === 'string' && isValidUuid(rawProjectId)
          ? rawProjectId
          : undefined;

      const rawLimit = req.query.limit;
      const parsedLimit =
        typeof rawLimit === 'string' ? Number.parseInt(rawLimit, 10) : NaN;
      const limit =
        Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;

      const sessions = await ProjectService.getAllSessions({ projectId, limit });

      res.json({
        success: true,
        data: {
          sessions,
          total: sessions.length
        }
      });
    } catch (error) {
      logger.error('Get all sessions error', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get sessions'
      });
    }
  }

  /**
   * GET /projects/stats - Get project statistics
   */
  static async getProjectStats(_req: Request, res: Response): Promise<void> {
    try {
      const stats = await ProjectService.getProjectStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Get project stats error', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get project statistics'
      });
    }
  }

  /**
   * GET /projects/:id/insights - Get real project insights from database
   */
  static async getProjectInsights(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      logger.info(`[Project Insights] Getting insights for project ${id}`);

      // Get insights directly from database
      const insights = await ProjectInsightsService.getProjectInsights(id);

      logger.info('[Project Insights] Database result', { insights });

      res.json({
        success: true,
        data: insights
      });
    } catch (error) {
      logger.error('Get project insights error', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get project insights'
      });
    }
  }

  /**
   * POST /projects/:id/set-primary - Set project as primary/default
   * Proxies to MCP server's /api/v2/projects/:id/set-primary endpoint
   */
  static async setPrimary(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      logger.info(`[Set Primary] Setting project ${id} as primary`);

      // Call MCP server's set-primary endpoint
      const mcpResponse = await McpService.callMcpEndpoint(
        `/api/v2/projects/${id}/set-primary`,
        'POST'
      );

      logger.info('[Set Primary] MCP response', { mcpResponse });

      res.json(mcpResponse);
    } catch (error) {
      logger.error('Set primary project error', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set primary project'
      });
    }
  }

  /**
   * POST /projects/clear-primary - Clear the primary/default flag from all projects
   *
   * Unlike set-primary, there is no MCP REST endpoint to clear the flag, so this
   * clears the is_primary metadata key directly against the shared database. This
   * persists a "no default project" choice server-side so the next login's seed
   * does not re-apply a previously-set primary.
   */
  static async clearPrimary(_req: Request, res: Response): Promise<void> {
    const client = await db.connect();

    try {
      logger.info('[Clear Primary] Clearing is_primary flag from all projects');

      const updateResult = await client.query(
        `UPDATE projects
         SET metadata = metadata - 'is_primary'
         WHERE metadata->>'is_primary' = 'true'`
      );

      logger.info('[Clear Primary] Cleared primary flag', { cleared: updateResult.rowCount });

      res.json({
        success: true,
        data: {
          cleared: updateResult.rowCount ?? 0,
          is_primary: false
        }
      });
    } catch (error) {
      logger.error('Clear primary project error', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear primary project'
      });
    } finally {
      client.release();
    }
  }
}
