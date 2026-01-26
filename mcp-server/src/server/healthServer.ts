/**
 * Health Check Server
 * Provides HTTP health endpoints and MCP tool HTTP bridge
 */

import * as http from 'http';
import express from 'express';
import { logger } from '../utils/logger.js';
import { portManager } from '../utils/portManager.js';
import { dbPool, poolHealthCheck } from '../services/databasePool.js';
import { AIDIS_TOOL_DEFINITIONS } from '../config/toolDefinitions.js';
import { ProjectController } from '../api/controllers/projectController.js';
import createSessionRouter from '../api/v2/sessionRoutes.js';
import createSurveyorRouter from '../api/v2/surveyorRoutes.js';

/**
 * HTTP Health Check Server
 * Provides health endpoints and MCP tool HTTP bridge
 */
export class HealthServer {
  private server: http.Server | null = null;
  private app: express.Application;
  private port: number = 8080;
  private dbHealthy: boolean = false;
  private circuitBreakerState: string = 'closed';
  private mcpToolExecutor?: (toolName: string, args: any) => Promise<any>;
  private parameterDeserializer?: (args: any) => any;
  private projectController: ProjectController;

  constructor(
    mcpToolExecutor?: (toolName: string, args: any) => Promise<any>,
    parameterDeserializer?: (args: any) => any
  ) {
    this.app = express();
    this.mcpToolExecutor = mcpToolExecutor;
    this.parameterDeserializer = parameterDeserializer;
    this.projectController = new ProjectController();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // CORS headers for cross-origin requests from frontend
    // Default to localhost:3000 for security, allow override via env
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'];
    
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Version, X-Request-ID, X-Correlation-ID');

      // Handle OPTIONS preflight requests immediately
      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }

