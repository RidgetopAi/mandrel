import { Pool, PoolConfig } from 'pg';
import dotenvSafe from 'dotenv-safe';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables with validation
const envExamplePath = path.resolve(__dirname, '../../.env.example');

// Check if files exist before loading
import fs from 'fs';
if (!fs.existsSync(envExamplePath)) {
  console.warn(`⚠️  .env.example not found at ${envExamplePath}`);
}

// Load environment variables from centralized config hierarchy
const nodeEnv = process.env.NODE_ENV || 'development';
const configRoot = path.resolve(__dirname, '../../../config');

const envPaths = [
  path.join(configRoot, 'environments', `.env.${nodeEnv}`),
  path.resolve(__dirname, '../../.env')
];

console.log(`🔧 [MCP] Loading configuration for environment: ${nodeEnv}`);

// Load hierarchical configuration
for (const configPath of envPaths) {
  if (fs.existsSync(configPath)) {
    console.log(`📄 [MCP] Loading config from: ${configPath}`);
    // Read and parse the .env file manually for ES modules
    try {
      const envContent = fs.readFileSync(configPath, 'utf8');
      const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      for (const line of envLines) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim();
        if (key && value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    } catch (error) {
      console.warn(`⚠️ [MCP] Failed to load config from: ${configPath}`);
    }
  }
}

// Validate required variables
try {
  dotenvSafe.config({
    example: envExamplePath,
    allowEmptyValues: true,
    path: false as any // Don't load any .env file, just validate current process.env
  });
  console.log('✅ [MCP] Environment variable validation passed');
} catch (error) {
  console.error('❌ [MCP] Environment variable validation failed:', (error as Error).message);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️  [MCP] Continuing in development mode despite validation errors');
  }
}

/**
 * Database Configuration for Mandrel
 *
 * This sets up our PostgreSQL connection pool with proper error handling
 * and reconnection logic. The pool manages multiple database connections
 * efficiently, which is crucial for a high-performance MCP server.
 */

const dbConfig: PoolConfig = {
  user: process.env.DATABASE_USER || 'mandrel',
  host: process.env.DATABASE_HOST || 'localhost',
  database: process.env.DATABASE_NAME || (() => {
    throw new Error('DATABASE_NAME environment variable is required!');
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
    
    // Only run self-tests in development or when explicitly enabled
    // In production, assume DB is properly configured and skip CREATE EXTENSION/test tables
    const shouldRunSelfTests =
      process.env.NODE_ENV !== 'production' ||
      process.env.MANDREL_DB_SELFTEST === 'true';
    
    if (shouldRunSelfTests) {
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
    } else {
      console.log('⏭️  Skipping DB self-tests (production mode)');
      console.log('💡 Ensure pgvector extension is installed: CREATE EXTENSION vector;');
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