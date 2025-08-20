import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Database Configuration for AIDIS
 * 
 * This sets up our PostgreSQL connection pool with proper error handling
 * and reconnection logic. The pool manages multiple database connections
 * efficiently, which is crucial for a high-performance MCP server.
 */

const dbConfig: PoolConfig = {
  user: process.env.DATABASE_USER || 'ridgetop',
  host: process.env.DATABASE_HOST || 'localhost',
  database: process.env.DATABASE_NAME || (() => {
    throw new Error('DATABASE_NAME environment variable is required! No fallback allowed.');
  })(),
  password: process.env.DATABASE_PASSWORD || '',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  
  // Connection pool settings
  max: 20, // Maximum number of connections
  idleTimeoutMillis: 30000, // How long to keep idle connections
  connectionTimeoutMillis: 2000, // How long to wait for connection
  
  // Enable SSL in production
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

// Create the connection pool
export const db = new Pool(dbConfig);

// Log database connection details on startup
console.log(`🗄️  Database Configuration:`);
console.log(`   📊 Database: ${dbConfig.database}`);
console.log(`   🏠 Host: ${dbConfig.host}:${dbConfig.port}`);
console.log(`   👤 User: ${dbConfig.user}`);
console.log(`   📦 Pool Size: ${dbConfig.max} connections`);

/**
 * Initialize database connection and verify pgvector extension
 */
export async function initializeDatabase(): Promise<void> {
  try {
    // Test the connection
    const client = await db.connect();
    console.log('✅ Database connection established successfully');
    
    // Check if pgvector extension is installed
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      console.log('✅ pgvector extension is ready');
    } catch (error) {
      console.warn('⚠️  pgvector extension not available - vector search will be limited');
      console.warn('Please install postgresql-pgvector package on your system');
    }
    
    // Verify we can create vector columns (test)
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS vector_test (
          id SERIAL PRIMARY KEY,
          embedding VECTOR(1536)
        )
      `);
      await client.query('DROP TABLE vector_test');
      console.log('✅ Vector operations confirmed working');
    } catch (error) {
      console.warn('⚠️  Vector operations not available');
    }
    
    client.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error);
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
