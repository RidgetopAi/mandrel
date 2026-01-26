/**
 * Surveyor REST API Routes
 * Provides HTTP endpoints for Surveyor codebase analysis integration
 * Part of MandrelV2 Surveyor Integration
 */

import express, { Router } from 'express';
import { SurveyorController } from '../controllers/surveyorController.js';
import { logger } from '../../utils/logger.js';

/**
 * Surveyor Router
 * Provides REST endpoints for surveyor scans, warnings, and queries
 */
export class SurveyorRouter {
  private router: Router;
  private controller: SurveyorController;

  constructor() {
    this.router = express.Router();
    this.controller = new SurveyorController();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup middleware for surveyor routes
   */
  private setupMiddleware(): void {
    // JSON body parsing with larger limit for scan data
    this.router.use(express.json({ limit: '50mb' }));

    // Request logging
    this.router.use((req, _res, next) => {
      logger.debug(`Surveyor API: ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup all surveyor routes
   */
  private setupRoutes(): void {
    // Scan Management
    // POST /scan - Trigger/store a new scan
    this.router.post('/scan', this.controller.triggerScan.bind(this.controller));

    // GET /scans - List scans for a project
    this.router.get('/scans', this.controller.listScans.bind(this.controller));

    // GET /scans/:id - Get a single scan
    this.router.get('/scans/:id', this.controller.getScan.bind(this.controller));

    // DELETE /scans/:id - Delete a scan
    this.router.delete('/scans/:id', this.controller.deleteScan.bind(this.controller));

    // Warnings
    // GET /warnings/:scanId - Get warnings with filters
    this.router.get('/warnings/:scanId', this.controller.getWarnings.bind(this.controller));

    // Queries
    // GET /query - Deep queries (imports/exports/chains)
    this.router.get('/query', this.controller.queryNodes.bind(this.controller));

    // GET /file - Get file details (imports/exports)
    this.router.get('/file', this.controller.getFileDetails.bind(this.controller));

    // Summaries
    // GET /summary/:scanId - Get AI summary by level
    this.router.get('/summary/:scanId', this.controller.getSummary.bind(this.controller));

    // Statistics
    // GET /stats/:projectId - Get project statistics
    this.router.get('/stats/:projectId', this.controller.getProjectStats.bind(this.controller));

    logger.info('Surveyor routes initialized: 9 endpoints');
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
export default function createSurveyorRouter(): Router {
  const surveyorRouter = new SurveyorRouter();
  return surveyorRouter.getRouter();
}
