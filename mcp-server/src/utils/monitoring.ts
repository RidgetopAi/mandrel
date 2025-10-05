/**
 * ORACLE HARDENING: Basic Monitoring & Metrics
 * Lightweight monitoring without external dependencies
 */

interface Metric {
  name: string;
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  timestamp: number;
  responseTime?: number;
}

class SimpleMonitoring {
  private metrics: Map<string, Metric[]> = new Map();
  private healthChecks: Map<string, HealthCheck> = new Map();
  private readonly maxMetricHistory = 100;
  
  /**
   * Record a metric value
   */
  recordMetric(name: string, value: number, labels?: Record<string, string>) {
    const metric: Metric = {
      name,
      value,
      timestamp: Date.now(),
      labels
    };
    
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const history = this.metrics.get(name)!;
    history.push(metric);
    
    // Keep only recent history
    if (history.length > this.maxMetricHistory) {
      history.shift();
    }
  }

  /**
   * Increment a counter metric
   */
  incrementCounter(name: string, labels?: Record<string, string>) {
    const current = this.getLatestMetric(name)?.value || 0;
    this.recordMetric(name, current + 1, labels);
  }

  /**
   * Record timing metric
   */
  recordTiming(name: string, startTime: number, labels?: Record<string, string>) {
    const duration = Date.now() - startTime;
    this.recordMetric(name, duration, labels);
  }

  /**
   * Record health check result
   */
  recordHealthCheck(name: string, status: 'healthy' | 'unhealthy' | 'degraded', message?: string, responseTime?: number) {
    this.healthChecks.set(name, {
      name,
      status,
      message,
      timestamp: Date.now(),
      responseTime
    });
  }

  /**
   * Get latest metric value
   */
  getLatestMetric(name: string): Metric | undefined {
    const history = this.metrics.get(name);
    return history ? history[history.length - 1] : undefined;
  }

  /**
   * Get metric statistics
   */
  getMetricStats(name: string, windowMs: number = 300000) { // 5 minute window
    const history = this.metrics.get(name);
    if (!history) return null;
    
    const cutoff = Date.now() - windowMs;
    const recent = history.filter(m => m.timestamp >= cutoff);
    
    if (recent.length === 0) return null;
    
    const values = recent.map(m => m.value);
    const sum = values.reduce((a, b) => a + b, 0);
    
    return {
      count: recent.length,
      sum,
      avg: sum / recent.length,
      min: Math.min(...values),
      max: Math.max(...values),
      latest: recent[recent.length - 1]?.value || 0
    };
  }

  /**
   * Get all health checks
   */
  getAllHealthChecks(): HealthCheck[] {
    return Array.from(this.healthChecks.values());
  }

  /**
   * Get overall system health
   */
  getSystemHealth(): { status: string; checks: HealthCheck[]; summary: any } {
    const checks = this.getAllHealthChecks();
    const healthy = checks.filter(c => c.status === 'healthy').length;
    const total = checks.length;
    
    let overallStatus = 'healthy';
    if (healthy === 0) {
      overallStatus = 'unhealthy';
    } else if (healthy < total) {
      overallStatus = 'degraded';
    }
    
    const summary = {
      totalChecks: total,
      healthyChecks: healthy,
      degradedChecks: checks.filter(c => c.status === 'degraded').length,
      unhealthyChecks: checks.filter(c => c.status === 'unhealthy').length,
      overallStatus
    };
    
    return { status: overallStatus, checks, summary };
  }

  /**
   * Get monitoring dashboard data
   */
  getDashboardData() {
    const now = Date.now();
    const fiveMinAgo = now - 300000; // 5 minutes
    
    return {
      timestamp: now,
      systemHealth: this.getSystemHealth(),
      keyMetrics: {
        requestCount: this.getMetricStats('mcp_requests_total'),
        requestDuration: this.getMetricStats('mcp_request_duration_ms'),
        errorCount: this.getMetricStats('mcp_errors_total'),
        dbConnections: this.getLatestMetric('db_connections_active')?.value || 0,
        memoryUsage: this.getLatestMetric('memory_usage_mb')?.value || 0
      },
      recentMetrics: Array.from(this.metrics.entries()).map(([name, history]) => ({
        name,
        recent: history.filter(m => m.timestamp >= fiveMinAgo)
      }))
    };
  }

