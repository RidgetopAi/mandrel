import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Database Configuration for AIDIS Command
 * Uses the same configuration as the main AIDIS MCP server
 */
const dbConfig: PoolConfig = {
  user: process.env.DATABASE_USER || 'ridgetop',
  host: process.env.DATABASE_HOST || 'localhost', 
  database: process.env.DATABASE_NAME || 'aidis_production',
  password: process.env.DATABASE_PASSWORD || 'bandy',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  
  // Connection pool settings
  max: 10, // Maximum number of connections for admin tool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  
  // Enable SSL in production
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

// Create the connection pool
export const db = new Pool(dbConfig);

/**
 * Initialize database connection and verify connectivity
 */
export async function initializeDatabase(): Promise<void> {
  try {
    const client = await db.connect();
    console.log('✅ Database connection established successfully');
    
    // Test basic query
    const result = await client.query('SELECT NOW() as current_time');
    console.log('✅ Database query test successful:', result.rows[0].current_time);
    
    client.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error);
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
