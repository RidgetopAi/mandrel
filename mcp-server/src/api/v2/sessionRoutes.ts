/**
 * Session Analytics REST API Routes
 * Migrated from MCP to reduce AI context and enable automation
 * Part of MCP → REST migration (Phase 2D/2E, Phase 3)
 */

import express, { Router } from 'express';
import { SessionAnalyticsController } from '../controllers/sessionAnalyticsController.js';
import { logger } from '../../utils/logger.js';

/**
 * Session Analytics Router
 * Provides 8 REST endpoints for session tracking and analytics
 */
export class SessionAnalyticsRouter {
  private router: Router;
  private controller: SessionAnalyticsController;

  constructor() {
    this.router = express.Router();
    this.controller = new SessionAnalyticsController();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup middleware for session routes
   */
  private setupMiddleware(): void {
    // JSON body parsing (already handled by parent router, but explicit here)
    this.router.use(express.json({ limit: '1mb' }));

    // Request logging middleware
    this.router.use((req, _res, next) => {
      logger.debug(`Session API: ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup all session analytics routes
   */
  private setupRoutes(): void {
    // Phase 2D/2E: Activity Tracking
    this.router.post(
      '/:sessionId/activities',
      this.controller.recordActivity.bind(this.controller)
    );

    this.router.get(
      '/:sessionId/activities',
      this.controller.getActivities.bind(this.controller)
    );

    // Phase 2D/2E: File Tracking
    this.router.post(
      '/:sessionId/files',
      this.controller.recordFileEdit.bind(this.controller)
    );

    this.router.get(
      '/:sessionId/files',
      this.controller.getFiles.bind(this.controller)
    );

    // Phase 2D/2E: Productivity
    this.router.post(
      '/:sessionId/productivity',
      this.controller.calculateProductivity.bind(this.controller)
    );

    // Phase 3: Analytics
    // Note: These must be defined BEFORE the /:sessionId routes to avoid conflicts
    // '/stats' route
    this.router.get(
      '/stats',
      this.controller.getStats.bind(this.controller)
    );

    // '/compare' route
    this.router.get(
      '/compare',
      this.controller.compareSessions.bind(this.controller)
    );

    // '/' route (list sessions)
    this.router.get(
      '/',
      this.controller.listSessions.bind(this.controller)
    );

    logger.info('Session analytics routes initialized: 8 endpoints');
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
export default function createSessionRouter(): Router {
  const sessionRouter = new SessionAnalyticsRouter();
  return sessionRouter.getRouter();
}
