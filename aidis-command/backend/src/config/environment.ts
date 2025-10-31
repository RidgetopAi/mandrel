import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import dotenvSafe from 'dotenv-safe';

// Load environment variables with centralized configuration hierarchy:
// 1. Environment-specific file from /config/environments/
// 2. Repository root .env (deployment overrides)
// 3. Backend-specific .env (legacy support)
// 4. process.env (highest priority)
// Existing process.env values are preserved.

const nodeEnv = process.env.NODE_ENV || 'development';
const configRoot = path.resolve(__dirname, '../../../../config');

const envPaths = [
  path.join(configRoot, 'environments', `.env.${nodeEnv}`),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../backend/.env')
];

console.log(`🔧 Loading configuration for environment: ${nodeEnv}`);

// Load hierarchical configuration with dotenv first (preserve existing logic)
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`📄 Loading config from: ${envPath}`);
    dotenv.config({ path: envPath, override: false });
  } else {
    console.log(`⚠️  Config file not found: ${envPath}`);
  }
}

dotenv.config({ override: false });

// Validate required variables using dotenv-safe with backend's .env.example
const backendExamplePath = path.resolve(__dirname, '../../.env.example');
try {
  dotenvSafe.config({
    example: backendExamplePath,
    allowEmptyValues: true, // Allow empty values for optional variables
    path: false as any // Don't load any .env file, just validate current process.env
  });
  console.log('✅ Environment variable validation passed');
} catch (error) {
  console.error('❌ Environment variable validation failed:', (error as Error).message);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️  Continuing in development mode despite validation errors');
  }
}

// Helper function to get environment variable with AIDIS_ prefix and fallback
function getEnvVar(aidisKey: string, legacyKey: string, defaultValue: string = ''): string {
  return process.env[aidisKey] || process.env[legacyKey] || defaultValue;
}

function getEnvVarInt(aidisKey: string, legacyKey: string, defaultValue: string = '0'): number {
  const value = getEnvVar(aidisKey, legacyKey, defaultValue);
  return parseInt(value);
}

export const config = {
  // Server configuration
  port: getEnvVarInt('AIDIS_HTTP_PORT', 'PORT', '5000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database configuration
  database: {
    url: getEnvVar('AIDIS_DATABASE_URL', 'DATABASE_URL'),
    user: getEnvVar('AIDIS_DATABASE_USER', 'DATABASE_USER', 'ridgetop'),
    host: getEnvVar('AIDIS_DATABASE_HOST', 'DATABASE_HOST', 'localhost'),
    database: getEnvVar('AIDIS_DATABASE_NAME', 'DATABASE_NAME', 'aidis_production'),
    password: getEnvVar('AIDIS_DATABASE_PASSWORD', 'DATABASE_PASSWORD') || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('AIDIS_DATABASE_PASSWORD or DATABASE_PASSWORD environment variable is required in production');
      }
      console.warn('⚠️  AIDIS_DATABASE_PASSWORD not set - using empty string in development');
      return '';
    })(),
    port: getEnvVarInt('AIDIS_DATABASE_PORT', 'DATABASE_PORT', '5432'),
  },
  
  // Authentication configuration
  auth: {
    jwtSecret: getEnvVar('AIDIS_JWT_SECRET', 'JWT_SECRET') || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('AIDIS_JWT_SECRET or JWT_SECRET environment variable is required in production');
      }
      console.warn('⚠️  Using default JWT secret - set AIDIS_JWT_SECRET environment variable');
      return 'dev-only-' + Math.random().toString(36).substring(7);
    })(),
    jwtExpiresIn: getEnvVar('AIDIS_JWT_EXPIRES_IN', 'JWT_EXPIRES_IN', '24h'),
    bcryptRounds: getEnvVarInt('AIDIS_BCRYPT_ROUNDS', 'BCRYPT_ROUNDS', '12'),
  },
  
  // CORS configuration
  cors: {
    origin: (getEnvVar('AIDIS_CORS_ORIGIN', 'CORS_ORIGIN') || 'http://localhost:3000,http://localhost:3001').split(','),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-Project-ID'],
  },
  
  // Logging configuration
  logging: {
    level: getEnvVar('AIDIS_LOG_LEVEL', 'LOG_LEVEL', 'info'),
    dbLogLevel: getEnvVar('AIDIS_DB_LOG_LEVEL', 'DB_LOG_LEVEL', 'warn'),
    enableConsole: process.env.NODE_ENV === 'development',
    enableFileRotation: getEnvVar('AIDIS_ENABLE_LOG_ROTATION', 'ENABLE_LOG_ROTATION', 'true') !== 'false',
    maxFileSize: getEnvVar('AIDIS_LOG_MAX_FILE_SIZE', 'LOG_MAX_FILE_SIZE', '20m'),
    maxFiles: getEnvVar('AIDIS_LOG_MAX_FILES', 'LOG_MAX_FILES', '30d')
  },

  // Application info
  app: {
    name: 'AIDIS Command Backend',
    version: process.env.npm_package_version || '1.0.0',
    description: 'REST API server for AIDIS database administration',
  }
};

export default config;
