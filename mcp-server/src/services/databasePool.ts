import { Pool, PoolConfig, PoolClient } from 'pg';

/**
 * TR008-4: Optimized Database Connection Pool Manager
 *
 * Features:
 * - Singleton pool instance to prevent multiple pool creations
 * - Automatic connection health checks
 * - Connection retry logic with exponential backoff
 * - Pool statistics and monitoring
 * - Graceful shutdown handling
 * - Connection leak detection
 */

interface PoolStats {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  activeQueries: number;
  poolUtilization: number;
  connectionErrors: number;
  lastError?: string;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
}

interface ConnectionOptions {
  retries?: number;
  retryDelay?: number;
  priority?: 'high' | 'normal' | 'low';
  timeout?: number;
}

class DatabasePoolManager {
  private static instance: DatabasePoolManager;
  private pool: Pool | null = null;
  private isInitialized = false;
  private connectionErrors = 0;
  private lastError: string | undefined;
  private activeConnections = new Map<string, { client: PoolClient; timestamp: number }>();
  private readonly CONNECTION_LEAK_THRESHOLD = 60000; // 1 minute

  private constructor() {}

  static getInstance(): DatabasePoolManager {
    if (!DatabasePoolManager.instance) {
      DatabasePoolManager.instance = new DatabasePoolManager();
    }
    return DatabasePoolManager.instance;
  }

