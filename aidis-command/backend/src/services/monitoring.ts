/**
 * System Monitoring Service
 * Provides real-time system health and performance metrics
 */

import { db } from '../database/connection';
import os from 'os';

interface SystemMetrics {
  timestamp: number;
  system: {
    uptime: number;
    memory: {
      used: number;
      free: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
    process: {
      pid: number;
      uptime: number;
      memoryUsage: {
        rss: number;
        heapUsed: number;
        heapTotal: number;
        external: number;
      };
    };
  };
  database: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime: number;
    activeConnections: number;
  };
  api: {
    requestCount: number;
    errorRate: number;
    averageResponseTime: number;
  };
}

interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  responseTime?: number;
  timestamp: number;
}

class MonitoringService {
  private healthChecks: Map<string, HealthCheck> = new Map();
  private requestCount = 0;
  private errorCount = 0;
  private responseTimes: number[] = [];
  private readonly maxHistorySize = 100;

  /**
   * Record API request metrics
   */
  recordRequest(responseTime: number, isError: boolean = false) {
    this.requestCount++;
    if (isError) {
      this.errorCount++;
    }
    
    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > this.maxHistorySize) {
      this.responseTimes.shift();
    }
  }

  /**
   * Get current system metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    const memUsage = process.memoryUsage();
    const now = Date.now();
    
    // Database health check
    const dbHealth = await this.checkDatabaseHealth();
    
    // Calculate API metrics
    const errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0;
    const avgResponseTime = this.responseTimes.length > 0 
      ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length 
      : 0;

    // System memory (real system values)
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    return {
      timestamp: now,
      system: {
        uptime: process.uptime(),
        memory: {
          used: usedMemory,
          free: freeMemory,
          total: totalMemory,
          percentage: (usedMemory / totalMemory) * 100
        },
        cpu: {
          usage: this.getCpuUsage() // Approximate
        },
        process: {
          pid: process.pid,
          uptime: process.uptime(),
          memoryUsage: {
            rss: memUsage.rss,
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external
          }
        }
      },
      database: dbHealth,
      api: {
        requestCount: this.requestCount,
        errorRate: parseFloat(errorRate.toFixed(2)),
        averageResponseTime: parseFloat(avgResponseTime.toFixed(2))
      }
    };
  }

  /**
   * Get system health summary
   */
  async getHealthSummary() {
    const metrics = await this.getSystemMetrics();
    
    // Overall health determination
    const dbHealthy = metrics.database.status === 'healthy';
    const memoryHealthy = metrics.system.memory.percentage < 80;
    const apiHealthy = metrics.api.errorRate < 5;
    
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (!dbHealthy || metrics.system.memory.percentage > 90 || metrics.api.errorRate > 20) {
      overallStatus = 'unhealthy';
    } else if (!memoryHealthy || metrics.api.errorRate > 5) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: Date.now(),
      checks: {
        database: {
          status: metrics.database.status,
          message: `Response time: ${metrics.database.responseTime}ms`,
          responseTime: metrics.database.responseTime
        },
        memory: {
          status: memoryHealthy ? 'healthy' : (metrics.system.memory.percentage > 90 ? 'unhealthy' : 'degraded'),
          message: `Memory usage: ${metrics.system.memory.percentage.toFixed(1)}%`,
          responseTime: 0
        },
        api: {
          status: apiHealthy ? 'healthy' : (metrics.api.errorRate > 20 ? 'unhealthy' : 'degraded'),
          message: `Error rate: ${metrics.api.errorRate}% (${this.requestCount} requests)`,
          responseTime: metrics.api.averageResponseTime
        },
        process: {
          status: 'healthy',
          message: `Uptime: ${Math.round(metrics.system.process.uptime)}s`,
          responseTime: 0
        }
      },
      summary: {
        totalChecks: 4,
        healthyChecks: Object.values({
          database: dbHealthy,
          memory: memoryHealthy,
          api: apiHealthy,
          process: true
        }).filter(Boolean).length
      }
    };
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime: number;
    activeConnections: number;
  }> {
    const startTime = Date.now();
    
    try {
      // Simple health check query
      await db.query('SELECT 1');
      const responseTime = Date.now() - startTime;
      
      // Get connection info (approximate)
      const connInfo = db.totalCount || 0;
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (responseTime > 1000) {
        status = 'unhealthy';
      } else if (responseTime > 500) {
        status = 'degraded';
      }
      
      return {
        status,
        responseTime,
        activeConnections: connInfo
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        activeConnections: 0
      };
    }
  }

  /**
   * Get approximate CPU usage
   */
  private getCpuUsage(): number {
    // Simple approximation based on process usage
    // In a real implementation, you'd use more sophisticated CPU monitoring
    const usage = process.cpuUsage();
    const total = usage.user + usage.system;
    
    // Convert to approximate percentage (this is a rough estimate)
    return Math.min(100, (total / 1000000) * 10); // Very rough approximation
  }

  /**
   * Get performance trends (last N data points)
   */
  getPerformanceTrends(minutes: number = 5) {
    const now = Date.now();
    
    return {
      timestamp: now,
      windowMinutes: minutes,
      trends: {
        responseTime: this.responseTimes.slice(-20), // Last 20 requests
        errorRate: this.errorCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0,
        requestVolume: this.requestCount
      }
    };
  }

  /**
   * Reset metrics (for testing or periodic cleanup)
   */
  resetMetrics() {
    this.requestCount = 0;
    this.errorCount = 0;
    this.responseTimes = [];
    this.healthChecks.clear();
  }
}

// Singleton instance
export const monitoringService = new MonitoringService();

// Export class for testing
export { MonitoringService };
