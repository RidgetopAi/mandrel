import { Pool, PoolConfig, PoolClient } from 'pg';
import { config } from '../config/environment';
import { dbLogger } from '../config/logger';

/**
 * TR008-4: Optimized Database Pool Manager for Backend Service
 *
 * Features:
 * - Singleton pattern to prevent multiple pools
 * - Connection health monitoring
 * - Pool statistics and metrics
 * - Automatic retry with exponential backoff
 * - Graceful shutdown handling
 */

interface PoolStats {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  activeQueries: number;
  poolUtilization: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
}

class BackendPoolManager {
  private static instance: BackendPoolManager;
  private pool: Pool | null = null;
  private isInitialized = false;
  private connectionErrors = 0;

  private constructor() {}

  static getInstance(): BackendPoolManager {
    if (!BackendPoolManager.instance) {
      BackendPoolManager.instance = new BackendPoolManager();
    }
    return BackendPoolManager.instance;
  }

  /**
   * Initialize the database pool with optimized settings for backend service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      dbLogger.info('Database pool already initialized');
      return;
    }

    const poolConfig: PoolConfig = {
      user: config.database.user,
      host: config.database.host,
      database: config.database.database,
      password: config.database.password,
      port: config.database.port,

      // Optimized pool settings for backend service
      max: 15, // Backend needs fewer connections than MCP server
      min: 3, // Maintain minimum connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      maxUses: 7500, // Recycle connections after 7500 uses

      // Enable statement timeout
      statement_timeout: 30000,
      query_timeout: 30000,

      // Enable SSL in production
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    };

    this.pool = new Pool(poolConfig);

    // Set up error handling
    this.pool.on('error', (err) => {
      dbLogger.error('Database pool error', { error: err.message });
      this.connectionErrors++;
    });

    this.pool.on('connect', () => {
      dbLogger.debug('New client connected to pool');
    });

    // Test the connection
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW() as current_time');
      client.release();

      dbLogger.info('Database pool initialized successfully', {
        database: poolConfig.database,
        host: `${poolConfig.host}:${poolConfig.port}`,
        poolSize: `${poolConfig.min}-${poolConfig.max}`,
        time: result.rows[0].current_time
      });

      this.isInitialized = true;
      this.startMonitoring();
    } catch (error) {
      dbLogger.error('Failed to initialize database pool', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get a connection from the pool with retry logic
   */
  async getConnection(retries = 3): Promise<PoolClient> {
    if (!this.pool || !this.isInitialized) {
      await this.initialize();
    }

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const client = await this.pool!.connect();

        // Reset error counter on successful connection
        if (this.connectionErrors > 0) {
          this.connectionErrors = 0;
        }

        return client;
      } catch (error) {
        lastError = error as Error;
        dbLogger.warn(`Connection attempt ${attempt}/${retries} failed`, {
          error: lastError.message
        });

        if (attempt < retries) {
          // Exponential backoff
          const delay = 1000 * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.connectionErrors++;
    throw new Error(`Failed to get connection after ${retries} attempts: ${lastError?.message}`);
  }

  /**
   * Execute a query with automatic connection management
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const client = await this.getConnection();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a transaction with automatic rollback
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getConnection();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    if (!this.pool) {
      return {
        totalCount: 0,
        idleCount: 0,
        waitingCount: 0,
        activeQueries: 0,
        poolUtilization: 0,
        healthStatus: 'unhealthy',
      };
    }

    const totalCount = this.pool.totalCount;
    const idleCount = this.pool.idleCount;
    const waitingCount = this.pool.waitingCount;
    const activeQueries = totalCount - idleCount;
    const poolUtilization = totalCount > 0 ? (activeQueries / totalCount) * 100 : 0;

    let healthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (this.connectionErrors > 5 || poolUtilization > 90) {
      healthStatus = 'unhealthy';
    } else if (this.connectionErrors > 0 || poolUtilization > 70) {
      healthStatus = 'degraded';
    }

    return {
      totalCount,
      idleCount,
      waitingCount,
      activeQueries,
      poolUtilization,
      healthStatus,
    };
  }

  /**
   * Start monitoring the pool health
   */
  private startMonitoring(): void {
    setInterval(() => {
      const stats = this.getStats();

      // Log pool stats periodically
      dbLogger.debug('Pool statistics', {
        total: stats.totalCount,
        idle: stats.idleCount,
        active: stats.activeQueries,
        waiting: stats.waitingCount,
        utilization: `${stats.poolUtilization.toFixed(1)}%`,
        health: stats.healthStatus
      });

      // Alert on unhealthy state
      if (stats.healthStatus === 'unhealthy') {
        dbLogger.error('Database pool unhealthy', stats);
      } else if (stats.healthStatus === 'degraded') {
        dbLogger.warn('Database pool degraded', stats);
      }
    }, 60000); // Check every minute
  }

  /**
   * Health check for the database connection
   */
  async healthCheck(): Promise<{ healthy: boolean; details: PoolStats }> {
    try {
      await this.query('SELECT 1');
      const stats = this.getStats();
      return {
        healthy: stats.healthStatus !== 'unhealthy',
        details: stats,
      };
    } catch (error) {
      return {
        healthy: false,
        details: this.getStats(),
      };
    }
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    if (!this.pool) return;

    try {
      await this.pool.end();
      dbLogger.info('Database pool closed');
      this.isInitialized = false;
      this.pool = null;
    } catch (error) {
      dbLogger.error('Error closing database pool', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}

// Export singleton instance
export const backendPool = BackendPoolManager.getInstance();

// Export convenience functions
export const getConnection = () => backendPool.getConnection();
export const query = <T = any>(sql: string, params?: any[]) => backendPool.query<T>(sql, params);
export const transaction = <T>(callback: (client: PoolClient) => Promise<T>) =>
  backendPool.transaction(callback);
export const getPoolStats = () => backendPool.getStats();
export const poolHealthCheck = () => backendPool.healthCheck();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await backendPool.close();
});

process.on('SIGTERM', async () => {
  await backendPool.close();
});