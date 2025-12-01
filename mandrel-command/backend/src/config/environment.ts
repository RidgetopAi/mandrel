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

// Helper function to get environment variable with MANDREL_ prefix and AIDIS_ fallback
function getEnvVar(mandrelKey: string, aidisKey: string, defaultValue: string = ''): string {
  const value = process.env[mandrelKey] || process.env[aidisKey] || defaultValue;
  
  // Log deprecation warning if old var is used
  if (process.env[aidisKey] && !process.env[mandrelKey]) {
    console.warn(`⚠️  ${aidisKey} is deprecated. Use ${mandrelKey} instead.`);
  }
  
  return value;
}

function getEnvVarInt(mandrelKey: string, aidisKey: string, defaultValue: string = '0'): number {
  const value = getEnvVar(mandrelKey, aidisKey, defaultValue);
  return parseInt(value);
}

export const config = {
  // Server configuration
  port: getEnvVarInt('MANDREL_HTTP_PORT', 'AIDIS_HTTP_PORT', '5000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database configuration
  database: {
    url: getEnvVar('MANDREL_DATABASE_URL', 'AIDIS_DATABASE_URL'),
    user: getEnvVar('MANDREL_DATABASE_USER', 'AIDIS_DATABASE_USER', 'ridgetop'),
    host: getEnvVar('MANDREL_DATABASE_HOST', 'AIDIS_DATABASE_HOST', 'localhost'),
    database: getEnvVar('MANDREL_DATABASE_NAME', 'AIDIS_DATABASE_NAME', 'aidis_production'),
    password: getEnvVar('MANDREL_DATABASE_PASSWORD', 'AIDIS_DATABASE_PASSWORD') || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('MANDREL_DATABASE_PASSWORD or AIDIS_DATABASE_PASSWORD environment variable is required in production');
      }
      console.warn('⚠️  MANDREL_DATABASE_PASSWORD not set - using empty string in development');
      return '';
    })(),
    port: getEnvVarInt('MANDREL_DATABASE_PORT', 'AIDIS_DATABASE_PORT', '5432'),
  },
  
  // Authentication configuration
  auth: {
    jwtSecret: getEnvVar('MANDREL_JWT_SECRET', 'AIDIS_JWT_SECRET') || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('MANDREL_JWT_SECRET or AIDIS_JWT_SECRET environment variable is required in production');
      }
      console.warn('⚠️  Using default JWT secret - set MANDREL_JWT_SECRET environment variable');
      return 'dev-only-' + Math.random().toString(36).substring(7);
    })(),
    jwtExpiresIn: getEnvVar('MANDREL_JWT_EXPIRES_IN', 'AIDIS_JWT_EXPIRES_IN', '24h'),
    bcryptRounds: getEnvVarInt('MANDREL_BCRYPT_ROUNDS', 'AIDIS_BCRYPT_ROUNDS', '12'),
  },
  
  // CORS configuration
  cors: {
    origin: (getEnvVar('MANDREL_CORS_ORIGIN', 'AIDIS_CORS_ORIGIN') || 'http://localhost:3000,http://localhost:3001').split(','),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-Project-ID'],
  },
  
  // Logging configuration
  logging: {
    level: getEnvVar('MANDREL_LOG_LEVEL', 'AIDIS_LOG_LEVEL', 'info'),
    dbLogLevel: getEnvVar('MANDREL_DB_LOG_LEVEL', 'AIDIS_DB_LOG_LEVEL', 'warn'),
    enableConsole: process.env.NODE_ENV === 'development',
    enableFileRotation: getEnvVar('MANDREL_ENABLE_LOG_ROTATION', 'AIDIS_ENABLE_LOG_ROTATION', 'true') !== 'false',
    maxFileSize: getEnvVar('MANDREL_LOG_MAX_FILE_SIZE', 'AIDIS_LOG_MAX_FILE_SIZE', '20m'),
    maxFiles: getEnvVar('MANDREL_LOG_MAX_FILES', 'AIDIS_LOG_MAX_FILES', '30d')
  },

  // Application info
  app: {
    name: 'Mandrel Command Backend',
    version: process.env.npm_package_version || '1.0.0',
    description: 'REST API server for Mandrel database administration',
  }
};

export default config;
