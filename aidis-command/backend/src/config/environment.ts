import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server configuration
  port: parseInt(process.env.PORT || '5001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database configuration
  database: {
    user: process.env.DATABASE_USER || 'ridgetop',
    host: process.env.DATABASE_HOST || 'localhost',
    database: process.env.DATABASE_NAME || 'aidis_production', 
    password: process.env.DATABASE_PASSWORD || 'bandy',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
  },
  
  // Authentication configuration
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'aidis-secret-key-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),
  },
  
  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  },
  
  // Application info
  app: {
    name: 'AIDIS Command Backend',
    version: process.env.npm_package_version || '1.0.0',
    description: 'REST API server for AIDIS database administration',
  }
};

export default config;
