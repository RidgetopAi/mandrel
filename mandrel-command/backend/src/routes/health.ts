/**
 * TR009-4: Enhanced Health Check Routes
 */

import { Router, Request, Response } from 'express';
import { getHealth, getDatabaseStatus, getVersion } from '../controllers/healthController';
import { backendPool, getPoolStats } from '../database/poolManager';

const router = Router();
const startTime = Date.now();

// Legacy endpoints (for backward compatibility)
router.get('/health', getHealth);
router.get('/db-status', getDatabaseStatus);
router.get('/version', getVersion);

// New standardized health check endpoints (TR009-4)

/**
 * Full health check - /healthz
 */
router.get('/healthz', async (_req: Request, res: Response) => {
  const checks: any = {};

  // Database check
  try {
    const dbHealth = await backendPool.healthCheck();
    const poolStats = getPoolStats();
    checks.database = {
      status: dbHealth.healthy ? 'up' : 'down',
      pool: poolStats
    };
  } catch (error: unknown) {
    checks.database = { status: 'down', error: error instanceof Error ? error.message : 'Unknown error' };
  }

  // Memory check
  const memUsage = process.memoryUsage();
  const heapUsed = memUsage.heapUsed / 1024 / 1024;
  const heapTotal = memUsage.heapTotal / 1024 / 1024;
  checks.memory = {
    status: heapUsed / heapTotal > 0.9 ? 'down' : 'up',
    heapUsed: `${heapUsed.toFixed(2)} MB`,
    heapTotal: `${heapTotal.toFixed(2)} MB`,
    utilization: `${((heapUsed / heapTotal) * 100).toFixed(1)}%`
  };

  const allHealthy = Object.values(checks).every((c: any) => c.status === 'up');

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks
  });
});

/**
 * Liveness probe - /livez
 */
router.get('/livez', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000)
  });
});

/**
 * Readiness probe - /readyz
 */
router.get('/readyz', async (_req: Request, res: Response) => {
  try {
    const dbHealth = await backendPool.healthCheck();
    const ready = dbHealth.healthy;

    res.status(ready ? 200 : 503).json({
      ready,
      timestamp: new Date().toISOString(),
      database: dbHealth.healthy ? 'ready' : 'not ready'
    });
  } catch (error: unknown) {
    res.status(503).json({
      ready: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
