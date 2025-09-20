/**
 * TR015-4: Enhanced Service Monitoring Routes
 * Oracle Refactor Phase 4 - Service Monitoring and Alerting
 */

import { Router, Request, Response } from 'express';
import { MonitoringController } from '../controllers/monitoring';
import { monitoringService } from '../services/monitoring';
// import { authenticateToken } from '../middleware/auth'; // Temporarily removed for testing

const router = Router();

// Apply authentication to monitoring routes (temporarily disabled for testing)
// router.use(authenticateToken);

// Legacy monitoring routes (maintain backward compatibility)
router.get('/health', MonitoringController.getSystemHealth);
router.get('/metrics', MonitoringController.getSystemMetrics);
router.get('/trends', MonitoringController.getPerformanceTrends);
router.post('/errors', MonitoringController.recordUiError);

// TR015-4: Service-specific monitoring routes
/**
 * GET /api/monitoring/services
 * Get all monitored services status
 */
router.get('/services', async (_req: Request, res: Response) => {
  try {
    const services = await monitoringService.checkAllServices();
    res.json({
      success: true,
      data: services,
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/monitoring/services/:serviceName
 * Get specific service health status
 */
router.get('/services/:serviceName', async (req: Request, res: Response) => {
  try {
    const { serviceName } = req.params;
    const service = await monitoringService.checkServiceHealth(serviceName);
    res.json({
      success: true,
      data: service,
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    res.status(404).json({
      success: false,
      error: error instanceof Error ? error.message : 'Service not found',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/monitoring/stats
 * Get monitoring statistics and SLA compliance
 */
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = monitoringService.getServiceMonitoringStats();
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/monitoring/alerts
 * Get recent alerts
 */
router.get('/alerts', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const alerts = monitoringService.getRecentAlerts(limit);
    res.json({
      success: true,
      data: alerts,
      count: alerts.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/monitoring/alert-rules
 * Get all alert rules
 */
router.get('/alert-rules', (_req: Request, res: Response) => {
  try {
    const rules = monitoringService.getAlertRules();
    res.json({
      success: true,
      data: rules,
      count: rules.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * PUT /api/monitoring/alert-rules/:ruleId
 * Update alert rule configuration
 */
router.put('/alert-rules/:ruleId', (req: Request, res: Response) => {
  try {
    const { ruleId } = req.params;
    const updates = req.body;

    monitoringService.updateAlertRule(ruleId, updates);

    res.json({
      success: true,
      message: `Alert rule ${ruleId} updated`,
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/monitoring/start
 * Start service monitoring
 */
router.post('/start', (req: Request, res: Response) => {
  try {
    const intervalMs = parseInt(req.body.intervalMs) || 30000;
    monitoringService.startServiceMonitoring(intervalMs);

    res.json({
      success: true,
      message: 'Service monitoring started',
      intervalMs,
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/monitoring/stop
 * Stop service monitoring
 */
router.post('/stop', (_req: Request, res: Response) => {
  try {
    monitoringService.stopServiceMonitoring();

    res.json({
      success: true,
      message: 'Service monitoring stopped',
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/monitoring/status
 * Get monitoring system status
 */
router.get('/status', (_req: Request, res: Response) => {
  try {
    const isRunning = monitoringService.isServiceMonitoringRunning();
    const stats = monitoringService.getServiceMonitoringStats();
    const services = monitoringService.getAllMonitoredServices();

    res.json({
      success: true,
      data: {
        isRunning,
        stats,
        services: services.map(s => ({
          name: s.name,
          status: s.status,
          lastCheck: s.lastCheck,
          responseTime: s.responseTime
        })),
        alertRulesCount: monitoringService.getAlertRules().length,
        recentAlertsCount: monitoringService.getRecentAlerts(10).length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/monitoring/dashboard
 * Get comprehensive monitoring dashboard data
 */
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    // Get fresh service data
    const services = await monitoringService.checkAllServices();
    const stats = monitoringService.getServiceMonitoringStats();
    const recentAlerts = monitoringService.getRecentAlerts(20);
    const alertRules = monitoringService.getAlertRules();
    const isMonitoringActive = monitoringService.isServiceMonitoringRunning();

    // Get legacy health summary for backward compatibility
    const healthSummary = await monitoringService.getHealthSummary();

    res.json({
      success: true,
      data: {
        monitoring: {
          isActive: isMonitoringActive,
          stats,
          services,
          alertRules: alertRules.length,
          recentAlerts: recentAlerts.length
        },
        system: healthSummary,
        alerts: recentAlerts.slice(0, 10), // Latest 10 alerts
        slaCompliance: {
          overall: stats.slaCompliance,
          breakdown: services.map(s => ({
            service: s.name,
            status: s.status,
            responseTime: s.responseTime,
            slaTarget: s.slaTarget,
            compliant: s.responseTime <= s.slaTarget
          }))
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
