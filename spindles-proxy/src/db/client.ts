/**
 * Database Client Configuration
 * PostgreSQL connection pool for spindles analytics
 * Phase 2.1 - Foundation
 */

import { Pool, PoolConfig } from 'pg';

// Database configuration from environment or defaults
const config: PoolConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'aidis_production',
  user: process.env.POSTGRES_USER || 'ridgetop',
  password: process.env.POSTGRES_PASSWORD,
  max: parseInt(process.env.POSTGRES_POOL_MAX || '20'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// Global connection pool
export const pool = new Pool(config);

// Graceful shutdown
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
  process.exit(-1);
});

// Connection health check
export async function testConnection(): Promise<void> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT current_database(), version()');
    console.log('Database connected:', result.rows[0].current_database);
    console.log('PostgreSQL version:', result.rows[0].version);
    client.release();
  } catch (err) {
    console.error('Database connection failed:', err);
    throw err;
  }
}

// Cleanup function for graceful shutdown
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('Database pool closed');
}

// Handle process termination
process.on('SIGTERM', async () => {
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await closePool();
  process.exit(0);
});
