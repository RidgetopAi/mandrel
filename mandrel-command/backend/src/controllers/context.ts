import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth';
import { ContextService, ContextSearchParams } from '../services/context';
import { McpService } from '../services/mcp';
import type { UpdateContextData } from '../validation/schemas';

export class ContextController {
  /**
   * GET /api/contexts - List contexts with filtering and pagination
   * Oracle Phase 1: Use req.projectId from middleware instead of query params
   */
  static async searchContexts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const params: ContextSearchParams = {
        ...(req.query.query && { query: req.query.query as string }),
        // Oracle Phase 1: Unified project filtering - header takes priority over query param
        ...(() => {
          const projectId = req.projectId || (req.query.project_id as string);
          return projectId ? { project_id: projectId } : {};
        })(),
        ...(req.query.session_id && { session_id: req.query.session_id as string }),
        ...(req.query.type && { type: req.query.type as string }),
        ...(req.query.tags && { tags: (req.query.tags as string).split(',') }),
        ...(req.query.min_similarity && { min_similarity: parseFloat(req.query.min_similarity as string) }),
        ...(req.query.date_from && { date_from: req.query.date_from as string }),
        ...(req.query.date_to && { date_to: req.query.date_to as string }),
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
        sort_by: (req.query.sort_by as 'created_at' | 'relevance' | 'updated_at') || 'created_at',
        sort_order: (req.query.sort_order as 'asc' | 'desc') || 'desc'
      };

      const result = await ContextService.searchContexts(params);
      