  /**
   * Start background monitoring tasks
   */
  startBackgroundMonitoring() {
    // System metrics every 30 seconds
    const systemMetricsInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Health checks every minute
    const healthCheckInterval = setInterval(() => {
      this.runHealthChecks();
    }, 60000);

    // Cleanup old metrics every 5 minutes
    const cleanupInterval = setInterval(() => {
      this.cleanupOldMetrics();
    }, 300000);

    // Return cleanup function
    return () => {
      clearInterval(systemMetricsInterval);
      clearInterval(healthCheckInterval);
      clearInterval(cleanupInterval);
    };
  }

  private collectSystemMetrics() {
    // Memory usage
    const memUsage = process.memoryUsage();
    this.recordMetric('memory_usage_mb', Math.round(memUsage.rss / 1024 / 1024));
    this.recordMetric('memory_heap_mb', Math.round(memUsage.heapUsed / 1024 / 1024));
    
    // Process uptime
    this.recordMetric('process_uptime_seconds', process.uptime());
  }

  private async runHealthChecks() {
    const startTime = Date.now();
    
    try {
      // Database health check
      const { pool } = await import('../config/database.js');
      await pool.query('SELECT 1');
      this.recordHealthCheck('database', 'healthy', 'Database connection OK', Date.now() - startTime);
    } catch (error) {
      this.recordHealthCheck('database', 'unhealthy', `Database error: ${error.message}`, Date.now() - startTime);
    }

    // Memory health check
    const memUsage = process.memoryUsage();
    const memUsageMB = memUsage.rss / 1024 / 1024;
    if (memUsageMB > 2048) { // 2GB threshold
      this.recordHealthCheck('memory', 'degraded', `High memory usage: ${memUsageMB.toFixed(0)}MB`);
    } else {
      this.recordHealthCheck('memory', 'healthy', `Memory usage OK: ${memUsageMB.toFixed(0)}MB`);
    }

    // Process health check
    this.recordHealthCheck('process', 'healthy', `Process running, uptime: ${Math.round(process.uptime())}s`);
  }

  private cleanupOldMetrics() {
    const cutoff = Date.now() - 3600000; // 1 hour
    
    for (const [name, history] of this.metrics.entries()) {
      const filtered = history.filter(m => m.timestamp >= cutoff);
      this.metrics.set(name, filtered);
    }
  }
}

// Global monitoring instance
export const monitoring = new SimpleMonitoring();

/**
 * Decorator for monitoring method execution
 */
export function withMonitoring(metricPrefix: string = 'method') {
  return function<T extends any[], R>(
    _target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
  ) {
    const originalMethod = descriptor.value;
    
    if (originalMethod) {
      descriptor.value = async function(...args: T): Promise<R> {
        const startTime = Date.now();
        const methodName = `${metricPrefix}_${propertyKey}`;
        
        try {
          monitoring.incrementCounter(`${methodName}_requests`);
          const result = await originalMethod.apply(this, args);
          monitoring.recordTiming(`${methodName}_duration`, startTime);
          monitoring.incrementCounter(`${methodName}_success`);
          return result;
        } catch (error) {
          monitoring.incrementCounter(`${methodName}_errors`);
          monitoring.recordTiming(`${methodName}_duration`, startTime, { status: 'error' });
          throw error;
        }
      };
    }
    
    return descriptor;
  };
}

/**
 * Express-like middleware for monitoring HTTP requests
 */
export function createMonitoringEndpoints() {
  return {
    // Health endpoint
    health: (req: any, res: any) => {
      const health = monitoring.getSystemHealth();
      const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
      
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: health.status,
        timestamp: new Date().toISOString(),
        checks: health.checks.reduce((acc, check) => {
          acc[check.name] = {
            status: check.status,
            message: check.message,
            responseTime: check.responseTime
          };
          return acc;
        }, {} as any)
      }, null, 2));
    },

    // Metrics endpoint
    metrics: (req: any, res: any) => {
      const dashboard = monitoring.getDashboardData();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dashboard, null, 2));
    }
  };
}

// Start background monitoring when module is imported
let backgroundCleanup: (() => void) | null = null;

export function startMonitoring() {
  if (!backgroundCleanup) {
    backgroundCleanup = monitoring.startBackgroundMonitoring();
    console.log('📊 Background monitoring started');
  }
}

export function stopMonitoring() {
  if (backgroundCleanup) {
    backgroundCleanup();
    backgroundCleanup = null;
    console.log('📊 Background monitoring stopped');
  }
}

// Auto-start monitoring
startMonitoring();