  /**
   * Initialize the database pool with optimized settings
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('📦 Database pool already initialized');
      return;
    }

    const dbUser = process.env.DATABASE_USER || 'mandrel';
    const dbHost = process.env.DATABASE_HOST || 'localhost';
    const dbName = process.env.DATABASE_NAME || 'mandrel';
    const dbPassword = process.env.DATABASE_PASSWORD || '';
    const dbPort = parseInt(process.env.DATABASE_PORT || '5432');

    const poolConfig: PoolConfig = {
      user: dbUser,
      host: dbHost,
      database: dbName,
      password: dbPassword,
      port: dbPort,

      // Optimized pool settings for Phase 4
      max: 30, // Increased from 20 for service mesh architecture
      min: 5, // Maintain minimum connections for fast response
      idleTimeoutMillis: 30000, // Keep idle connections for 30s
      connectionTimeoutMillis: 5000, // Increased timeout for container environment
      maxUses: 7500, // Recycle connections after 7500 uses

      // Enable statement timeout to prevent long-running queries
      statement_timeout: 30000, // 30 seconds
      query_timeout: 30000,

      // Enable SSL in production
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    };

    this.pool = new Pool(poolConfig);

    // Set up error handling
    this.pool.on('error', (err) => {
      console.error('❌ Unexpected database pool error:', err);
      this.connectionErrors++;
      this.lastError = err.message;
    });

    this.pool.on('connect', (_client) => {
      console.log('✅ New database client connected to pool');
    });

    this.pool.on('acquire', (client) => {
      const id = this.generateClientId();
      this.activeConnections.set(id, { client, timestamp: Date.now() });
    });

    this.pool.on('remove', (client) => {
      // Remove from active connections tracking
      for (const [id, conn] of this.activeConnections.entries()) {
        if (conn.client === client) {
          this.activeConnections.delete(id);
          break;
        }
      }
    });

    // Test the connection
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW() as current_time, version() as version');
      console.log('✅ Database pool initialized successfully');
      console.log(`📊 Database: ${poolConfig.database}`);
      console.log(`🏠 Host: ${poolConfig.host}:${poolConfig.port}`);
      console.log(`📦 Pool Size: ${poolConfig.min}-${poolConfig.max} connections`);
      console.log(`⏰ Current Time: ${result.rows[0].current_time}`);
      client.release();

      this.isInitialized = true;
      this.startMonitoring();
    } catch (error) {
      console.error('❌ Failed to initialize database pool:', error);
      throw error;
    }
  }

  /**
   * Get a connection from the pool with retry logic
   */
  async getConnection(options: ConnectionOptions = {}): Promise<PoolClient> {
    const { retries = 3, retryDelay = 1000, timeout = 5000 } = options;

    if (!this.pool || !this.isInitialized) {
      await this.initialize();
    }

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const client = await Promise.race([
          this.pool!.connect(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), timeout)
          ),
        ]);

        // Reset error counter on successful connection
        if (this.connectionErrors > 0) {
          this.connectionErrors = 0;
        }

        return client;
      } catch (error) {
        lastError = error as Error;
        console.warn(`⚠️  Database connection attempt ${attempt}/${retries} failed:`, lastError.message);

        if (attempt < retries) {
          // Exponential backoff
          const delay = retryDelay * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.connectionErrors++;
    this.lastError = lastError?.message;
    throw new Error(`Failed to get database connection after ${retries} attempts: ${lastError?.message}`);
  }

  /**
   * Execute a query with automatic connection management
   */
  async query<T = any>(sql: string, params: any[] = [], options: ConnectionOptions = {}): Promise<T[]> {
    const client = await this.getConnection(options);
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a transaction with automatic rollback on error
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    options: ConnectionOptions = {}
  ): Promise<T> {
    const client = await this.getConnection(options);

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
   * Get pool statistics for monitoring
   */
  getStats(): PoolStats {
    if (!this.pool) {
      return {
        totalCount: 0,
        idleCount: 0,
        waitingCount: 0,
        activeQueries: 0,
        poolUtilization: 0,
        connectionErrors: this.connectionErrors,
        lastError: this.lastError,
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
      connectionErrors: this.connectionErrors,
      lastError: this.lastError,
      healthStatus,
    };
  }

  /**
   * Check for connection leaks
   */
  private checkForLeaks(): void {
    const now = Date.now();
    const leaks: string[] = [];

    for (const [id, conn] of this.activeConnections.entries()) {
      const duration = now - conn.timestamp;
      if (duration > this.CONNECTION_LEAK_THRESHOLD) {
        leaks.push(`Connection ${id} active for ${Math.round(duration / 1000)}s`);
      }
    }

    if (leaks.length > 0) {
      console.warn('⚠️  Potential connection leaks detected:', leaks);
    }
  }

  /**
   * Start monitoring the pool health
   */
  private startMonitoring(): void {
    // Check pool health every 30 seconds
    setInterval(() => {
      const stats = this.getStats();

      if (stats.healthStatus === 'unhealthy') {
        console.error('🚨 Database pool health check failed:', stats);
      } else if (stats.healthStatus === 'degraded') {
        console.warn('⚠️  Database pool health degraded:', stats);
      }

      // Check for connection leaks
      this.checkForLeaks();

      // Log stats in development
      if (process.env.NODE_ENV === 'development') {
        console.log('📊 Database Pool Stats:', {
          ...stats,
          activeConnections: this.activeConnections.size,
        });
      }
    }, 30000);
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
   * Gracefully close all connections
   */
  async close(): Promise<void> {
    if (!this.pool) return;

    try {
      await this.pool.end();
      console.log('✅ Database pool connections closed gracefully');
      this.isInitialized = false;
      this.pool = null;
      this.activeConnections.clear();
    } catch (error) {
      console.error('❌ Error closing database pool:', error);
      throw error;
    }
  }

  /**
   * Generate a unique client ID for tracking
   */
  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const dbPool = DatabasePoolManager.getInstance();

// Export convenience functions
export const getConnection = (options?: ConnectionOptions) => dbPool.getConnection(options);
export const query = <T = any>(sql: string, params?: any[], options?: ConnectionOptions) =>
  dbPool.query<T>(sql, params, options);
export const transaction = <T>(
  callback: (client: PoolClient) => Promise<T>,
  options?: ConnectionOptions
) => dbPool.transaction(callback, options);
export const getPoolStats = () => dbPool.getStats();
export const poolHealthCheck = () => dbPool.healthCheck();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, closing database pool...');
  await dbPool.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, closing database pool...');
  await dbPool.close();
  process.exit(0);
});