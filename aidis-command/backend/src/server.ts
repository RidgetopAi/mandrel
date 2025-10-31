import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import config from './config/environment';
import { logger, morganLogStream } from './config/logger';
import { initializeDatabase } from './database/connection';
// import { backendPool } from './database/poolManager'; // Temporarily commented out
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { correlationMiddleware } from './middleware/correlationId';
import { requestLoggingMiddleware } from './middleware/requestLogger';
import { projectContextMiddleware } from './middleware/project';
import { requestMonitoringMiddleware } from './middleware/requestMonitoring';
import { webSocketService } from './services/websocket';
import { dbEvents } from './services/dbEvents';
import { sseService } from './services/sse';
import apiRoutes from './routes';
import { ensureFeatureFlags } from './utils/featureFlags';
import { portManager } from './utils/portManager';

/**
 * AIDIS Command Backend Server
 * REST API server for AIDIS database administration
 */

const app = express();
const featureFlagsPromise = ensureFeatureFlags();

app.get('/api/feature-flags', async (_req, res) => {
  const featureFlags = await featureFlagsPromise;
  const metadata = featureFlags.getMetadata();
  res.json({
    success: true,
    version: metadata.version,
    updatedAt: metadata.updatedAt,
    flags: featureFlags.getAllFlags()
  });
});

// Security middleware
app.use(helmet());

// CORS middleware
app.use(cors(config.cors));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Correlation ID middleware (must be first)
app.use(correlationMiddleware);

// Morgan HTTP logging (integrated with Winston)
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined', {
  stream: morganLogStream
}));

// Request/response logging middleware
app.use(requestLoggingMiddleware);

// Request monitoring middleware (applied to all API routes)
app.use('/api', requestMonitoringMiddleware);

// Oracle Phase 1: Project context middleware (applied to all API routes)
app.use('/api', projectContextMiddleware);

// API routes
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      message: 'AIDIS Command Backend API',
      version: config.app.version,
      timestamp: new Date().toISOString(),
      docs: '/api/health'
    }
  });
});

// 404 handler (must be before error handler)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

/**
 * Start server
 */
async function startServer(): Promise<void> {
  try {
    // Initialize logging
    logger.info('Starting AIDIS Command Backend...', {
      version: config.app.version,
      environment: config.nodeEnv,
      logLevel: config.logging.level,
      dbLogLevel: config.logging.dbLogLevel
    });

    // Initialize database connection
    await initializeDatabase();

    // Initialize optimized connection pool (TR008-4)
    // await backendPool.initialize(); // Temporarily commented out
    logger.info('Database initialized successfully');

    // Start DB Events Listener for SSE
    await dbEvents.start();
    logger.info('DB Events Listener started for SSE');

    const featureFlags = await featureFlagsPromise;
    app.locals.featureFlags = featureFlags;

    // Get service name based on environment for port management
    const serviceName = config.nodeEnv === 'production' ? 'aidis-command-prod' : 'aidis-command-dev';

    // Get dynamic port assignment
    const assignedPort = await portManager.assignPort(serviceName, config.port);

    // Start HTTP server with dynamic port assignment
    const server = app.listen(assignedPort, async () => {
      const actualPort = (server.address() as any)?.port || assignedPort;

      // Register the service with its actual port
      await portManager.registerService(serviceName, actualPort, '/api/health');
      await portManager.logPortConfiguration(serviceName, actualPort);

      logger.info('AIDIS Command Backend started successfully', {
        port: actualPort,
        assignedPort,
        serviceName,
        environment: config.nodeEnv,
        database: `${config.database.database}@${config.database.host}:${config.database.port}`,
        endpoints: [
          'GET /api/health - Server health',
          'GET /api/db-status - Database status',
          'GET /api/version - Version info'
        ]
      });

      console.log('🚀 AIDIS Command Backend started');
      console.log(`📍 Service: ${serviceName}`);
      console.log(`📍 Server running on http://localhost:${actualPort}`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log(`📊 Logging: ${config.logging.level} (DB: ${config.logging.dbLogLevel})`);
    });

    // Conditionally initialize WebSocket server based on feature flag
    const websocketsEnabled = featureFlags.getFlag('realtime.websockets.enabled', false);
    if (websocketsEnabled) {
      webSocketService.initialize(server);
      logger.info('WebSocket server initialized (feature flag enabled)', { endpoint: '/ws' });
    } else {
      logger.info('WebSocket server disabled (feature flag off)', { 
        flag: 'realtime.websockets.enabled',
        sseEnabled: featureFlags.getFlag('realtime.sse.enabled', false)
      });
    }

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`, {
        signal,
        timestamp: new Date().toISOString()
      });

      // Stop SSE service and disconnect all clients
      sseService.disconnectAll();
      logger.info('SSE service stopped');

      // Stop DB Events Listener
      await dbEvents.stop();
      logger.info('DB Events Listener stopped');

      // Unregister from port registry
      await portManager.unregisterService(serviceName);

      server.close(() => {
        logger.info('HTTP server closed successfully');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

export default app;