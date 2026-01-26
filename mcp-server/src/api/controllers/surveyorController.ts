/**
 * Surveyor Controller
 * HTTP handlers for Surveyor REST API endpoints
 * Part of MandrelV2 Surveyor Integration
 */

import { Request, Response } from 'express';
import { surveyorService, ScanResult } from '../../services/surveyorService.js';
import { logger } from '../../utils/logger.js';
import { scanProject } from '../../services/surveyor/index.js';

/**
 * Surveyor Controller - handles all HTTP endpoints for Surveyor integration
 */
export class SurveyorController {
  /**
   * Trigger and store a new scan
   * POST /api/v2/surveyor/scan
   * Body: { projectPath: string, projectId: string, scanData?: ScanResult }
   */
  async triggerScan(req: Request, res: Response): Promise<void> {
    try {
      const { projectPath, projectId, scanData } = req.body;

      if (!projectPath || !projectId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and projectId are required',
        });
        return;
      }

      // If scanData is provided, store it directly
      if (scanData) {
        const stored = await surveyorService.storeScan(projectId, scanData as ScanResult);

        logger.info('Scan stored via API', {
          component: 'SurveyorController',
          operation: 'triggerScan',
          metadata: { scanId: stored.id, projectId },
        });

        res.status(201).json({
          success: true,
          data: {
            scanId: stored.id,
            status: stored.status,
            healthScore: stored.health_score,
            stats: {
              totalFiles: stored.total_files,
              totalFunctions: stored.total_functions,
              totalWarnings: stored.total_warnings,
            },
          },
        });
        return;
      }

      // Run scan using local surveyor core
      logger.info('Starting project scan', {
        component: 'SurveyorController',
        operation: 'triggerScan',
        metadata: { projectPath, projectId },
      });

      const scanResult = await scanProject(projectPath, {
        verbose: false,
        skipWarnings: false,
      });

      // Store the scan result
      const stored = await surveyorService.storeScan(projectId, scanResult as ScanResult);

      logger.info('Scan completed and stored', {
        component: 'SurveyorController',
        operation: 'triggerScan',
        metadata: {
          scanId: stored.id,
          projectId,
          totalFiles: stored.total_files,
          totalFunctions: stored.total_functions,
          totalWarnings: stored.total_warnings,
        },
      });