      res.json({
        success: true,
        data: result,
        message: `Found ${result.total} contexts`
      });
    } catch (error) {
      console.error('Search contexts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search contexts',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/contexts/:id - Get single context
   */
  static async getContext(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const context = await ContextService.getContextById(id);

      if (!context) {
        res.status(404).json({
          success: false,
          message: 'Context not found'
        });
        return;
      }

      res.json({
        success: true,
        data: context
      });
    } catch (error) {
      console.error('Get context error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get context',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * PUT /api/contexts/:id - Update context
   */
  static async updateContext(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body as UpdateContextData;

      const filteredUpdates: UpdateContextData = {};
      if (typeof updates.content === 'string') {
        filteredUpdates.content = updates.content;
      }
      if (Array.isArray(updates.tags)) {
        filteredUpdates.tags = updates.tags;
      }
      if (updates.metadata && typeof updates.metadata === 'object') {
        filteredUpdates.metadata = updates.metadata;
      }
      if (typeof updates.relevance_score === 'number') {
        filteredUpdates.relevance_score = updates.relevance_score;
      }
      if (typeof updates.project_id === 'string') {
        filteredUpdates.project_id = updates.project_id;
      }

      if (Object.keys(filteredUpdates).length === 0) {
        res.status(400).json({
          success: false,
          message: 'No valid updates provided'
        });
        return;
      }

      // Validate project_id if provided
      if (filteredUpdates.project_id) {
        const { db } = await import('../database/connection');
        const projectExists = await db.query(
          'SELECT id FROM projects WHERE id = $1 AND status = $2',
          [filteredUpdates.project_id, 'active']
        );

        if (projectExists.rows.length === 0) {
          res.status(400).json({
            success: false,
            message: 'Invalid project ID or project is not active'
          });
          return;
        }

        // Get current context to check if project is changing
        const currentContext = await ContextService.getContextById(id);

        if (!currentContext) {
          res.status(404).json({
            success: false,
            message: 'Context not found'
          });
          return;
        }

        if (currentContext.project_id !== filteredUpdates.project_id) {
          // Project is changing - add audit trail to metadata
          const auditTrail = {
            from_project_id: currentContext.project_id,
            to_project_id: filteredUpdates.project_id,
            moved_at: new Date().toISOString(),
            moved_by: 'user' // or get from auth context
          };

          filteredUpdates.metadata = {
            ...(currentContext.metadata || {}),
            move_history: [
              ...((currentContext.metadata?.move_history) || []),
              auditTrail
            ]
          };
        }
      }

      const context = await ContextService.updateContext(id, filteredUpdates);

      if (!context) {
        res.status(404).json({
          success: false,
          message: 'Context not found'
        });
        return;
      }

      res.json({
        success: true,
        data: context,
        message: 'Context updated successfully'
      });
    } catch (error) {
      console.error('Update context error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update context',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * DELETE /api/contexts/:id - Delete single context
   */
  static async deleteContext(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const deleted = await ContextService.deleteContext(id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          message: 'Context not found'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Context deleted successfully'
      });
    } catch (error) {
      console.error('Delete context error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete context',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * DELETE /api/contexts/bulk - Bulk delete contexts
   */
  static async bulkDeleteContexts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid or empty context IDs array'
        });
        return;
      }

      const result = await ContextService.bulkDeleteContexts(ids);

      res.json({
        success: true,
        data: result,
        message: `${result.deleted} contexts deleted successfully`
      });
    } catch (error) {
      console.error('Bulk delete contexts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to bulk delete contexts',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/contexts/bulk/update - Bulk update contexts
   */
  static async bulkUpdateContexts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { ids, updates } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid or empty context IDs array'
        });
        return;
      }

      if (!updates || typeof updates !== 'object') {
        res.status(400).json({
          success: false,
          message: 'Updates object is required'
        });
        return;
      }

      const result = await ContextService.bulkUpdateContexts(ids, updates);

      res.json({
        success: true,
        data: result,
        message: `${result.updated} contexts updated successfully`
      });
    } catch (error) {
      console.error('Bulk update contexts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to bulk update contexts',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/contexts/stats - Get context statistics
   * Oracle Phase 1: Use req.projectId from middleware
   */
  static async getContextStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const stats = await ContextService.getContextStats(req.projectId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get context stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get context statistics',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/contexts/weekly-velocity - Get weekly context velocity analytics
   */
  static async getWeeklyVelocity(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Oracle Phase 1: Unified project filtering - header takes priority over query param
      const projectId = req.projectId || (req.query.project_id as string);
      const weeklyVelocity = await ContextService.getWeeklyVelocity(projectId);

      res.json({
        success: true,
        data: { weeklyVelocity }
      });
    } catch (error) {
      console.error('Get weekly velocity error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get weekly velocity',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/contexts/export - Export contexts
   * Oracle Phase 1: Use req.projectId from middleware
   */
  static async exportContexts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const params: ContextSearchParams = {
        ...(req.query.query && { query: req.query.query as string }),
        // Oracle Phase 1: Unified project filtering - header takes priority over query param
        ...(() => {
          const projectId = req.projectId || (req.query.project_id as string);
          return projectId ? { project_id: projectId } : {};
        })(),
        ...(req.query.type && { type: req.query.type as string }),
        ...(req.query.tags && { tags: (req.query.tags as string).split(',') }),
        ...(req.query.date_from && { date_from: req.query.date_from as string }),
        ...(req.query.date_to && { date_to: req.query.date_to as string }),
        sort_by: (req.query.sort_by as 'created_at' | 'relevance' | 'updated_at') || 'created_at',
        sort_order: (req.query.sort_order as 'asc' | 'desc') || 'desc'
      };

      const format = req.query.format as 'json' | 'csv' || 'json';
      const exportData = await ContextService.exportContexts(params, format);

      res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);
      res.setHeader('Content-Type', exportData.contentType);
      res.send(exportData.data);
    } catch (error) {
      console.error('Export contexts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export contexts',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/contexts/:id/related - Get related contexts
   */
  static async getRelatedContexts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      
      const relatedContexts = await ContextService.getRelatedContexts(id, limit);

      res.json({
        success: true,
        data: relatedContexts,
        message: `Found ${relatedContexts.length} related contexts`
      });
    } catch (error) {
      console.error('Get related contexts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get related contexts',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/contexts/search - Advanced semantic search
   * Oracle Phase 1: Use req.projectId from middleware (override body if present)
   */
  static async semanticSearch(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const params: ContextSearchParams = {
        ...req.body,
        // Oracle Phase 1: Unified project filtering - header takes priority over query param
        ...(() => {
          const projectId = req.projectId || (req.query.project_id as string);
          return projectId ? { project_id: projectId } : {};
        })(),
        limit: req.body.limit || 20,
        offset: req.body.offset || 0
      };

      const result = await ContextService.searchContexts(params);

      res.json({
        success: true,
        data: result,
        message: `Found ${result.total} contexts matching your search`
      });
    } catch (error) {
      console.error('Semantic search error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to perform semantic search',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/contexts - Create a new context via MCP
   */
  static async createContext(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { content, type, tags, metadata } = req.body;

      if (!content || typeof content !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Content is required and must be a string'
        });
        return;
      }

      // Use project from header or body
      const projectId = req.projectId || req.body.projectId;

      const result = await McpService.callTool('context_store', {
        content,
        type: type || 'discussion',
        tags: tags || [],
        metadata: metadata || {},
        projectId
      });

      if (!result.success) {
        res.status(500).json({
          success: false,
          message: 'Failed to create context',
          error: result.error
        });
        return;
      }

      res.status(201).json({
        success: true,
        data: result.data,
        message: 'Context created successfully'
      });
    } catch (error) {
      console.error('Create context error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create context',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
