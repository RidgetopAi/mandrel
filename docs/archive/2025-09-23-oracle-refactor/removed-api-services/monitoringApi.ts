import { apiClient } from './api';

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  checks: {
    [key: string]: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      message: string;
      responseTime: number;
    };
  };
  summary: {
    totalChecks: number;
    healthyChecks: number;
  };
}

export interface SystemMetrics {
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

export interface PerformanceTrends {
  timestamp: number;
  windowMinutes: number;
  trends: {
    responseTime: number[];
    errorRate: number;
    requestVolume: number;
  };
}

export class MonitoringApi {
  /**
   * Get system health status
   */
  static async getSystemHealth(): Promise<SystemHealth> {
    const response = await apiClient.get<{
      success: boolean;
      data: SystemHealth;
    }>('/monitoring/health');
    
    if (!response.success) {
      throw new Error('Failed to fetch system health');
    }
    
    return response.data;
  }

  /**
   * Get detailed system metrics
   */
  static async getSystemMetrics(): Promise<SystemMetrics> {
    const response = await apiClient.get<{
      success: boolean;
      data: SystemMetrics;
    }>('/monitoring/metrics');
    
    if (!response.success) {
      throw new Error('Failed to fetch system metrics');
    }
    
    return response.data;
  }

  /**
   * Get performance trends
   */
  static async getPerformanceTrends(minutes: number = 5): Promise<PerformanceTrends> {
    const response = await apiClient.get<{
      success: boolean;
      data: PerformanceTrends;
    }>(`/monitoring/trends?minutes=${minutes}`);
    
    if (!response.success) {
      throw new Error('Failed to fetch performance trends');
    }
    
    return response.data;
  }
}

export default MonitoringApi;
