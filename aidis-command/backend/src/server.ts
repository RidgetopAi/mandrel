import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import config from './config/environment';
import { initializeDatabase } from './database/connection';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { projectContextMiddleware } from './middleware/project';
import { webSocketService } from './services/websocket';
import apiRoutes from './routes';

/**
 * AIDIS Command Backend Server
 * REST API server for AIDIS database administration
 */

const app = express();

// Security middleware
app.use(helmet());

// CORS middleware
app.use(cors(config.cors));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

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
    // Initialize database connection
    await initializeDatabase();
    console.log('✅ Database initialized successfully');

    // Start HTTP server
    const server = app.listen(config.port, () => {
      console.log('🚀 AIDIS Command Backend started');
      console.log(`📍 Server running on http://localhost:${config.port}`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log(`💾 Database: ${config.database.database}@${config.database.host}:${config.database.port}`);
      console.log('📋 Health endpoints:');
      console.log(`   • GET /api/health - Server health`);
      console.log(`   • GET /api/db-status - Database status`);
      console.log(`   • GET /api/version - Version info`);
    });

    // Initialize WebSocket server
    webSocketService.initialize(server);
    console.log('🔌 WebSocket server initialized on /ws');

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      console.log(`\n🔄 Received ${signal}, shutting down gracefully...`);
      server.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

export default app;
