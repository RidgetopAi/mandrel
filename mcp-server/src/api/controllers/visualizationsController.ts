/**
 * Visualizations Controller
 * Provides REST API endpoints for dependency analysis and code visualization
 */

import { Request, Response } from 'express';
import { dependencyAnalyzerService } from '../../services/dependencyAnalyzer.js';
import { logger } from '../../utils/logger.js';
import path from 'path';
import { promises as fs } from 'fs';

export interface AnalyzeDependenciesRequest {
  targetPath?: string;
  extensions?: string[];
  tsConfig?: string;
  generateGraph?: boolean;
  exportJSON?: boolean;
}

export class VisualizationsController {
  /**
   * Analyze dependencies
   * POST /api/v2/analyze/dependencies
   *
   * Body: {
   *   targetPath?: string (default: 'src/main.ts'),
   *   extensions?: string[] (default: ['ts']),
   *   tsConfig?: string (default: 'tsconfig.json'),
   *   generateGraph?: boolean (default: true),
   *   exportJSON?: boolean (default: true)
   * }
   */
  async analyzeDependencies(req: Request, res: Response): Promise<void> {
    try {
      const {
        targetPath = 'src/main.ts',
        extensions = ['ts'],
        tsConfig = 'tsconfig.json',
        generateGraph = true,
        exportJSON = true,
      } = req.body as AnalyzeDependenciesRequest;

      logger.info(`Analyzing dependencies for ${targetPath}`);

      const startTime = Date.now();

      // Run analysis with output
      const result = await dependencyAnalyzerService.analyzeWithOutput(
        { targetPath, extensions, tsConfig },
        generateGraph,
        exportJSON
      );

      const duration = Date.now() - startTime;

      logger.info(`Dependency analysis completed in ${duration}ms`);
      logger.info(`Files: ${result.summary.fileCount}, Circular: ${result.summary.circularCount}`);

      res.json({
        success: true,
        data: {
          summary: result.summary,
          files: result.files,
          circular: result.circular,
          orphans: result.orphans,
          leaves: result.leaves,
          graphPath: result.graphPath,
          jsonPath: result.jsonPath,
        },
        duration,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to analyze dependencies', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Dependency analysis failed',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Detect circular dependencies only
   * GET /api/v2/analyze/circular?targetPath=&extensions=&tsConfig=
   */
  async detectCircular(req: Request, res: Response): Promise<void> {
    try {
      const targetPath = (req.query.targetPath as string) || 'src/main.ts';
      const extensions = req.query.extensions
        ? (req.query.extensions as string).split(',')
        : ['ts'];
      const tsConfig = (req.query.tsConfig as string) || 'tsconfig.json';

      logger.info(`Detecting circular dependencies for ${targetPath}`);

      const circular = await dependencyAnalyzerService.detectCircularDependencies({
        targetPath,
        extensions,
        tsConfig,
      });

      res.json({
        success: true,
        data: {
          count: circular.length,
          circular,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to detect circular dependencies', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Circular dependency detection failed',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get most complex modules
   * GET /api/v2/analyze/complex?targetPath=&limit=
   */
  async getComplexModules(req: Request, res: Response): Promise<void> {
    try {
      const targetPath = (req.query.targetPath as string) || 'src/main.ts';
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const extensions = req.query.extensions
        ? (req.query.extensions as string).split(',')
        : ['ts'];
      const tsConfig = (req.query.tsConfig as string) || 'tsconfig.json';

      logger.info(`Getting ${limit} most complex modules for ${targetPath}`);

      const complexModules = await dependencyAnalyzerService.getMostComplexModules(
        { targetPath, extensions, tsConfig },
        limit
      );

      res.json({
        success: true,
        data: {
          modules: complexModules,
          count: complexModules.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get complex modules', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to get complex modules',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Generate dependency graph only
   * POST /api/v2/analyze/graph
   *
   * Body: {
   *   targetPath?: string,
   *   format?: 'svg' | 'png' | 'dot',
   *   layout?: 'dot' | 'neato' | 'fdp' | 'sfdp' | 'twopi' | 'circo'
   * }
   */
  async generateGraph(req: Request, res: Response): Promise<void> {
    try {
      const {
        targetPath = 'src/main.ts',
        format = 'svg',
        layout = 'dot',
        extensions = ['ts'],
        tsConfig = 'tsconfig.json',
      } = req.body;

      logger.info(`Generating ${format} dependency graph for ${targetPath}`);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPath = path.join(
        process.cwd(),
        '../run/visualizations/dependencies',
        `graph-${timestamp}.${format}`
      );

      const graphPath = await dependencyAnalyzerService.generateGraph({
        targetPath,
        outputPath,
        format,
        layout,
        extensions,
        tsConfig,
      });

      res.json({
        success: true,
        data: {
          graphPath,
          format,
          layout,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to generate graph', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Graph generation failed',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * List available visualizations
   * GET /api/v2/visualizations
   */
  async listVisualizations(req: Request, res: Response): Promise<void> {
    try {
      const visualizationsDir = path.join(
        process.cwd(),
        '../run/visualizations/dependencies'
      );

      // Ensure directory exists
      await fs.mkdir(visualizationsDir, { recursive: true });

      // Read directory
      const files = await fs.readdir(visualizationsDir);

      // Get file stats
      const fileDetails = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(visualizationsDir, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            type: path.extname(file).slice(1), // Remove dot
          };
        })
      );

      // Sort by modified date (newest first)
      fileDetails.sort((a, b) => b.modified.getTime() - a.modified.getTime());

      res.json({
        success: true,
        data: {
          directory: visualizationsDir,
          files: fileDetails,
          count: fileDetails.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to list visualizations', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to list visualizations',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Download visualization file
   * GET /api/v2/visualizations/:filename
   */
  async downloadVisualization(req: Request, res: Response): Promise<void> {
    try {
      const { filename } = req.params;

      if (!filename) {
        res.status(400).json({
          success: false,
          error: 'filename is required',
        });
        return;
      }

      const visualizationsDir = path.join(
        process.cwd(),
        '../run/visualizations/dependencies'
      );
      const filePath = path.join(visualizationsDir, filename);

      // Security check: ensure file is within visualizations directory
      const resolvedPath = path.resolve(filePath);
      const resolvedDir = path.resolve(visualizationsDir);
      if (!resolvedPath.startsWith(resolvedDir)) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        res.status(404).json({
          success: false,
          error: 'File not found',
        });
        return;
      }

      // Send file
      res.sendFile(resolvedPath);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to download visualization', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to download visualization',
      });
    }
  }
}
