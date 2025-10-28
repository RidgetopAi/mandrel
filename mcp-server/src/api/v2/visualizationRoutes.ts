/**
 * Visualization REST API Routes
 * Provides dependency analysis and code visualization endpoints
 */

import express, { Router } from 'express';
import { VisualizationsController } from '../controllers/visualizationsController.js';
import { logger } from '../../utils/logger.js';

/**
 * Visualization Router
 * Provides 6 REST endpoints for dependency analysis and visualization
 */
export class VisualizationRouter {
  private router: Router;
  private controller: VisualizationsController;

  constructor() {
    this.router = express.Router();
    this.controller = new VisualizationsController();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup middleware for visualization routes
   */
  private setupMiddleware(): void {
    // JSON body parsing
    this.router.use(express.json({ limit: '1mb' }));

    // Request logging middleware
    this.router.use((req, _res, next) => {
      logger.debug(`Visualization API: ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup all visualization routes
   */
  private setupRoutes(): void {
    // Analysis endpoints
    // POST /api/v2/analyze/dependencies
    this.router.post(
      '/analyze/dependencies',
      this.controller.analyzeDependencies.bind(this.controller)
    );

    // GET /api/v2/analyze/circular
    this.router.get(
      '/analyze/circular',
      this.controller.detectCircular.bind(this.controller)
    );

    // GET /api/v2/analyze/complex
    this.router.get(
      '/analyze/complex',
      this.controller.getComplexModules.bind(this.controller)
    );

    // POST /api/v2/analyze/graph
    this.router.post(
      '/analyze/graph',
      this.controller.generateGraph.bind(this.controller)
    );

    // Visualization file management
    // GET /api/v2/visualizations
    this.router.get(
      '/visualizations',
      this.controller.listVisualizations.bind(this.controller)
    );

    // GET /api/v2/visualizations/:filename
    this.router.get(
      '/visualizations/:filename',
      this.controller.downloadVisualization.bind(this.controller)
    );

    logger.info('Visualization routes initialized: 6 endpoints');
  }

  /**
   * Get the Express router instance
   */
  getRouter(): Router {
    return this.router;
  }
}

/**
 * Create and export router instance
 */
export default function createVisualizationRouter(): Router {
  const visualizationRouter = new VisualizationRouter();
  return visualizationRouter.getRouter();
}
