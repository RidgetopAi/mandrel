import { Pool, PoolConfig } from 'pg';
import { createDatabaseLogger } from '../middleware/databaseLogger';
import { dbLogger } from '../config/logger';
import { config } from '../config/environment';

// Environment variables are loaded by ../config/environment.ts
// No need to call dotenv.config() again here

/**
 * Database Configuration for AIDIS Command
 * Uses the same configuration as the main AIDIS MCP server
 */
const dbConfig: PoolConfig = {
  user: config.database.user,
  host: config.database.host,
  database: config.database.database,
  password: config.database.password,
  port: config.database.port,
  
  // Connection pool settings
  max: 10, // Maximum number of connections for admin tool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  
  // Enable SSL in production
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

// Create the connection pool
export const db = new Pool(dbConfig);

// Create database logger instance
export const dbWithLogging = createDatabaseLogger(db);

/**
 * Initialize database connection and verify connectivity
 */
export async function initializeDatabase(): Promise<void> {
  try {
    dbLogger.info('Initializing database connection...', {
      host: dbConfig.host,
      database: dbConfig.database,
      user: dbConfig.user,
      port: dbConfig.port,
      ssl: !!dbConfig.ssl
    });

    const client = await db.connect();
    dbLogger.info('Database connection established successfully');
    
    // Test basic query using logged query
    const result = await dbWithLogging.query('SELECT NOW() as current_time', [], 'init');
    dbLogger.info('Database query test successful', {
      currentTime: result.rows[0].current_time
    });
    
    client.release();
    
    // Setup periodic pool stats logging
    setInterval(() => {
      dbWithLogging.logPoolStats();
    }, 60000); // Log every minute
    
  } catch (error) {
    dbLogger.error('Database connection failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      config: {
        host: dbConfig.host,
        database: dbConfig.database,
        port: dbConfig.port
      }
    });
    throw error;
  }
}

/**
 * Check database health
 */
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  timestamp: Date;
  version?: string;
  error?: string;
}> {
  try {
    const client = await db.connect();
    const result = await client.query('SELECT version() as version, NOW() as timestamp');
    client.release();
    
    return {
      connected: true,
      timestamp: result.rows[0].timestamp,
      version: result.rows[0].version
    };
  } catch (error) {
    return {
      connected: false,
      timestamp: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get basic database statistics
 */
export async function getDatabaseStats(): Promise<{
  total_connections: number;
  active_connections: number;
  pool_size: number;
  idle_connections: number;
}> {
  try {
    const client = await db.connect();
    const result = await client.query(`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `);
    client.release();

    return {
      total_connections: parseInt(result.rows[0].total_connections),
      active_connections: parseInt(result.rows[0].active_connections),
      pool_size: db.totalCount,
      idle_connections: db.idleCount
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Gracefully close database connections
 */
export async function closeDatabase(): Promise<void> {
  try {
    await db.end();
    console.log('✅ Database connections closed');
  } catch (error) {
    console.error('❌ Error closing database:', error);
  }
}

// Handle graceful shutdown
process.on('SIGINT', closeDatabase);
process.on('SIGTERM', closeDatabase);
