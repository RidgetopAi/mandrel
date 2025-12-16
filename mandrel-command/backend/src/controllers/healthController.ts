import { Request, Response } from 'express';
import { checkDatabaseHealth, getDatabaseStats } from '../database/connection';
import { asyncHandler } from '../middleware/errorHandler';
import config from '../config/environment';

/**
 * Basic server health check
 */
export const getHealth = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: config.nodeEnv,
    }
  });
});

/**
 * Database connection status
 */
export const getDatabaseStatus = asyncHandler(async (_req: Request, res: Response) => {
  const healthCheck = await checkDatabaseHealth();
  const stats = healthCheck.connected ? await getDatabaseStats() : null;

  res.json({
    success: true,
    data: {
      database: {
        ...healthCheck,
        ...(stats && { stats })
      }
    }
  });
});

/**
 * Application version and info
 */
export const getVersion = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      name: config.app.name,
      version: config.app.version,
      description: config.app.description,
      node_version: process.version,
      environment: config.nodeEnv,
      timestamp: new Date().toISOString()
    }
  });
});
