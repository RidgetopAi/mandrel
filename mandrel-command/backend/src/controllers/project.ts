import { Request, Response } from 'express';
import { ProjectService } from '../services/project';
import { McpService } from '../services/mcp';
import { ProjectInsightsService } from '../services/projectInsights';

export class ProjectController {
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
      console.error('Get all projects error:', error);
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
      console.error('Get project error:', error);
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
      console.error('Create project error:', error);
      
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
      console.error('Update project error:', error);
      
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
      console.error('Delete project error:', error);
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
      console.error('Get project sessions error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get project sessions'
      });
    }
  }

  /**
   * GET /projects/sessions/all - Get all sessions across projects
   */
  static async getAllSessions(_req: Request, res: Response): Promise<void> {
    try {
      const sessions = await ProjectService.getAllSessions();

      res.json({
        success: true,
        data: {
          sessions,
          total: sessions.length
        }
      });
    } catch (error) {
      console.error('Get all sessions error:', error);
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
        data: { stats }
      });
    } catch (error) {
      console.error('Get project stats error:', error);
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

      console.log(`[Project Insights] Getting insights for project ${id}`);

      // Get insights directly from database
      const insights = await ProjectInsightsService.getProjectInsights(id);

      console.log('[Project Insights] Database result:', insights);

      res.json({
        success: true,
        data: insights
      });
    } catch (error) {
      console.error('Get project insights error:', error);
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

      console.log(`[Set Primary] Setting project ${id} as primary`);

      // Call MCP server's set-primary endpoint
      const mcpResponse = await McpService.callMcpEndpoint(
        `/api/v2/projects/${id}/set-primary`,
        'POST'
      );

      console.log('[Set Primary] MCP response:', mcpResponse);

      res.json(mcpResponse);
    } catch (error) {
      console.error('Set primary project error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set primary project'
      });
    }
  }
}
