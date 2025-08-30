import { Request, Response } from 'express';
import { McpService } from '../services/mcp';

export class DecisionController {
  /**
   * POST /api/decisions - Record new technical decision
   */
  static async recordDecision(req: Request, res: Response): Promise<void> {
    try {
      const { title, problem, decision, rationale, alternatives } = req.body;

      // Validate required fields
      if (!title || !problem || !decision) {
        res.status(400).json({
          success: false,
          message: 'Title, problem, and decision are required fields'
        });
        return;
      }

      // Call AIDIS MCP decision_record
      const result = await McpService.callTool('decision_record', {
        title,
        problem,
        decision,
        ...(rationale && { rationale }),
        ...(alternatives && { alternatives })
      });
      
      if (!result.success) {
        console.error('AIDIS decision_record failed:', result.error);
        res.status(500).json({
          success: false,
          message: 'Failed to record decision',
          error: result.error
        });
        return;
      }

      res.status(201).json({
        success: true,
        data: result.data,
        message: 'Decision recorded successfully'
      });

    } catch (error) {
      console.error('Record decision error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to record decision',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/decisions - Search technical decisions
   */
  static async searchDecisions(req: Request, res: Response): Promise<void> {
    try {
      const {
      query = '',
      project_id,
      status,
      created_by,
      date_from,
      date_to,
      limit = 20,
      offset = 0
      } = req.query;

      console.log('[Decision Search] Request params:', {
        query, project_id, status, created_by, date_from, date_to, limit, offset
      });

      // Switch to the correct project context if project_id is provided
      if (project_id) {
        console.log(`[Decision Search] Switching to project: ${project_id}`);
        const switchResult = await McpService.callTool('project_switch', { project: project_id as string });
        if (!switchResult.success) {
          console.error('Failed to switch project:', switchResult.error);
          res.status(500).json({
            success: false,
            message: 'Failed to switch project context',
            error: switchResult.error
          });
          return;
        }
        console.log('[Decision Search] Project switch successful');
      }

      // Build search parameters for AIDIS MCP  
      const searchParams: any = {
        query: query || "system", // Use a broad search term instead of "*"
        limit: parseInt(limit as string) || 20
      };

      // Don't include project_id in MCP params since we switched context above
      if (status) searchParams.status = status;
      if (created_by) searchParams.created_by = created_by;
      if (date_from) searchParams.date_from = date_from;
      if (date_to) searchParams.date_to = date_to;

      console.log('[Decision Search] MCP search params:', searchParams);

      // Call AIDIS MCP decision_search
      const result = await McpService.callTool('decision_search', searchParams);
      
      console.log('[Decision Search] MCP result success:', result.success);
      if (result.success) {
        console.log('[Decision Search] MCP data keys:', Object.keys(result.data || {}));
      }

      if (!result.success) {
        console.error('AIDIS decision_search failed:', result.error);
        res.status(500).json({
          success: false,
          message: 'Failed to search decisions',
          error: result.error
        });
        return;
      }

      const searchResult = result.data;
      
      // Transform the response to match frontend expectations
      const transformedResult = {
        decisions: searchResult.results || [],
        total: searchResult.total || 0,
        page: Math.floor(parseInt(offset as string) / parseInt(limit as string)) + 1,
        limit: parseInt(limit as string)
      };

      console.log('[Decision Search] Transformed result:', {
        totalDecisions: transformedResult.decisions.length,
        totalFound: transformedResult.total,
        page: transformedResult.page
      });

      res.json({
        success: true,
        data: transformedResult,
        message: `Found ${transformedResult.total} decisions`
      });

    } catch (error) {
      console.error('Decision search error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search decisions',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/decisions/stats - Get decision statistics
   */
  static async getDecisionStats(req: Request, res: Response): Promise<void> {
    try {
      const { project_id } = req.query;

      // Call AIDIS MCP decision_stats
      const result = await McpService.callTool('decision_stats', {
        project_id: project_id || undefined
      });
      
      if (!result.success) {
        console.error('AIDIS decision_stats failed:', result.error);
        res.status(500).json({
          success: false,
          message: 'Failed to get decision statistics',
          error: result.error
        });
        return;
      }

      res.json({
        success: true,
        data: result.data,
        message: 'Decision statistics retrieved'
      });

    } catch (error) {
      console.error('Decision stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get decision statistics',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/decisions/:id - Get single decision
   */
  static async getDecision(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Call AIDIS MCP decision_search with specific ID filter
      const result = await McpService.callTool('decision_search', {
        query: `id:${id}`,
        limit: 1
      });
      
      if (!result.success) {
        console.error('AIDIS decision lookup failed:', result.error);
        res.status(500).json({
          success: false,
          message: 'Failed to get decision',
          error: result.error
        });
        return;
      }

      const searchResult = result.data;
      const decision = searchResult.results?.[0];

      if (!decision) {
        res.status(404).json({
          success: false,
          message: 'Decision not found'
        });
        return;
      }

      res.json({
        success: true,
        data: decision,
        message: 'Decision retrieved'
      });

    } catch (error) {
      console.error('Get decision error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get decision',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * PUT /api/decisions/:id - Update decision
   */
  static async updateDecision(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { outcome, lessons, status } = req.body;

      // Validate input
      if (!outcome && !lessons && !status) {
        res.status(400).json({
          success: false,
          message: 'At least one field (outcome, lessons, status) is required'
        });
        return;
      }

      // Call AIDIS MCP decision_update
      const result = await McpService.callTool('decision_update', {
        decision_id: parseInt(id),
        ...(outcome && { outcome }),
        ...(lessons && { lessons }),
        ...(status && { status })
      });
      
      if (!result.success) {
        console.error('AIDIS decision_update failed:', result.error);
        res.status(500).json({
          success: false,
          message: 'Failed to update decision',
          error: result.error
        });
        return;
      }

      res.json({
        success: true,
        data: result.data,
        message: 'Decision updated successfully'
      });

    } catch (error) {
      console.error('Update decision error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update decision',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * DELETE /api/decisions/:id - Delete decision
   */
  static async deleteDecision(_req: Request, res: Response): Promise<void> {
    try {
      // Note: AIDIS doesn't currently have a delete_decision MCP tool
      // For now, return not implemented
      res.status(501).json({
        success: false,
        message: 'Decision deletion not yet implemented',
        error: 'This feature requires AIDIS MCP delete_decision tool'
      });

    } catch (error) {
      console.error('Delete decision error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete decision',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
