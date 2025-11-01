/**
 * Real-time Data Service for Phase 4: Real-time Integration
 * Handles live data streaming, caching, and performance optimization
 */

export interface DataStreamConfig {
  endpoint: string;
  interval: number;
  maxRetries: number;
  timeout: number;
  cache: boolean;
  cacheTTL: number;
}

export interface DataCacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface StreamMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  cacheHitRate: number;
  lastUpdate: Date;
}

export class RealTimeDataService {
  private cache = new Map<string, DataCacheEntry<any>>();
  private activeStreams = new Map<string, NodeJS.Timeout>();
  private metrics: StreamMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    cacheHitRate: 0,
    lastUpdate: new Date()
  };
  private responseTimes: number[] = [];

  /**
   * Start a real-time data stream
   */
  startStream<T>(
    streamId: string,
    config: DataStreamConfig,
    onData: (data: T) => void,
    onError?: (error: Error) => void
  ): void {
    // Stop existing stream if running
    this.stopStream(streamId);

    const fetchData = async () => {
      const startTime = Date.now();

      try {
        // Check cache first
        if (config.cache) {
          const cached = this.getCachedData<T>(streamId);
          if (cached) {
            onData(cached);
            this.updateMetrics(startTime, true, true);
            return;
          }
        }

        // Make API request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);

        const response = await fetch(config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Process MCP response format
        let processedData: T;
        if (data.success && data.result?.content?.[0]?.text) {
          try {
            processedData = JSON.parse(data.result.content[0].text);
          } catch (e) {
            // If not JSON, return raw text wrapped in basic structure
            processedData = data.result.content[0].text as T;
          }
        } else {
          throw new Error('Invalid response format from MCP service');
        }

        // Cache the data
        if (config.cache) {
          this.setCachedData(streamId, processedData, config.cacheTTL);
        }

        onData(processedData);
        this.updateMetrics(startTime, true, false);

      } catch (error) {
        this.updateMetrics(startTime, false, false);
        console.error(`Real-time stream error for ${streamId}:`, error);

        if (onError) {
          onError(error as Error);
        }

        // Try to use cached data as fallback
        if (config.cache) {
          const cached = this.getCachedData<T>(streamId, true); // Allow stale data
          if (cached) {
            onData(cached);
          }
        }
      }
    };

    // Initial fetch
    fetchData();

    // Set up interval
    const intervalId = setInterval(fetchData, config.interval);
    this.activeStreams.set(streamId, intervalId);
  }

  /**
   * Stop a real-time data stream
   */
  stopStream(streamId: string): void {
    const intervalId = this.activeStreams.get(streamId);
    if (intervalId) {
      clearInterval(intervalId);
      this.activeStreams.delete(streamId);
    }
  }

  /**
   * Stop all active streams
   */
  stopAllStreams(): void {
    this.activeStreams.forEach((intervalId) => clearInterval(intervalId));
    this.activeStreams.clear();
  }

  /**
   * Get cached data if available and valid
   */
  private getCachedData<T>(key: string, allowStale = false): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    const isExpired = now - entry.timestamp > entry.ttl;

    if (isExpired && !allowStale) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Cache data with TTL
   */
  private setCachedData<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(startTime: number, success: boolean, fromCache: boolean): void {
    const responseTime = Date.now() - startTime;

    this.metrics.totalRequests++;
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    if (fromCache) {
      this.metrics.cacheHitRate =
        (this.metrics.cacheHitRate * (this.metrics.totalRequests - 1) + 1) / this.metrics.totalRequests;
    } else {
      this.metrics.cacheHitRate =
        (this.metrics.cacheHitRate * (this.metrics.totalRequests - 1)) / this.metrics.totalRequests;
    }

    // Track response times for average calculation
    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > 100) {
      this.responseTimes = this.responseTimes.slice(-100); // Keep last 100 measurements
    }

    this.metrics.averageResponseTime =
      this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;

    this.metrics.lastUpdate = new Date();
  }

  /**
   * Get performance metrics
   */
  getMetrics(): StreamMetrics {
    return { ...this.metrics };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Batch fetch multiple data sources
   */
  async batchFetch<T>(requests: Array<{
    id: string;
    endpoint: string;
    params?: any;
    cache?: boolean;
    cacheTTL?: number;
  }>): Promise<Map<string, T>> {
    const results = new Map<string, T>();

    const fetchPromises = requests.map(async (request) => {
      const startTime = Date.now();

      try {
        // Check cache first
        if (request.cache) {
          const cached = this.getCachedData<T>(request.id);
          if (cached) {
            results.set(request.id, cached);
            this.updateMetrics(startTime, true, true);
            return;
          }
        }

        // Make API request
        const response = await fetch(request.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request.params || {}),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Process MCP response format
        let processedData: T;
        if (data.success && data.result?.content?.[0]?.text) {
          try {
            processedData = JSON.parse(data.result.content[0].text);
          } catch (e) {
            processedData = data.result.content[0].text as T;
          }
        } else {
          throw new Error(`Invalid response format for ${request.id}`);
        }

        // Cache the data
        if (request.cache && request.cacheTTL) {
          this.setCachedData(request.id, processedData, request.cacheTTL);
        }

        results.set(request.id, processedData);
        this.updateMetrics(startTime, true, false);

      } catch (error) {
        this.updateMetrics(startTime, false, false);
        console.error(`Batch fetch error for ${request.id}:`, error);

        // Try fallback to cache
        if (request.cache) {
          const cached = this.getCachedData<T>(request.id, true);
          if (cached) {
            results.set(request.id, cached);
          }
        }
      }
    });

    await Promise.allSettled(fetchPromises);
    return results;
  }

  /**
   * Check service health
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: StreamMetrics;
    cacheStats: { size: number; keys: string[] };
  }> {
    const metrics = this.getMetrics();
    const cacheStats = this.getCacheStats();

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check success rate
    const successRate = metrics.totalRequests > 0
      ? metrics.successfulRequests / metrics.totalRequests
      : 1;

    if (successRate < 0.5) {
      status = 'unhealthy';
    } else if (successRate < 0.8 || metrics.averageResponseTime > 2000) {
      status = 'degraded';
    }

    return {
      status,
      metrics,
      cacheStats
    };
  }
}

// Singleton instance
export const realTimeDataService = new RealTimeDataService();

// Get MCP base URL from environment
const MCP_BASE_URL = process.env.REACT_APP_MCP_URL || 'http://localhost:8080';

// Default configurations for different data types
export const defaultConfigs = {
  fileAnalysis: {
    endpoint: `${MCP_BASE_URL}/mcp/tools/complexity_analyze`,
    interval: 30000, // 30 seconds
    maxRetries: 3,
    timeout: 10000, // 10 seconds
    cache: true,
    cacheTTL: 5 * 60 * 1000 // 5 minutes
  },
  projectInsights: {
    endpoint: `${MCP_BASE_URL}/mcp/tools/complexity_insights`,
    interval: 60000, // 1 minute
    maxRetries: 3,
    timeout: 15000, // 15 seconds
    cache: true,
    cacheTTL: 10 * 60 * 1000 // 10 minutes
  },
  hotspots: {
    endpoint: `${MCP_BASE_URL}/mcp/tools/complexity_insights`,
    interval: 45000, // 45 seconds
    maxRetries: 3,
    timeout: 12000, // 12 seconds
    cache: true,
    cacheTTL: 7 * 60 * 1000 // 7 minutes
  },
  trends: {
    endpoint: `${MCP_BASE_URL}/mcp/tools/complexity_insights`,
    interval: 120000, // 2 minutes
    maxRetries: 2,
    timeout: 20000, // 20 seconds
    cache: true,
    cacheTTL: 15 * 60 * 1000 // 15 minutes
  }
} as const;