      res.status(201).json({
        success: true,
        data: {
          scanId: stored.id,
          status: stored.status,
          healthScore: stored.health_score,
          stats: {
            totalFiles: stored.total_files,
            totalFunctions: stored.total_functions,
            totalClasses: stored.total_classes,
            totalWarnings: stored.total_warnings,
            warningsByLevel: stored.warnings_by_level,
          },
        },
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to trigger/store scan', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error',
      });
    }
  }

  /**
   * List scans for a project
   * GET /api/v2/surveyor/scans?projectId=&status=&limit=&offset=
   */
  async listScans(req: Request, res: Response): Promise<void> {
    try {
      const {
        projectId,
        status,
        limit = '10',
        offset = '0',
        includeNodes = 'false',
      } = req.query;

      if (!projectId) {
        res.status(400).json({
          success: false,
          error: 'projectId is required',
        });
        return;
      }

      const result = await surveyorService.getScans(projectId as string, {
        status: status as string | undefined,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        includeNodes: includeNodes === 'true',
      });

      res.json({
        success: true,
        data: {
          scans: result.scans.map((scan) => ({
            id: scan.id,
            projectName: scan.project_name,
            projectPath: scan.project_path,
            status: scan.status,
            createdAt: scan.created_at,
            completedAt: scan.completed_at,
            healthScore: scan.health_score,
            stats: {
              totalFiles: scan.total_files,
              totalFunctions: scan.total_functions,
              totalClasses: scan.total_classes,
              totalWarnings: scan.total_warnings,
              warningsByLevel: scan.warnings_by_level,
              nodesByType: scan.nodes_by_type,
            },
            summaryL0: scan.summary_l0,
          })),
          total: result.total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to list scans', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error',
      });
    }
  }

  /**
   * Get a single scan by ID
   * GET /api/v2/surveyor/scans/:id?includeNodes=true
   */
  async getScan(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { includeNodes = 'true' } = req.query;

      const scan = await surveyorService.getScan(id, includeNodes === 'true');

      if (!scan) {
        res.status(404).json({
          success: false,
          error: 'Scan not found',
        });
        return;
      }

      res.json({
        success: true,
        data: {
          id: scan.id,
          projectId: scan.project_id,
          projectName: scan.project_name,
          projectPath: scan.project_path,
          status: scan.status,
          createdAt: scan.created_at,
          completedAt: scan.completed_at,
          healthScore: scan.health_score,
          stats: {
            totalFiles: scan.total_files,
            totalFunctions: scan.total_functions,
            totalClasses: scan.total_classes,
            totalConnections: scan.total_connections,
            totalWarnings: scan.total_warnings,
            analyzedCount: scan.analyzed_count,
            pendingAnalysis: scan.pending_analysis,
            warningsByLevel: scan.warnings_by_level,
            nodesByType: scan.nodes_by_type,
          },
          nodes: includeNodes === 'true' ? scan.nodes : undefined,
          connections: includeNodes === 'true' ? scan.connections : undefined,
          clusters: includeNodes === 'true' ? scan.clusters : undefined,
          errors: scan.errors,
          summaries: {
            l0: scan.summary_l0,
            l1: scan.summary_l1,
            l2: scan.summary_l2,
          },
        },
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get scan', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error',
      });
    }
  }

  /**
   * Delete a scan
   * DELETE /api/v2/surveyor/scans/:id
   */
  async deleteScan(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const deleted = await surveyorService.deleteScan(id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Scan not found',
        });
        return;
      }

      logger.info('Scan deleted', {
        component: 'SurveyorController',
        operation: 'deleteScan',
        metadata: { scanId: id },
      });

      res.json({
        success: true,
        data: {
          message: 'Scan deleted successfully',
          scanId: id,
        },
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to delete scan', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error',
      });
    }
  }

  /**
   * Get warnings for a scan
   * GET /api/v2/surveyor/warnings/:scanId?level=&category=&filePath=&limit=&offset=
   */
  async getWarnings(req: Request, res: Response): Promise<void> {
    try {
      const { scanId } = req.params;
      const { level, category, filePath, limit = '100', offset = '0' } = req.query;

      const result = await surveyorService.getWarnings(scanId, {
        level: level as string | undefined,
        category: category as string | undefined,
        filePath: filePath as string | undefined,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });

      res.json({
        success: true,
        data: {
          warnings: result.warnings,
          total: result.total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get warnings', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error',
      });
    }
  }

  /**
   * Query nodes in a scan (deep queries)
   * GET /api/v2/surveyor/query?scanId=&type=&filePath=&search=&hasFlag=
   */
  async queryNodes(req: Request, res: Response): Promise<void> {
    try {
      const { scanId, type, filePath, search, hasFlag } = req.query;

      if (!scanId) {
        res.status(400).json({
          success: false,
          error: 'scanId is required',
        });
        return;
      }

      const nodes = await surveyorService.queryNodes(scanId as string, {
        type: type as string | undefined,
        filePath: filePath as string | undefined,
        search: search as string | undefined,
        hasFlag: hasFlag as string | undefined,
      });

      res.json({
        success: true,
        data: {
          nodes,
          count: nodes.length,
          query: { scanId, type, filePath, search, hasFlag },
        },
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to query nodes', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error',
      });
    }
  }

  /**
   * Get AI summary by level
   * GET /api/v2/surveyor/summary/:scanId?level=0|1|2
   */
  async getSummary(req: Request, res: Response): Promise<void> {
    try {
      const { scanId } = req.params;
      const { level = '0' } = req.query;

      const scan = await surveyorService.getScan(scanId, false);

      if (!scan) {
        res.status(404).json({
          success: false,
          error: 'Scan not found',
        });
        return;
      }

      let summary: string | null = null;
      switch (level) {
        case '0':
          summary = scan.summary_l0;
          break;
        case '1':
          summary = scan.summary_l1;
          break;
        case '2':
          summary = scan.summary_l2;
          break;
      }

      res.json({
        success: true,
        data: {
          scanId,
          level: parseInt(level as string),
          summary,
          available: {
            l0: !!scan.summary_l0,
            l1: !!scan.summary_l1,
            l2: !!scan.summary_l2,
          },
        },
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get summary', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error',
      });
    }
  }

  /**
   * Get file details (imports/exports)
   * GET /api/v2/surveyor/file?scanId=&filePath=
   */
  async getFileDetails(req: Request, res: Response): Promise<void> {
    try {
      const { scanId, filePath } = req.query;

      if (!scanId || !filePath) {
        res.status(400).json({
          success: false,
          error: 'scanId and filePath are required',
        });
        return;
      }

      const fileNode = await surveyorService.getFileDetails(
        scanId as string,
        filePath as string
      );

      if (!fileNode) {
        res.status(404).json({
          success: false,
          error: 'File not found in scan',
        });
        return;
      }

      res.json({
        success: true,
        data: {
          file: fileNode,
          scanId,
          filePath,
        },
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get file details', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error',
      });
    }
  }

  /**
   * Get project statistics
   * GET /api/v2/surveyor/stats/:projectId
   */
  async getProjectStats(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;

      const stats = await surveyorService.getProjectStats(projectId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get project stats', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error',
      });
    }
  }
}

// Export singleton instance
export const surveyorController = new SurveyorController();