      next();
    });

    // JSON body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  /**
   * Setup Express routes
   */
  private setupRoutes(): void {
    // Mount session analytics REST API routes
    const sessionRouter = createSessionRouter();
    this.app.use('/api/v2/sessions', sessionRouter);
    logger.info('📊 Session Analytics API mounted: /api/v2/sessions/* (9 endpoints)');

    // Mount surveyor REST API routes
    const surveyorRouter = createSurveyorRouter();
    this.app.use('/api/v2/surveyor', surveyorRouter);
    logger.info('🔭 Surveyor API mounted: /api/v2/surveyor/* (9 endpoints)');

    // Health check endpoints (existing)
    this.app.get('/healthz', this.handleHealthCheckExpress.bind(this));
    this.app.get('/health', this.handleHealthCheckExpress.bind(this));
    this.app.get('/readyz', this.handleReadinessCheckExpress.bind(this));
    this.app.get('/livez', this.handleLivenessCheckExpress.bind(this));
    this.app.get('/health/mcp', this.handleMcpHealthCheckExpress.bind(this));
    this.app.get('/health/database', this.handleDatabaseHealthCheckExpress.bind(this));
    this.app.get('/health/embeddings', this.handleEmbeddingsHealthCheckExpress.bind(this));

    // MCP tool endpoints
    this.app.get('/mcp/tools/schemas', this.handleToolSchemasExpress.bind(this));
    this.app.get('/mcp/tools', this.handleToolListExpress.bind(this));
    this.app.post('/mcp/tools/:toolName', this.handleMcpToolExpress.bind(this));

    // V2 MCP API (handle all v2/mcp paths as middleware)
    this.app.use('/v2/mcp', this.handleV2McpExpress.bind(this));

    // Project API
    this.app.post('/api/v2/projects/:id/set-primary', this.handleProjectSetPrimaryExpress.bind(this));

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found', path: req.path });
    });
  }

  /**
   * Set database health status
   */
  setDatabaseHealth(healthy: boolean): void {
    this.dbHealthy = healthy;
  }

  /**
   * Set circuit breaker state
   */
  setCircuitBreakerState(state: string): void {
    this.circuitBreakerState = state;
  }

  /**
   * Start the health server
   */
  async start(): Promise<number> {
    // Get port from port manager
    this.port = await portManager.assignPort('aidis-mcp');

    // Create HTTP server from Express app
    this.server = http.createServer(this.app);

    return new Promise<number>((resolve, reject) => {
      this.server!.listen(this.port, async () => {
        try {
          const actualPort = (this.server!.address() as any)?.port || this.port;

          // Register the service with its actual port
          await portManager.registerService('aidis-mcp', actualPort, '/healthz');
          await portManager.logPortConfiguration('aidis-mcp', actualPort);

          logger.info(`✅ Health endpoints available:`);
          logger.info(`   🏥 Liveness:  http://localhost:${actualPort}/healthz`);
          logger.info(`   🎯 Readiness: http://localhost:${actualPort}/readyz`);

          resolve(actualPort);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Stop the health server
   */
  async stop(): Promise<void> {
    if (this.server) {
      logger.info('🏥 Closing health check server...');
      await new Promise<void>((resolve) => {
        this.server!.close(async () => {
          // Unregister the service from port registry
          await portManager.unregisterService('aidis-mcp');
          logger.info('✅ Health check server closed and unregistered');
          resolve();
        });
      });
      this.server = null;
    }
  }

  /**
   * Express handler wrappers
   */
  private async handleHealthCheckExpress(_req: express.Request, res: express.Response): Promise<void> {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pid: process.pid,
      version: '0.1.0-hardened'
    };
    res.json(healthData);
  }

  private async handleReadinessCheckExpress(_req: express.Request, res: express.Response): Promise<void> {
    const poolHealth = await poolHealthCheck();
    const poolStats = dbPool.getStats();

    const isReady = this.dbHealthy &&
                   this.circuitBreakerState !== 'open' &&
                   poolHealth.healthy;

    const readinessData = {
      status: isReady ? 'ready' : 'not_ready',
      database: this.dbHealthy ? 'connected' : 'disconnected',
      circuit_breaker: this.circuitBreakerState,
      pool: {
        healthy: poolHealth.healthy,
        total_connections: poolStats.totalCount,
        active_connections: poolStats.activeQueries,
        pool_utilization: `${poolStats.poolUtilization.toFixed(1)}%`,
        health_status: poolStats.healthStatus
      },
      timestamp: new Date().toISOString()
    };

    res.status(isReady ? 200 : 503).json(readinessData);
  }

  private async handleLivenessCheckExpress(_req: express.Request, res: express.Response): Promise<void> {
    const livenessData = {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pid: process.pid
    };
    res.json(livenessData);
  }

  private async handleMcpHealthCheckExpress(_req: express.Request, res: express.Response): Promise<void> {
    const mcpHealth = {
      status: 'healthy',
      transport: 'stdio',
      tools_available: AIDIS_TOOL_DEFINITIONS.length,
      timestamp: new Date().toISOString()
    };
    res.json(mcpHealth);
  }

  private async handleDatabaseHealthCheckExpress(_req: express.Request, res: express.Response): Promise<void> {
    const poolStats = dbPool.getStats();
    const dbHealth = {
      status: this.dbHealthy ? 'healthy' : 'unhealthy',
      connected: this.dbHealthy,
      pool: {
        total: poolStats.totalCount,
        active: poolStats.activeQueries,
        idle: poolStats.idleCount,
        utilization: `${poolStats.poolUtilization.toFixed(1)}%`
      },
      timestamp: new Date().toISOString()
    };

    res.status(this.dbHealthy ? 200 : 503).json(dbHealth);
  }

  private async handleEmbeddingsHealthCheckExpress(_req: express.Request, res: express.Response): Promise<void> {
    const embeddingsHealth = {
      status: 'healthy',
      service: 'local-transformers-js',
      model: 'Xenova/all-MiniLM-L6-v2',
      dimensions: 384,
      timestamp: new Date().toISOString()
    };
    res.json(embeddingsHealth);
  }

  private async handleToolSchemasExpress(_req: express.Request, res: express.Response): Promise<void> {
    res.json({
      success: true,
      tools: AIDIS_TOOL_DEFINITIONS,
      count: AIDIS_TOOL_DEFINITIONS.length,
      timestamp: new Date().toISOString(),
      note: 'Complete MCP tool definitions with inputSchema for all AIDIS tools'
    });
  }

  private async handleToolListExpress(_req: express.Request, res: express.Response): Promise<void> {
    res.json({
      success: true,
      tools: AIDIS_TOOL_DEFINITIONS.map(tool => ({
        ...tool,
        endpoint: `/mcp/tools/${tool.name}`
      })),
      count: AIDIS_TOOL_DEFINITIONS.length,
      timestamp: new Date().toISOString()
    });
  }

  private async handleMcpToolExpress(req: express.Request, res: express.Response): Promise<void> {
    if (!this.mcpToolExecutor) {
      res.status(500).json({ error: 'MCP tool executor not configured' });
      return;
    }

    try {
      const toolName = req.params.toolName;
      const rawArgs = req.body.arguments || req.body.args || {};
      const args = this.parameterDeserializer ? this.parameterDeserializer(rawArgs) : rawArgs;

      const result = await this.mcpToolExecutor(toolName, args);
      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
        type: error.constructor.name
      });
    }
  }

  private async handleV2McpExpress(req: express.Request, res: express.Response): Promise<void> {
    const path = req.path.replace('/v2/mcp', '') || '/';

    if (path === '/') {
      res.json({
        version: '2.0.0',
        compatibleVersions: ['2.0.0', '2.1.0'],
        endpoints: {
          tools: '/v2/mcp/tools/:toolName',
          list: '/v2/mcp/tools',
          health: '/v2/mcp/health'
        }
      });
    } else if (path === '/health') {
      res.json({
        status: 'healthy',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        toolsAvailable: AIDIS_TOOL_DEFINITIONS.length
      });
    } else if (path === '/tools' && req.method === 'GET') {
      res.json({
        success: true,
        version: '2.0.0',
        data: {
          tools: AIDIS_TOOL_DEFINITIONS.map(tool => ({
            name: tool.name,
            endpoint: `/v2/mcp/tools/${tool.name}`
          })),
          totalCount: AIDIS_TOOL_DEFINITIONS.length
        }
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'V2 API endpoint not found',
        version: '2.0.0'
      });
    }
  }

  private async handleProjectSetPrimaryExpress(req: express.Request, res: express.Response): Promise<void> {
    try {
      const mockReq = {
        params: { id: req.params.id },
        body: req.body
      } as any;

      let responseData: any = null;
      let statusCode = 200;

      const mockRes = {
        status: (code: number) => {
          statusCode = code;
          return mockRes;
        },
        json: (data: any) => {
          responseData = data;
        }
      } as any;

      await this.projectController.setPrimary(mockReq, mockRes);
      res.status(statusCode).json(responseData);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }
}