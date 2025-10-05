#!/usr/bin/env node

/**
 * AIDIS MCP Server - ENTERPRISE HARDENED
 * 
 * This is the main entry point for our AI Development Intelligence System.
 * It creates an MCP server that AI agents can connect to for:
 * - Persistent context management
 * - Naming consistency enforcement  
 * - Technical decision tracking
 * - Multi-agent coordination
 * 
 * ORACLE ENTERPRISE HARDENING:
 * - Process singleton pattern (no multiple instances)
 * - Health check endpoints (/healthz, /readyz)
 * - Graceful shutdown handling
 * - MCP debug logging
 * - Connection retry with exponential backoff
 * - Circuit breaker pattern
 */

import { processLock } from './utils/processLock.ts';
import { logger, CorrelationIdManager } from './utils/logger.js';
import { RequestLogger } from './middleware/requestLogger.js';
import { ErrorHandler } from './utils/errorHandler.js';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { initializeDatabase, closeDatabase } from './config/database.js';
import { dbPool, poolHealthCheck } from './services/databasePool.js';
import { AIDIS_TOOL_DEFINITIONS } from './config/toolDefinitions.js';
import { contextHandler } from './handlers/context.js';
import { projectHandler } from './handlers/project.js';
import { namingHandler } from './handlers/naming.js';
import { decisionsHandler } from './handlers/decisions.js';
import { tasksHandler } from './handlers/tasks.js';
import { getQueueManager, shutdownQueue } from './services/queueManager.js';
import { smartSearchHandler } from './handlers/smartSearch.js';
import { navigationHandler } from './handlers/navigation.js';
import { validationMiddleware } from './middleware/validation.js';
// Unused: import { AIDISMCPProxy } from './utils/mcpProxy.js';
import { SessionTracker, ensureActiveSession } from './services/sessionTracker.js';
import { SessionManagementHandler } from './handlers/sessionAnalytics.js';
import { startGitTracking, stopGitTracking } from './services/gitTracker.js';
import { startPatternDetection, stopPatternDetection } from './services/patternDetector.js';
import {
  startMetricsCollection,
  stopMetricsCollection,
  // Unused: collectMetricsOnCommit,
  // Unused: collectMetricsOnPatternUpdate
} from './services/metricsCollector.js';
import {
  startMetricsIntegration,
  stopMetricsIntegration
} from './services/metricsIntegration.js';
// TC015: Code Complexity Tracking imports - disabled (using TT009 consolidated tools)
// Unused: import { CodeComplexityHandler } from './handlers/codeComplexity.js';
// Unused: import { handleComplexityAnalyze } from './handlers/complexity/complexityAnalyze.js';
// Unused: import { handleComplexityInsights } from './handlers/complexity/complexityInsights.js';
// Unused: import { handleComplexityManage } from './handlers/complexity/complexityManage.js';
// TT009-2: Phase 2 Metrics Consolidation imports
import { handleMetricsCollect } from './handlers/metrics/metricsCollect.js';
import { handleMetricsAnalyze } from './handlers/metrics/metricsAnalyze.js';
import { handleMetricsControl } from './handlers/metrics/metricsControl.js';
// TT009-3: Phase 3 Pattern Consolidation imports
import { handlePatternAnalyze } from './handlers/patterns/patternAnalyze.js';
import { handlePatternInsights } from './handlers/patterns/patternInsights.js';
import {
  startComplexityTracking,
  stopComplexityTracking
} from './services/complexityTracker.js';
// TC016: Decision Outcome Tracking imports - disabled
// Unused: import { outcomeTrackingHandler } from './handlers/outcomeTracking.js';
// TC014: Deprecated metrics handler imports removed - TT009-2 Complete
import { ensureFeatureFlags } from './utils/featureFlags.js';
import { portManager } from './utils/portManager.js';
// Phase 5 Integration: V2 API Router
// import { V2McpRouter } from './api/v2/mcpRoutes.js'; // Disabled - using direct integration
import { IngressValidator } from './middleware/ingressValidation.js';
import { McpResponseHandler } from './utils/mcpResponseHandler.js';

// Enterprise hardening constants
const PID_FILE = '/home/ridgetop/aidis/run/aidis.pid';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;
// Helper function to get environment variable with AIDIS_ prefix and fallback
function getEnvVar(aidisKey: string, legacyKey: string, defaultValue: string = ''): string {
  return process.env[aidisKey] || process.env[legacyKey] || defaultValue;
}

const SKIP_DATABASE = getEnvVar('AIDIS_SKIP_DATABASE', 'SKIP_DATABASE', 'false') === 'true';
const SKIP_BACKGROUND_SERVICES = getEnvVar('AIDIS_SKIP_BACKGROUND', 'SKIP_BACKGROUND', 'false') === 'true';
const SKIP_STDIO_TRANSPORT = getEnvVar('AIDIS_SKIP_STDIO', 'SKIP_STDIO', 'false') === 'true';

/**
 * Check if SystemD AIDIS service is already running
 */

// Initialize logging system
logger.info('AIDIS MCP Server Starting', {
  component: 'SERVER',
  operation: 'startup',
  metadata: {
    version: '0.1.0-hardened',
    nodeVersion: process.version,
    pid: process.pid,
    mcpDebug: !!(getEnvVar('AIDIS_MCP_DEBUG', 'MCP_DEBUG')),
    logLevel: getEnvVar('AIDIS_LOG_LEVEL', 'LOG_LEVEL', 'info')
  }
});

// Enable MCP debug logging
const mcpDebugValue = getEnvVar('AIDIS_MCP_DEBUG', 'MCP_DEBUG');
if (mcpDebugValue) {
  logger.debug('MCP Debug logging enabled', {
    component: 'MCP',
    metadata: { debugLevel: mcpDebugValue }
  });
}

/**
 * Process Singleton - Prevent multiple AIDIS instances
 */
class ProcessSingleton {
  private pidFile: string;
  
  constructor(pidFile: string = PID_FILE) {
    this.pidFile = pidFile;
  }
  
  ensureSingleInstance(): boolean {
    try {
      // Check if PID file exists
      if (fs.existsSync(this.pidFile)) {
        const existingPid = fs.readFileSync(this.pidFile, 'utf8').trim();
        
        // Check if process is still running
        try {
          process.kill(parseInt(existingPid), 0); // Signal 0 tests if process exists
          console.error(`❌ AIDIS instance already running (PID: ${existingPid})`);
          console.error(`🔧 To force restart: rm ${this.pidFile} && kill ${existingPid}`);
          return false;
        } catch (error) {
          // Process not running, remove stale PID file
          console.log(`🧹 Removing stale PID file (process ${existingPid} not found)`);
          fs.unlinkSync(this.pidFile);
        }
      }
      
      // Create PID file
      const pidDir = path.dirname(this.pidFile);
      if (!fs.existsSync(pidDir)) {
        fs.mkdirSync(pidDir, { recursive: true });
      }
      
      fs.writeFileSync(this.pidFile, process.pid.toString());
      console.log(`🔒 Process singleton active (PID: ${process.pid})`);
      
      // Clean up PID file on exit
      const cleanup = () => {
        try {
          if (fs.existsSync(this.pidFile)) {
            fs.unlinkSync(this.pidFile);
            console.log('🧹 PID file cleaned up');
          }
        } catch (error) {
          console.error('⚠️  Failed to clean up PID file:', error);
        }
      };
      
      process.on('exit', cleanup);
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
      
      return true;
      
    } catch (error) {
      console.error('❌ Failed to ensure singleton:', error);
      return false;
    }
  }
}

/**
 * Circuit Breaker for Database Operations
 */
class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  private failureThreshold: number;
  private recoveryTimeout: number;

  constructor(
    failureThreshold: number = 5,
    recoveryTimeout: number = 30000
  ) {
    this.failureThreshold = failureThreshold;
    this.recoveryTimeout = recoveryTimeout;
  }
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }
  
  getState(): string {
    return this.state;
  }
}

/**
 * Retry Logic with Exponential Backoff
 */
class RetryHandler {
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = MAX_RETRIES,
    baseDelay: number = INITIAL_RETRY_DELAY
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`🔄 Retry ${attempt + 1}/${maxRetries} after ${delay}ms: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }
}

/**
 * AIDIS Server Class - ENTERPRISE HARDENED
 * 
 * This handles all MCP protocol communication and routes requests
 * to our various handlers (context, naming, decisions, etc.)
 */
class AIDISServer {
  private server: Server;
  private healthServer: http.Server | null = null;
  // private v2McpRouter: V2McpRouter; // Disabled - using direct integration
  private circuitBreaker: CircuitBreaker;
  private dbHealthy: boolean = false;

  constructor() {
    this.circuitBreaker = new CircuitBreaker();
    // Phase 5 Integration: Initialize V2 API router
    // this.v2McpRouter = new V2McpRouter(); // Disabled - using direct integration
    
    this.server = new Server(
      {
        name: 'aidis-mcp-server',
        version: '0.1.0-hardened',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
    this.setupHealthServer();
  }

  /**
   * Get current project ID for logging context (synchronous, best-effort)
   * Note: Uses cached value only, doesn't validate against DB
   */
  private getCurrentProjectId(): string | undefined {
    try {
      // Use the synchronous cached version (without DB validation)
      // This is acceptable for logging context as it's non-critical
      const sessionId = this.getCurrentSessionId();
      if (!sessionId) return undefined;
      return projectHandler['sessionStates'].get(sessionId)?.currentProjectId || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * TS006-2: Estimate token usage from text
   * Uses conservative estimation: 1 token ≈ 4 characters
   */
  private estimateTokenUsage(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Setup Health Check Server with MCP Tool Endpoints
   */
  private setupHealthServer(): void {
    this.healthServer = http.createServer(async (req, res) => {
      // CORS headers for cross-origin requests from frontend
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Content-Type', 'application/json');

      // Handle preflight OPTIONS requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.url === '/healthz' || req.url === '/health') {
        // Basic health check - always returns 200 if server is responding
        const startTime = Date.now();
        const healthData = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          pid: process.pid,
          version: '0.1.0-hardened'
        };
        
        res.writeHead(200);
        res.end(JSON.stringify(healthData));
        
        // Log health check
        RequestLogger.logHealthCheck('/healthz', 'healthy', Date.now() - startTime);
        
      } else if (req.url === '/readyz') {
        // Readiness check - validates database connectivity and pool health
        const startTime = Date.now();

        // Check connection pool health (TR008-4)
        const poolHealth = await poolHealthCheck();
        const poolStats = dbPool.getStats();

        const isReady = this.dbHealthy &&
                       this.circuitBreaker.getState() !== 'open' &&
                       poolHealth.healthy;

        const readinessData = {
          status: isReady ? 'ready' : 'not_ready',
          database: this.dbHealthy ? 'connected' : 'disconnected',
          circuit_breaker: this.circuitBreaker.getState(),
          pool: {
            healthy: poolHealth.healthy,
            total_connections: poolStats.totalCount,
            active_connections: poolStats.activeQueries,
            pool_utilization: `${poolStats.poolUtilization.toFixed(1)}%`,
            health_status: poolStats.healthStatus
          },
          timestamp: new Date().toISOString()
        };

        res.writeHead(isReady ? 200 : 503);
        res.end(JSON.stringify(readinessData));

        // Log readiness check
        RequestLogger.logHealthCheck('/readyz', isReady ? 'healthy' : 'unhealthy', Date.now() - startTime);

      } else if (req.url === '/livez') {
        // Liveness check - simple alive check (Kubernetes style)
        const startTime = Date.now();
        const livenessData = {
          status: 'alive',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          pid: process.pid
        };

        res.writeHead(200);
        res.end(JSON.stringify(livenessData));

        // Log liveness check
        RequestLogger.logHealthCheck('/livez', 'healthy', Date.now() - startTime);

      } else if (req.url === '/health/mcp') {
        // MCP service health check
        const startTime = Date.now();
        const mcpHealth = {
          status: this.server ? 'healthy' : 'unhealthy',
          transport: 'stdio',
          tools_available: AIDIS_TOOL_DEFINITIONS.length,
          timestamp: new Date().toISOString(),
          response_time_ms: Date.now() - startTime
        };

        res.writeHead(this.server ? 200 : 503);
        res.end(JSON.stringify(mcpHealth));
        RequestLogger.logHealthCheck('/health/mcp', mcpHealth.status as 'healthy' | 'unhealthy', Date.now() - startTime);

      } else if (req.url === '/health/database') {
        // Database service health check
        const startTime = Date.now();
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
          timestamp: new Date().toISOString(),
          response_time_ms: Date.now() - startTime
        };

        res.writeHead(this.dbHealthy ? 200 : 503);
        res.end(JSON.stringify(dbHealth));
        RequestLogger.logHealthCheck('/health/database', dbHealth.status as 'healthy' | 'unhealthy', Date.now() - startTime);

      } else if (req.url === '/health/embeddings') {
        // Embeddings service health check
        const startTime = Date.now();
        const embeddingsHealth = {
          status: 'healthy',
          service: 'local-transformers-js',
          model: 'Xenova/all-MiniLM-L6-v2',
          dimensions: 384,
          timestamp: new Date().toISOString(),
          response_time_ms: Date.now() - startTime
        };

        res.writeHead(200);
        res.end(JSON.stringify(embeddingsHealth));
        RequestLogger.logHealthCheck('/health/embeddings', embeddingsHealth.status as 'healthy' | 'unhealthy', Date.now() - startTime);

      } else if (req.url === '/mcp/tools/schemas' && req.method === 'GET') {
        // GET /mcp/tools/schemas - Return all tool definitions with full inputSchemas
        try {
          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            tools: AIDIS_TOOL_DEFINITIONS,
            count: AIDIS_TOOL_DEFINITIONS.length,
            timestamp: new Date().toISOString(),
            note: 'Complete MCP tool definitions with inputSchema for all AIDIS tools'
          }));
        } catch (error) {
          const err = error as Error;
          res.writeHead(500);
          res.end(JSON.stringify({
            success: false,
            error: err.message,
            timestamp: new Date().toISOString()
          }));
        }

      } else if (req.url === '/mcp/tools' && req.method === 'GET') {
        // GET /mcp/tools - Return all tool definitions (enhanced with schemas)
        try {
          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            tools: AIDIS_TOOL_DEFINITIONS.map(tool => ({
              ...tool,
              endpoint: `/mcp/tools/${tool.name}`
            })),
            count: AIDIS_TOOL_DEFINITIONS.length,
            timestamp: new Date().toISOString()
          }));
        } catch (error) {
          const err = error as Error;
          res.writeHead(500);
          res.end(JSON.stringify({
            success: false,
            error: err.message,
            timestamp: new Date().toISOString()
          }));
        }

      } else if (req.url?.startsWith('/mcp/tools/') && req.method === 'POST') {
        // MCP Tool HTTP Endpoints for Proxy Forwarding
        await this.handleMcpToolRequest(req, res);

      } else if (req.url?.startsWith('/v2/mcp/')) {
        // Phase 5 Integration: V2 API Routes
        await this.handleV2McpRequest(req, res);

      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });
  }

  /**
   * Handle MCP Tool Requests via HTTP (for proxy forwarding)
   */
  private async handleMcpToolRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Define variables outside try block for error handler access
    let toolName: string | undefined;
    let requestData: any = {};
    
    try {
      // Extract tool name from URL: /mcp/tools/{toolName}
      toolName = req.url?.split('/mcp/tools/')[1];
      if (!toolName) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Tool name required' }));
        return;
      }

      // Parse request body
      let body = '';
      req.on('data', chunk => body += chunk);
      
      await new Promise<void>((resolve) => {
        req.on('end', resolve);
      });

      requestData = body ? JSON.parse(body) : {};
      const rawArgs = requestData.arguments || requestData.args || {};

      // Fix array parameter deserialization for Claude Code compatibility
      const args = this.deserializeParameters(rawArgs);

      // Execute the tool using the same logic as MCP handler
      const result = await this.executeMcpTool(toolName, args);

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        result
      }));

    } catch (error: any) {
      // Enhanced error handling with logging
      let responseError = error instanceof Error ? error : new Error(String(error));
      try {
        ErrorHandler.handleMcpError(responseError, toolName || 'unknown', requestData.arguments, {
          component: 'HTTP_ADAPTER',
          operation: 'mcp_tool_request',
          correlationId: CorrelationIdManager.get(),
          additionalContext: {
            httpRequest: true,
            url: req.url,
            method: req.method
          }
        });
      } catch (loggedError) {
        // ErrorHandler re-throws; reuse the logged error for HTTP response but prevent propagation
        responseError = loggedError as Error;
      }

      res.writeHead(500);
      res.end(JSON.stringify({
        success: false,
        error: responseError.message,
        type: responseError.constructor.name,
        correlationId: CorrelationIdManager.get()
      }));
    }
  }

  /**
   * Handle V2 MCP API Requests (Phase 5 Integration)
   */
  private async handleV2McpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      // Create a simplified Express-like request/response adapter
      const expressReq = {
        method: req.method,
        path: req.url?.replace('/v2/mcp', '') || '/',
        url: req.url,
        params: {},
        body: {},
        headers: req.headers
      } as any;

      const expressRes = {
        json: (data: any) => {
          res.setHeader('Content-Type', 'application/json');
          res.writeHead(200);
          res.end(JSON.stringify(data));
        },
        status: (code: number) => ({
          json: (data: any) => {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(code);
            res.end(JSON.stringify(data));
          }
        })
      } as any;

      // Parse request body for POST requests
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        await new Promise<void>((resolve) => {
          req.on('end', resolve);
        });
        expressReq.body = body ? JSON.parse(body) : {};
      }

      // Extract tool name from URL for tool endpoints
      if (req.url?.match(/\/v2\/mcp\/tools\/([^\/]+)/)) {
        const match = req.url.match(/\/v2\/mcp\/tools\/([^\/]+)/);
        expressReq.params.tool = match![1];
      }

      // Route to V2 router - simulate Express middleware
      await this.simulateV2Routing(expressReq, expressRes);

    } catch (error: any) {
      logger.error('V2 MCP API error', {
        error: error.message,
        url: req.url,
        method: req.method
      });

      res.setHeader('Content-Type', 'application/json');
      res.writeHead(500);
      res.end(JSON.stringify({
        success: false,
        error: 'Internal server error',
        version: '2.0.0'
      }));
    }
  }

  /**
   * Simulate V2 Router functionality without Express
   */
  private async simulateV2Routing(req: any, res: any): Promise<void> {
    const path = req.path;

    if (path === '/') {
      // API info endpoint
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
      // Health endpoint
      res.json({
        status: 'healthy',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        toolsAvailable: 47
      });
    } else if (path === '/tools' && req.method === 'GET') {
      // List tools endpoint
      res.json({
        success: true,
        version: '2.0.0',
        data: {
          tools: [
            { name: 'context_store', endpoint: '/v2/mcp/tools/context_store' },
            { name: 'project_list', endpoint: '/v2/mcp/tools/project_list' },
            // Add more tools as needed
          ],
          totalCount: 47
        }
      });
    } else if (path.startsWith('/tools/') && req.method === 'POST') {
      // Tool execution endpoint
      const tool = req.params.tool;
      const requestId = `v2-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Date.now();

      try {
        // Enhanced validation using IngressValidator
        const validationContext = IngressValidator.createValidationContext(
          tool,
          requestId,
          'http'
        );

        const validationResult = await IngressValidator.validateIngressRequest(
          tool,
          req.body.arguments || {},
          validationContext,
          {
            enableSanitization: true,
            enableAuditLogging: true,
            maxRequestSize: 1024 * 1024
          }
        );

        if (!validationResult.success) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: validationResult.errors,
            version: '2.0.0',
            requestId
          });
        }

        // Execute tool using enhanced response handler
        const toolResult = await this.executeToolOperation(tool, validationResult.data || {});

        // Process response through response handler
        const responseResult = await McpResponseHandler.processResponse(
          JSON.stringify(toolResult),
          { toolName: tool, requestId }
        );

        if (!responseResult.success) {
          return res.status(500).json({
            success: false,
            error: 'Tool execution failed',
            details: responseResult.error,
            version: '2.0.0',
            requestId,
            processingTime: Date.now() - startTime
          });
        }

        res.json({
          success: true,
          data: responseResult.data,
          version: '2.0.0',
          requestId,
          processingTime: Date.now() - startTime,
          warnings: validationResult.warnings?.length ? validationResult.warnings : undefined
        });

      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          version: '2.0.0',
          requestId,
          processingTime: Date.now() - startTime
        });
      }
    } else {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        version: '2.0.0',
        path: req.path
      });
    }
  }

  /**
   * Execute MCP Tool (shared logic for both MCP and HTTP)
   */
  private async executeMcpTool(toolName: string, args: any): Promise<any> {
    // Generate correlation ID for request tracing
    const correlationId = CorrelationIdManager.generate();
    const sessionId = this.getCurrentSessionId();

    // TS006-2: Estimate input tokens
    const inputTokens = this.estimateTokenUsage(JSON.stringify(args || {}));

    const result = await RequestLogger.wrapOperation(
      toolName,
      args,
      async () => {
        // ORACLE HARDENING: Input validation middleware
        const validation = validationMiddleware(toolName, args || {});
        if (!validation.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Input validation failed: ${validation.error}`
          );
        }

        const validatedArgs = validation.data;

        return this.executeToolOperation(toolName, validatedArgs);
      },
      {
        correlationId,
        sessionId: sessionId || 'unknown-session',
        projectId: this.getCurrentProjectId() || undefined
      }
    );

    // TS006-2: Estimate output tokens and record usage
    try {
      const outputTokens = this.estimateTokenUsage(JSON.stringify(result));

      if (sessionId) {
        SessionTracker.recordTokenUsage(sessionId || 'unknown-session', inputTokens, outputTokens);
      }
    } catch (error) {
      // Don't fail the request if token tracking fails
      console.error('Failed to record token usage:', error);
    }

    return result;
  }

  /**
   * Execute the actual tool operation
   */
  private async executeToolOperation(toolName: string, validatedArgs: any): Promise<any> {
    
    switch (toolName) {
      case 'aidis_ping':
        return await this.handlePing(validatedArgs as { message?: string });
        
      case 'aidis_status':
        return await this.handleStatus();
        
      case 'aidis_help':
        return await this.handleHelp();

      case 'aidis_explain':
        return await this.handleExplain(validatedArgs as any);

      case 'aidis_examples':
        return await this.handleExamples(validatedArgs as any);

      case 'context_store':
        return await this.handleContextStore(validatedArgs as any);
        
      case 'context_search':
        return await this.handleContextSearch(validatedArgs as any);
        
      case 'context_get_recent':
        return await this.handleContextGetRecent(validatedArgs as any);
        
      case 'context_stats':
        return await this.handleContextStats(validatedArgs as any);

      case 'project_list':
        return await this.handleProjectList(validatedArgs as any);
        
      case 'project_create':
        return await this.handleProjectCreate(validatedArgs as any);
        
      case 'project_switch':
        return await this.handleProjectSwitch(validatedArgs as any);
        
      case 'project_current':
        return await this.handleProjectCurrent(validatedArgs as any);
        
      case 'project_info':
        return await this.handleProjectInfo(validatedArgs as any);

      case 'naming_register':
        return await this.handleNamingRegister(validatedArgs as any);
        
      case 'naming_check':
        return await this.handleNamingCheck(validatedArgs as any);
        
      case 'naming_suggest':
        return await this.handleNamingSuggest(validatedArgs as any);
        
      case 'naming_stats':
        return await this.handleNamingStats(validatedArgs as any);

      case 'decision_record':
        return await this.handleDecisionRecord(validatedArgs as any);
        
      case 'decision_search':
        return await this.handleDecisionSearch(validatedArgs as any);
        
      case 'decision_update':
        return await this.handleDecisionUpdate(validatedArgs as any);
        
      case 'decision_stats':
        return await this.handleDecisionStats(validatedArgs as any);
        
      case 'task_create':
        return await this.handleTaskCreate(validatedArgs as any);
        
      case 'task_list':
        return await this.handleTaskList(validatedArgs as any);
        
      case 'task_update':
        return await this.handleTaskUpdate(validatedArgs as any);
        
      case 'task_details':
        return await this.handleTaskDetails(validatedArgs as any);

      case 'task_bulk_update':
        return await this.handleTaskBulkUpdate(validatedArgs as any);

      case 'task_progress_summary':
        return await this.handleTaskProgressSummary(validatedArgs as any);

      // Code Analysis Tools - DISABLED (Token Optimization 2025-10-01)
      // Reason: Need to go through logic later, not currently used
      // case 'code_analyze':
      //   return await this.handleCodeAnalyze(validatedArgs as any);
      // case 'code_components':
      //   return await this.handleCodeComponents(validatedArgs as any);
      // case 'code_dependencies':
      //   return await this.handleCodeDependencies(validatedArgs as any);
      // case 'code_impact':
      //   return await this.handleCodeImpact(validatedArgs as any);
      // case 'code_stats':
      //   return await this.handleCodeStats(validatedArgs as any);
        
      case 'smart_search':
        return await this.handleSmartSearch(validatedArgs as any);
        
      case 'get_recommendations':
        return await this.handleRecommendations(validatedArgs as any);
        
      case 'project_insights':
        return await this.handleProjectInsights(validatedArgs as any);

      // Session Management Tools
      case 'session_assign':
        return await this.handleSessionAssign(validatedArgs as any);
        
      case 'session_status':
        return await this.handleSessionStatus();
        
      case 'session_new':
        return await this.handleSessionNew(validatedArgs as any);
        
      case 'session_update':
        return await this.handleSessionUpdate(validatedArgs as any);
        
      case 'session_details':
        return await this.handleSessionDetails(validatedArgs as any);

      // Git Correlation Tools - DISABLED (Token Optimization 2025-10-01)
      // Reason: More than likely coming out, not currently needed
      // case 'git_session_commits':
      //   return await this.handleGitSessionCommits(validatedArgs as any);
      // case 'git_commit_sessions':
      //   return await this.handleGitCommitSessions(validatedArgs as any);
      // case 'git_correlate_session':
      //   return await this.handleGitCorrelateSession(validatedArgs as any);

      // TC013/TC017: Deprecated pattern tools removed - TT009-3 Complete
      // Old individual pattern tools consolidated into:
      //   - pattern_analyze (detection/analysis/tracking operations)
      //   - pattern_insights (insights/correlations/recommendations/alerts)

      // TT009-2: Phase 2 Metrics Consolidation Tools
      case 'metrics_collect':
        return await handleMetricsCollect(validatedArgs);
      case 'metrics_analyze':
        return await handleMetricsAnalyze(validatedArgs);
      case 'metrics_control':
        return await handleMetricsControl(validatedArgs);

      // TT009-3: Phase 3 Pattern Consolidation Tools
      case 'pattern_analyze':
        return await handlePatternAnalyze(validatedArgs);
      case 'pattern_insights':
        return await handlePatternInsights(validatedArgs);

      // TC014: Deprecated metrics tools removed - TT009-2 Complete
      // Old individual metrics tools consolidated into:
      //   - metrics_collect (collection operations)
      //   - metrics_analyze (analysis/dashboard/trends)
      //   - metrics_control (alerts/performance/export)

      // TC015: Code Complexity Tracking tools - DISABLED (Token Optimization 2025-10-01)
      // Reason: Confirmed disable for token optimization
      // case 'complexity_analyze':
      //   return await handleComplexityAnalyze(validatedArgs);
      // case 'complexity_insights':
      //   return await handleComplexityInsights(validatedArgs);
      // case 'complexity_manage':
      //   return await handleComplexityManage(validatedArgs);
      // TC015: Deprecated complexity tools removed - TT009-1 Tool Consolidation Phase 1 Complete
      // 16 tools consolidated into complexity_analyze, complexity_insights, complexity_manage
        
      // TC016: Decision Outcome Tracking tools - REMOVED in TT009-4 (Academic features)
      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${toolName}. Available tools: ${AIDIS_TOOL_DEFINITIONS.map(t => t.name).join(', ')}`
        );
    }
  }

  /**
   * Set up all MCP request handlers
   */
  private setupHandlers(): void {
    // Handle tool listing requests - shows what tools are available
    // Filter out disabled tools (Token Optimization 2025-10-01)
    const DISABLED_TOOLS = [
      'code_analyze', 'code_components', 'code_dependencies', 'code_impact', 'code_stats',
      'git_session_commits', 'git_commit_sessions', 'git_correlate_session',
      'complexity_analyze', 'complexity_insights', 'complexity_manage'
    ];

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: AIDIS_TOOL_DEFINITIONS.filter(tool => !DISABLED_TOOLS.includes(tool.name))
      };
    });

    // Handle tool execution requests - actually runs the tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: rawArgs } = request.params;

      try {
        // Fix array parameter deserialization for Claude Code compatibility
        const args = this.deserializeParameters(rawArgs || {});

        // Use shared tool execution logic
        return await this.executeMcpTool(name, args);
      } catch (error) {
        console.error(`Error executing tool ${name}:`, error);
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to execute tool: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });

    // Handle resource listing (we'll use this later for documentation, configs, etc.)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'aidis://status',
            mimeType: 'application/json',
            name: 'AIDIS Server Status',
            description: 'Current server status and configuration',
          },
        ],
      };
    });

    // Handle resource reading
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      if (uri === 'aidis://status') {
        const status = await this.getServerStatus();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(status, null, 2),
            },
          ],
        };
      }
      
      throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
    });
  }

  /**
   * Deserialize parameters that may have been JSON-stringified by MCP transport layer
   * This fixes the array parameter handling issue where Claude Code serializes arrays as strings
   */
  private deserializeParameters(args: any): any {
    if (!args || typeof args !== 'object') {
      return args;
    }

    const result = { ...args };

    // Known array parameters that might be serialized as strings
    const arrayParams = ['tags', 'aliases', 'contextTags', 'dependencies', 'capabilities', 
                         'alternativesConsidered', 'affectedComponents', 'contextRefs', 
                         'taskRefs', 'paths'];
    
    // Known number parameters that might come as strings from the MCP transport
    const numberParams = ['limit', 'maxDepth', 'relevanceScore', 'confidenceScore', 
                          'priority', 'estimatedHours', 'actualHours', 'hours_back',
                          'confidenceThreshold', 'minConfidence'];

    for (const param of arrayParams) {
      if (result[param] && typeof result[param] === 'string') {
        try {
          // Try to parse as JSON array
          const parsed = JSON.parse(result[param]);
          if (Array.isArray(parsed)) {
            result[param] = parsed;
            // Minimal logging for production
            console.error(`✅ Deserialized ${param} array parameter (${parsed.length} items)`);
          }
        } catch (error) {
          // If parsing fails, leave as string - might be intentional
          // Silently continue - this is expected for non-array string parameters
        }
      }
    }
    
    // Handle number parameters
    for (const param of numberParams) {
      if (result[param] !== undefined && typeof result[param] === 'string') {
        const numValue = Number(result[param]);
        if (!isNaN(numValue)) {
          result[param] = numValue;
          console.error(`✅ Converted ${param} to number: ${numValue}`);
        }
      }
    }

    return result;
  }

  /**
   * Handle ping tool - simple connectivity test
   */
  private async handlePing(args: { message?: string }) {
    const message = args.message || 'Hello AIDIS!';
    const timestamp = new Date().toISOString();
    
    console.log(`🏓 Ping received: "${message}" at ${timestamp}`);
    
    return {
      content: [
        {
          type: 'text',
          text: `🏓 AIDIS Pong! Message: "${message}" | Time: ${timestamp} | Status: Operational`,
        },
      ],
    };
  }

  /**
   * Handle status tool - detailed server information
   */
  private async handleStatus() {
    const status = await this.getServerStatus();
    
    const flagSummaryEntries = Object.entries(status.featureFlags || {});
    const flagSummary = flagSummaryEntries.length
      ? flagSummaryEntries
          .map(([name, enabled]) => `${name}=${enabled ? 'ON' : 'off'}`)
          .join(', ')
      : 'none';

    return {
      content: [
        {
          type: 'text',
          text: `🎯 AIDIS Server Status Report\n\n` +
                `Version: ${status.version}\n` +
                `Uptime: ${status.uptime}s\n` +
                `Database: ${status.database.connected ? '✅ Connected' : '❌ Disconnected'}\n` +
                `Memory Usage: ${(status.memory.used / 1024 / 1024).toFixed(2)} MB\n` +
                `Environment: ${status.environment}\n` +
                `Feature Flags: ${flagSummary}\n` +
                `Started: ${status.startTime}`,
        },
      ],
    };
  }

  /**
   * Handle help tool - display categorized list of all AIDIS tools
   */
  private async handleHelp() {
    console.log('🔧 AIDIS help request received');
    return await navigationHandler.getHelp();
  }

  private async handleExplain(args: { toolName: string }) {
    console.log('🔧 AIDIS explain request received for tool:', args.toolName);
    return await navigationHandler.explainTool(args);
  }

  private async handleExamples(args: { toolName: string }) {
    console.log('🔧 AIDIS examples request received for tool:', args.toolName);
    return await navigationHandler.getExamples(args);
  }

  /**
   * Handle context storage requests
   */
  private async handleContextStore(args: any) {
    console.log('📝 Context store request received');
    
    const result = await contextHandler.storeContext({
      content: args.content,
      type: args.type,
      tags: args.tags,
      relevanceScore: args.relevanceScore,
      metadata: args.metadata,
      projectId: args.projectId,
      sessionId: args.sessionId
    });

    return {
      content: [
        {
          type: 'text',
          text: `✅ Context stored successfully!\n\n` +
                `📝 ID: ${result.id}\n` +
                `🏷️  Type: ${result.contextType}\n` +
                `📊 Relevance: ${result.relevanceScore}/10\n` +
                `🏷️  Tags: [${result.tags.join(', ')}]\n` +
                `⏰ Stored: ${result.createdAt.toISOString()}\n` +
                `🔍 Content: "${result.content.length > 100 ? result.content.substring(0, 100) + '...' : result.content}"\n\n` +
                `🎯 Context is now searchable via semantic similarity!`
        },
      ],
    };
  }

  /**
   * Handle context search requests
   */
  private async handleContextSearch(args: any) {
    console.log(`🔍 Context search request: "${args.query}"`);
    
    const results = await contextHandler.searchContext({
      query: args.query,
      type: args.type,
      tags: args.tags,
      limit: args.limit,
      minSimilarity: args.minSimilarity,
      projectId: args.projectId
    });

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `🔍 No contexts found matching: "${args.query}"\n\n` +
                  `Try:\n` +
                  `• Broader search terms\n` +
                  `• Different context types\n` +
                  `• Lower similarity threshold\n` +
                  `• Different tags`
          },
        ],
      };
    }

    const searchSummary = `🔍 Found ${results.length} matching contexts for: "${args.query}"\n\n`;
    
    const resultDetails = results.map((result, index) => {
      return `${index + 1}. **${result.contextType.toUpperCase()}** (${result.similarity}% match)\n` +
             `   📝 "${result.content}"\n` +
             `   🏷️  Tags: [${result.tags.join(', ')}]\n` +
             `   ⏰ ${result.createdAt.toISOString()}\n` +
             `   💡 ${result.searchReason}\n`;
    }).join('\n');

    return {
      content: [
        {
          type: 'text',
          text: searchSummary + resultDetails
        },
      ],
    };
  }

  /**
   * Format time difference in human readable format
   */
  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  /**
   * Handle context get recent requests
   */
  private async handleContextGetRecent(args: any) {
    console.log(`📋 Context get recent request (limit: ${args.limit || 5})`);
    
    const results = await contextHandler.getRecentContext(args.projectId, args.limit);

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `📋 No recent contexts found\n\n` +
                  `This usually means:\n` +
                  `• No contexts have been stored yet\n` +
                  `• Wrong project selected\n` +
                  `• Database connectivity issues`
          },
        ],
      };
    }

    // Format results for display
    const contextList = results.map((ctx, index) => {
      const timeAgo = this.getTimeAgo(ctx.createdAt);

      return `${index + 1}. **${ctx.contextType}** (${timeAgo})\n` +
             `   Content: ${ctx.content}\n` +
             `   Tags: [${ctx.tags.join(', ')}]\n` +
             `   ID: ${ctx.id}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `📋 Recent Contexts (${results.length} found)\n\n${contextList}`
        },
      ],
    };
  }

  /**
   * Handle context statistics requests
   */
  private async handleContextStats(args: any) {
    console.log('📊 Context stats request received');
    
    const stats = await contextHandler.getContextStats(args.projectId);

    const typeBreakdown = Object.entries(stats.contextsByType)
      .map(([type, count]) => `   ${type}: ${count}`)
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `📊 Context Statistics\n\n` +
                `📈 Total Contexts: ${stats.totalContexts}\n` +
                `🔮 With Embeddings: ${stats.embeddedContexts}\n` +
                `🕐 Recent (24h): ${stats.recentContexts}\n\n` +
                `📋 By Type:\n${typeBreakdown || '   (no contexts yet)'}\n\n` +
                `🎯 All contexts are searchable via semantic similarity!`
        },
      ],
    };
  }

  /**
   * Handle project listing requests
   */
  private async handleProjectList(args: any) {
    console.log('📋 Project list request received');
    
    await projectHandler.initializeSession(); // Ensure session is initialized
    const projects = await projectHandler.listProjects(args.includeStats !== false);

    if (projects.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `📋 No projects found\n\n` +
                  `Create your first project with: project_create`
          },
        ],
      };
    }

    const projectList = projects.map((project, index) => {
      const isActive = project.isActive ? ' 🟢 (CURRENT)' : '';
      const contextInfo = project.contextCount !== undefined ? ` (${project.contextCount} contexts)` : '';
      
      return `${index + 1}. **${project.name}**${isActive}\n` +
             `   📝 ${project.description || 'No description'}\n` +
             `   📊 Status: ${project.status}${contextInfo}\n` +
             `   ⏰ Updated: ${project.updatedAt.toISOString().split('T')[0]}\n` +
             `   🆔 ID: ${project.id}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `📋 Available Projects (${projects.length})\n\n` +
                projectList + '\n\n' +
                `💡 Switch projects with: project_switch <name-or-id>\n` +
                `🆕 Create new project with: project_create`
        },
      ],
    };
  }

  /**
   * Handle project creation requests
   */
  private async handleProjectCreate(args: any) {
    console.log(`🆕 Project create request: "${args.name}"`);
    
    const project = await projectHandler.createProject({
      name: args.name,
      description: args.description,
      gitRepoUrl: args.gitRepoUrl,
      rootDirectory: args.rootDirectory,
      metadata: args.metadata
    });

    return {
      content: [
        {
          type: 'text',
          text: `✅ Project created successfully!\n\n` +
                `📝 Name: ${project.name}\n` +
                `📄 Description: ${project.description || 'None'}\n` +
                `📊 Status: ${project.status}\n` +
                `⏰ Created: ${project.createdAt.toISOString()}\n` +
                `🆔 ID: ${project.id}\n\n` +
                `💡 Switch to this project with: project_switch ${project.name}`
        },
      ],
    };
  }

  /**
   * Handle project switching requests with TS012 validation framework
   */
  private async handleProjectSwitch(args: any) {
    console.log(`🔄 [TS012] Project switch request: "${args.project}"`);
    
    try {
      // Get current session ID (in future this could come from session tracking)
      const sessionId = this.getCurrentSessionId();

      // Use enhanced validation switching
      const project = await projectHandler.switchProjectWithValidation(args.project, sessionId || 'default-session');

      // Log successful switch for metrics and monitoring
      const switchMetrics = {
        sessionId,
        targetProject: args.project,
        switchSuccessful: true,
        timestamp: new Date(),
        validationPassed: true
      };

      console.log(`✅ [TS012] Project switch metrics:`, switchMetrics);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Switched to project: **${project.name}** 🟢\n\n` +
                  `📄 Description: ${project.description || 'No description'}\n` +
                  `📊 Status: ${project.status}\n` +
                  `📈 Contexts: ${project.contextCount || 0}\n` +
                  `⏰ Last Updated: ${project.updatedAt.toISOString().split('T')[0]}\n\n` +
                  `🎯 All context operations will now use this project by default\n` +
                  `🛡️  Switch completed with TS012 validation framework`
          },
        ],
      };

    } catch (error) {
      console.error(`❌ [TS012] Project switch failed:`, error);
      
      // Log failed switch for metrics and monitoring
      const errorMetrics = {
        sessionId: this.getCurrentSessionId(),
        targetProject: args.project,
        switchSuccessful: false,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };

      console.log(`❌ [TS012] Project switch error metrics:`, errorMetrics);

      // Try to provide helpful error message based on error type
      let userFriendlyMessage = `Failed to switch to project "${args.project}"`;
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('not found')) {
        userFriendlyMessage += `\n\n💡 **Troubleshooting:**\n` +
          `• Check if the project name is spelled correctly\n` +
          `• Use \`project_list\` to see available projects\n` +
          `• Create the project first with \`project_create\``;
      } else if (errorMessage.includes('Pre-switch validation failed')) {
        userFriendlyMessage += `\n\n💡 **Validation Issues:**\n` +
          `• Session state may be inconsistent\n` +
          `• Try again in a few moments\n` +
          `• Contact support if problem persists`;
      } else if (errorMessage.includes('Atomic switch failed')) {
        userFriendlyMessage += `\n\n💡 **Switch Process Issues:**\n` +
          `• The switch was safely rolled back\n` +
          `• Your previous project setting is preserved\n` +
          `• Try again or contact support`;
      }

      return {
        content: [
          {
            type: 'text',
            text: `❌ ${userFriendlyMessage}\n\n` +
                  `**Error Details:** ${errorMessage}\n\n` +
                  `🛡️  Protected by TS012 validation framework`
          },
        ],
      };
    }
  }

  /**
   * Get current session ID (placeholder for future session tracking enhancement)
   */
  private getCurrentSessionId(): string {
    // In future versions, this would come from proper session tracking
    // For now, use a default session ID that integrates with existing ProjectHandler
    return 'default-session';
  }

  /**
   * Handle current project requests
   */
  private async handleProjectCurrent(_args: any) {
    console.log('🔍 Current project request received');
    
    const project = await projectHandler.getCurrentProject();
    
    if (!project) {
      await projectHandler.initializeSession();
      const initializedProject = await projectHandler.getCurrentProject();
      
      if (!initializedProject) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ No current project set and no projects available\n\n` +
                    `Create your first project with: project_create <name>`
            },
          ],
        };
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `🟢 Current Project: **${initializedProject.name}** (auto-selected)\n\n` +
                  `📄 Description: ${initializedProject.description || 'No description'}\n` +
                  `📊 Status: ${initializedProject.status}\n` +
                  `📈 Contexts: ${initializedProject.contextCount || 0}\n` +
                  `⏰ Last Updated: ${initializedProject.updatedAt.toISOString().split('T')[0]}`
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `🟢 Current Project: **${project.name}**\n\n` +
                `📄 Description: ${project.description || 'No description'}\n` +
                `📊 Status: ${project.status}\n` +
                `📈 Contexts: ${project.contextCount || 0}\n` +
                `⏰ Last Updated: ${project.updatedAt.toISOString().split('T')[0]}\n\n` +
                `🔄 Switch projects with: project_switch <name-or-id>`
        },
      ],
    };
  }

  /**
   * Handle project info requests
   */
  private async handleProjectInfo(args: any) {
    console.log(`🔍 Project info request: "${args.project}"`);
    
    const project = await projectHandler.getProject(args.project);
    
    if (!project) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Project "${args.project}" not found\n\n` +
                  `💡 List all projects with: project_list`
          },
        ],
      };
    }

    const metadataInfo = Object.keys(project.metadata).length > 0 
      ? `\n📋 Metadata:\n${Object.entries(project.metadata).map(([k, v]) => `   ${k}: ${v}`).join('\n')}`
      : '';

    return {
      content: [
        {
          type: 'text',
          text: `📋 Project Information: **${project.name}**${project.isActive ? ' 🟢 (CURRENT)' : ''}\n\n` +
                `📄 Description: ${project.description || 'No description'}\n` +
                `📊 Status: ${project.status}\n` +
                `📈 Contexts: ${project.contextCount || 0}\n` +
                `🔗 Git Repo: ${project.gitRepoUrl || 'None'}\n` +
                `📁 Root Directory: ${project.rootDirectory || 'None'}\n` +
                `⏰ Created: ${project.createdAt.toISOString().split('T')[0]}\n` +
                `⏰ Updated: ${project.updatedAt.toISOString().split('T')[0]}\n` +
                `🆔 ID: ${project.id}${metadataInfo}\n\n` +
                `${project.isActive ? '🎯 This is your current active project' : '🔄 Switch to this project with: project_switch ' + project.name}`
        },
      ],
    };
  }

  /**
   * Handle naming register requests
   */
  private async handleNamingRegister(args: any) {
    console.log('📝 Naming register request received');
    
    const entry = await namingHandler.registerName({
      entityType: args.entityType,
      canonicalName: args.canonicalName,
      description: args.description,
      aliases: args.aliases,
      contextTags: args.contextTags,
      projectId: args.projectId
    });

    return {
      content: [
        {
          type: 'text',
          text: `✅ Name registered successfully!\n\n` +
                `🏷️  Entity: ${entry.entityType}\n` +
                `📝 Name: ${entry.canonicalName}\n` +
                `📄 Description: ${entry.description || 'None'}\n` +
                `🏷️  Tags: [${entry.contextTags.join(', ')}]\n` +
                `🔤 Aliases: [${entry.aliases.join(', ')}]\n` +
                `📊 Usage Count: ${entry.usageCount}\n` +
                `🆔 ID: ${entry.id}\n\n` +
                `🎯 Name is now protected from conflicts!`
        },
      ],
    };
  }

  /**
   * Handle naming check requests
   */
  private async handleNamingCheck(args: any) {
    console.log(`🔍 Naming check request: ${args.entityType} "${args.proposedName}"`);
    
    const conflicts = await namingHandler.checkNameConflicts({
      entityType: args.entityType,
      proposedName: args.proposedName,
      contextTags: args.contextTags,
      projectId: args.projectId
    });

    if (conflicts.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `✅ Name "${args.proposedName}" is available!\n\n` +
                  `🎯 No conflicts found for ${args.entityType}\n` +
                  `💡 You can safely use this name or register it to claim it.`
          },
        ],
      };
    }

    const errors = conflicts.filter(c => c.severity === 'error');
    const warnings = conflicts.filter(c => c.severity === 'warning');

    let response = `🔍 Name check results for "${args.proposedName}":\n\n`;

    if (errors.length > 0) {
      response += `❌ CONFLICTS FOUND (${errors.length}):\n`;
      errors.forEach((error, i) => {
        response += `   ${i + 1}. ${error.conflictReason}\n`;
        if (error.suggestion) {
          response += `      💡 Suggestion: ${error.suggestion}\n`;
        }
      });
      response += '\n';
    }

    if (warnings.length > 0) {
      response += `⚠️  WARNINGS (${warnings.length}):\n`;
      warnings.forEach((warning, i) => {
        response += `   ${i + 1}. ${warning.conflictReason}\n`;
        if (warning.suggestion) {
          response += `      💡 Suggestion: ${warning.suggestion}\n`;
        }
      });
    }

    if (errors.length === 0) {
      response += `\n✅ Name can be used (warnings noted above)`;
    } else {
      response += `\n❌ Choose a different name to avoid conflicts`;
    }

    return {
      content: [
        {
          type: 'text',
          text: response
        },
      ],
    };
  }

  /**
   * Handle naming suggest requests
   */
  private async handleNamingSuggest(args: any) {
    console.log(`💡 Naming suggest request: ${args.entityType}`);
    
    const suggestions = await namingHandler.suggestNames({
      entityType: args.entityType,
      description: args.description,
      contextTags: args.contextTags,
      projectId: args.projectId
    });

    if (suggestions.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `💭 No name suggestions available\n\n` +
                  `Try providing more context or check existing naming patterns in your project.`
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `💡 Name suggestions for ${args.entityType}:\n` +
                `📝 Based on: "${args.description}"\n\n` +
                suggestions.map((suggestion, i) =>
                  `${i + 1}. **${suggestion.suggestedName}** (${Math.round(suggestion.confidence * 100)}% confidence)\n` +
                  `   📋 ${suggestion.explanation}\n` +
                  (suggestion.similarExamples.length > 0 ?
                    `   📚 Similar: ${suggestion.similarExamples.join(', ')}\n` : '')
                ).join('\n') + '\n' +
                `🎯 All suggestions are conflict-free and follow project patterns!`
        },
      ],
    };
  }

  /**
   * Handle naming stats requests
   */
  private async handleNamingStats(args: any) {
    console.log('📊 Naming stats request received');
    
    const stats = await namingHandler.getNamingStats(args.projectId);

    const typeBreakdown = Object.entries(stats.namesByType)
      .map(([type, count]) => `   ${type}: ${count}`)
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `📊 Naming Registry Statistics\n\n` +
                `📈 Total Names: ${stats.totalNames}\n` +
                `🔧 Convention Compliance: ${stats.conventionCompliance}%\n` +
                `⚠️  Deprecated: ${stats.deprecatedCount}\n` +
                `🕐 Recent Activity: ${stats.recentActivity}\n\n` +
                `📋 By Type:\n${typeBreakdown || '   (no names yet)'}\n\n` +
                `🎯 Higher compliance scores indicate better naming consistency!`
        },
      ],
    };
  }

  /**
   * Handle decision record requests
   */
  private async handleDecisionRecord(args: any) {
    console.log(`📝 Decision record request: ${args.decisionType}`);
    
    const decision = await decisionsHandler.recordDecision({
      decisionType: args.decisionType,
      title: args.title,
      description: args.description,
      rationale: args.rationale,
      impactLevel: args.impactLevel,
      alternativesConsidered: args.alternativesConsidered,
      problemStatement: args.problemStatement,
      affectedComponents: args.affectedComponents,
      tags: args.tags,
      projectId: args.projectId
    });

    const alternativesText = decision.alternativesConsidered.length > 0
      ? `\n📋 Alternatives Considered:\n` + 
        decision.alternativesConsidered.map(alt => 
          `   • ${alt.name}: ${alt.reasonRejected}`
        ).join('\n')
      : '';

    return {
      content: [
        {
          type: 'text',
          text: `✅ Technical decision recorded!\n\n` +
                `🎯 Type: ${decision.decisionType}\n` +
                `📝 Title: ${decision.title}\n` +
                `⚡ Impact: ${decision.impactLevel}\n` +
                `📅 Date: ${decision.decisionDate.toISOString().split('T')[0]}\n` +
                `🏷️  Components: [${decision.affectedComponents.join(', ')}]\n` +
                `🏷️  Tags: [${decision.tags.join(', ')}]\n` +
                `🆔 ID: ${decision.id}${alternativesText}\n\n` +
                `💡 Decision is now searchable and tracked for outcomes!`
        },
      ],
    };
  }

  /**
   * Handle decision search requests
   */
  private async handleDecisionSearch(args: any) {
    console.log(`🔍 Decision search request`);
    
    const decisions = await decisionsHandler.searchDecisions({
      query: args.query,
      decisionType: args.decisionType,
      impactLevel: args.impactLevel,
      component: args.component,
      tags: args.tags,
      limit: args.limit,
      projectId: args.projectId
    });

    if (decisions.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `🔍 No decisions found matching your criteria\n\n` +
                  `Try:\n` +
                  `• Broader search terms\n` +
                  `• Different decision types or impact levels\n` +
                  `• Removing some filters`
          },
        ],
      };
    }

    const searchSummary = `🔍 Found ${decisions.length} technical decisions:\n\n`;
    
    const resultDetails = decisions.map((decision, index) => {
      const alternatives = decision.alternativesConsidered.length > 0 
        ? ` (${decision.alternativesConsidered.length} alternatives considered)`
        : '';
      
      return `${index + 1}. **${decision.decisionType.toUpperCase()}** - ${decision.impactLevel} impact\n` +
             `   📝 ${decision.title}\n` +
             `   💡 ${decision.rationale.substring(0, 100)}${decision.rationale.length > 100 ? '...' : ''}\n` +
             `   📅 ${decision.decisionDate.toISOString().split('T')[0]} | Status: ${decision.status}${alternatives}\n` +
             `   🏷️  [${decision.tags.join(', ')}]`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: searchSummary + resultDetails
        },
      ],
    };
  }

  /**
   * Handle decision update requests
   */
  private async handleDecisionUpdate(args: any) {
    console.log(`📝 Decision update request: ${args.decisionId.substring(0, 8)}...`);
    
    const decision = await decisionsHandler.updateDecision({
      decisionId: args.decisionId,
      outcomeStatus: args.outcomeStatus,
      outcomeNotes: args.outcomeNotes,
      lessonsLearned: args.lessonsLearned
    });

    return {
      content: [
        {
          type: 'text',
          text: `✅ Decision updated successfully!\n\n` +
                `📝 Title: ${decision.title}\n` +
                `📊 Status: ${decision.status}\n` +
                `🎯 Outcome: ${decision.outcomeStatus}\n` +
                `📄 Notes: ${decision.outcomeNotes || 'None'}\n` +
                `🧠 Lessons Learned: ${decision.lessonsLearned || 'None'}\n\n` +
                `💡 Decision outcomes help improve future choices!`
        },
      ],
    };
  }

  /**
   * Handle decision stats requests
   */
  private async handleDecisionStats(args: any) {
    console.log('📊 Decision stats request received');
    
    const stats = await decisionsHandler.getDecisionStats(args.projectId);

    const typeBreakdown = Object.entries(stats.decisionsByType)
      .map(([type, count]) => `   ${type}: ${count}`)
      .join('\n');

    const statusBreakdown = Object.entries(stats.decisionsByStatus)
      .map(([status, count]) => `   ${status}: ${count}`)
      .join('\n');

    const impactBreakdown = Object.entries(stats.decisionsByImpact)
      .map(([impact, count]) => `   ${impact}: ${count}`)
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `📊 Technical Decision Statistics\n\n` +
                `📈 Total Decisions: ${stats.totalDecisions}\n` +
                `✅ Success Rate: ${stats.outcomeSuccess}%\n` +
                `🕐 Recent Activity: ${stats.recentActivity}\n\n` +
                `📋 By Type:\n${typeBreakdown || '   (no decisions yet)'}\n\n` +
                `📊 By Status:\n${statusBreakdown || '   (no decisions yet)'}\n\n` +
                `⚡ By Impact:\n${impactBreakdown || '   (no decisions yet)'}\n\n` +
                `🎯 Track decision outcomes to improve future choices!`
        },
      ],
    };
  }

  /**
   * Get comprehensive server status information
   */
  private async getServerStatus() {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const featureFlagStore = await ensureFeatureFlags();
    const featureFlags = featureFlagStore.getAllFlags();
    
    // Test database connectivity
    let databaseConnected = false;
    try {
      const { db } = await import('./config/database.js');
      const result = await db.query('SELECT 1 as test');
      databaseConnected = result.rows.length > 0;
    } catch (error) {
      console.warn('Database connectivity test failed:', error);
    }

    return {
      version: '0.1.0',
      uptime,
      startTime: new Date(Date.now() - uptime * 1000).toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        connected: databaseConnected,
        host: getEnvVar('AIDIS_DATABASE_HOST', 'DATABASE_HOST', 'localhost'),
        port: getEnvVar('AIDIS_DATABASE_PORT', 'DATABASE_PORT', '5432'),
        database: getEnvVar('AIDIS_DATABASE_NAME', 'DATABASE_NAME', 'aidis_development'),
      },
      memory: {
        used: memoryUsage.rss,
        heap: memoryUsage.heapUsed,
        external: memoryUsage.external,
      },
      featureFlags,
    };
  }

  /**
   * Handle agent registration requests
   */

  /**
   * Handle agent list requests
   */

  /**
   * Handle agent status update requests
   */

  /**
   * Handle task creation requests
   */
  private async handleTaskCreate(args: any) {
    // Ensure session is initialized before getting project ID
    await projectHandler.initializeSession('default-session');
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    
    const task = await tasksHandler.createTask(
      projectId,
      args.title,
      args.description,
      args.type,
      args.priority,
      args.assignedTo,
      args.createdBy,
      args.tags,
      args.dependencies,
      args.metadata
    );

    const assignedText = task.assignedTo ? `\n🤖 Assigned To: ${task.assignedTo}` : '';
    const tagsText = task.tags.length > 0 ? `\n🏷️  Tags: [${task.tags.join(', ')}]` : '';
    const depsText = task.dependencies.length > 0 ? `\n⚡ Dependencies: [${task.dependencies.join(', ')}]` : '';

    return {
      content: [
        {
          type: 'text',
          text: `✅ Task created successfully!\n\n` +
                `📋 Title: ${task.title}\n` +
                `🎯 Type: ${task.type}\n` +
                `📊 Priority: ${task.priority}\n` +
                `📈 Status: ${task.status}${assignedText}${tagsText}${depsText}\n` +
                `⏰ Created: ${task.createdAt.toISOString().split('T')[0]}\n` +
                `🆔 ID: ${task.id}\n\n` +
                `🤝 Task is now available for agent coordination!`
        },
      ],
    };
  }

  /**
   * Handle task list requests
   */
  private async handleTaskList(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    const tasks = await tasksHandler.listTasks(
      projectId,
      args.assignedTo,
      args.status,
      args.type,
      args.tags,
      args.priority,
      args.phase,
      args.statuses
    );

    if (tasks.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `📋 No tasks found for this project\n\n` +
                  `💡 Create tasks with: task_create`
          },
        ],
      };
    }

    const taskList = tasks.map((task, index) => {
      const statusIcon = {
        todo: '⏰',
        in_progress: '🔄',
        blocked: '🚫',
        completed: '✅',
        cancelled: '❌'
      }[task.status] || '❓';

      const priorityIcon = {
        low: '🔵',
        medium: '🟡',
        high: '🔴',
        urgent: '🚨'
      }[task.priority] || '⚪';

      const assignedText = task.assignedTo ? ` (assigned to ${task.assignedTo})` : ' (unassigned)';
      const tagsText = task.tags.length > 0 ? `\n      🏷️  Tags: [${task.tags.join(', ')}]` : '';

      return `   ${index + 1}. **${task.title}** ${statusIcon} ${priorityIcon}\n` +
             `      📝 Type: ${task.type}${assignedText}\n` +
             `      📊 Status: ${task.status} | Priority: ${task.priority}${tagsText}\n` +
             `      ⏰ Created: ${task.createdAt.toISOString().split('T')[0]}\n` +
             `      🆔 ID: ${task.id}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `📋 Project Tasks (${tasks.length})\n\n${taskList}\n\n` +
                `💡 Get full details: task_details(taskId="...")\n` +
                `🔄 Update tasks with: task_update\n` +
                `🤖 Assign to agents with: task_update`
        },
      ],
    };
  }

  /**
   * Handle task update requests
   */
  private async handleTaskUpdate(args: any) {
    await tasksHandler.updateTaskStatus(args.taskId, args.status, args.assignedTo, args.metadata);

    const taskStatusIconMap = {
      todo: '⏰',
      in_progress: '🔄',
      blocked: '🚫',
      completed: '✅',
      cancelled: '❌'
    } as const;
    const statusIcon = taskStatusIconMap[args.status as keyof typeof taskStatusIconMap] || '❓';

    const assignedText = args.assignedTo ? `\n🤖 Assigned To: ${args.assignedTo}` : '';

    return {
      content: [
        {
          type: 'text',
          text: `✅ Task updated successfully!\n\n` +
                `📋 Task: ${args.taskId}\n` +
                `📊 New Status: ${args.status} ${statusIcon}${assignedText}\n` +
                `⏰ Updated: ${new Date().toISOString().split('T')[0]}\n\n` +
                `🤝 Changes visible to all coordinating agents!`
        },
      ],
    };
  }

  /**
   * Handle bulk task update requests
   */
  private async handleTaskBulkUpdate(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');

    try {
      const result = await tasksHandler.bulkUpdateTasks(args.task_ids, {
        status: args.status,
        assignedTo: args.assignedTo,
        priority: args.priority,
        metadata: args.metadata,
        notes: args.notes,
        projectId: projectId
      });

      const taskBulkIconMap = {
        todo: '⏰',
        in_progress: '🔄',
        blocked: '🚫',
        completed: '✅',
        cancelled: '❌'
      } as const;
      const statusIcon = args.status ? (taskBulkIconMap[args.status as keyof typeof taskBulkIconMap] || '❓') : '';

      const updates = [];
      if (args.status) updates.push(`Status: ${args.status} ${statusIcon}`);
      if (args.assignedTo) updates.push(`Assigned To: ${args.assignedTo}`);
      if (args.priority) updates.push(`Priority: ${args.priority}`);
      if (args.notes) updates.push(`Notes: ${args.notes}`);
      if (args.metadata) updates.push(`Metadata: Updated`);

      const updatesText = updates.length > 0 ? `\n📊 Applied Updates:\n   ${updates.join('\n   ')}\n` : '';

      return {
        content: [
          {
            type: 'text',
            text: `✅ Bulk update completed successfully!\n\n` +
                  `📊 **Results Summary:**\n` +
                  `   • Total Requested: ${result.totalRequested}\n` +
                  `   • Successfully Updated: ${result.successfullyUpdated}\n` +
                  `   • Failed: ${result.failed}\n\n` +
                  `🆔 **Updated Task IDs:**\n   ${result.updatedTaskIds.slice(0, 10).join('\n   ')}` +
                  (result.updatedTaskIds.length > 10 ? `\n   ... and ${result.updatedTaskIds.length - 10} more` : '') +
                  updatesText +
                  `\n⏰ Updated: ${new Date().toISOString().split('T')[0]}\n\n` +
                  `🤝 Changes visible to all coordinating agents!\n\n` +
                  `💡 Use task_list to see updated tasks`
          },
        ],
      };

    } catch (error) {
      const err = error as Error;
      return {
        content: [
          {
            type: 'text',
            text: `❌ Bulk update failed!\n\n` +
                  `🚨 **Error:** ${err.message}\n\n` +
                  `📊 **Request Details:**\n` +
                  `   • Task Count: ${args.task_ids?.length || 0}\n` +
                  `   • Task IDs: ${args.task_ids?.slice(0, 5).join(', ')}${args.task_ids?.length > 5 ? '...' : ''}\n` +
                  `   • Project: ${projectId}\n\n` +
                  `💡 Verify task IDs exist and belong to the project using task_list`
          },
        ],
      };
    }
  }

  /**
   * Handle task progress summary requests
   */
  private async handleTaskProgressSummary(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    const groupBy = args.groupBy || 'phase';

    try {
      const summary = await tasksHandler.getTaskProgressSummary(projectId, groupBy);

      // Format the response for human readability
      const overallStatus = `${summary.overallProgress.completed}/${summary.overallProgress.total} (${summary.overallProgress.percentage}%)`;

      let responseText = `📊 **Task Progress Summary**\n\n`;
      responseText += `**Overall Progress**: ${overallStatus} tasks completed\n`;
      responseText += `**Total Tasks**: ${summary.totalTasks}\n\n`;

      if (summary.groupedProgress.length > 0) {
        responseText += `**Progress by ${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}**:\n\n`;

        summary.groupedProgress.forEach(group => {
          const progressIcon = group.completionPercentage === 100 ? '✅' :
                               group.completionPercentage >= 75 ? '🟢' :
                               group.completionPercentage >= 50 ? '🟡' :
                               group.completionPercentage >= 25 ? '🟠' : '🔴';

          const groupName = group.group === 'ungrouped' ? 'No Group' : group.group;
          responseText += `${progressIcon} **${groupName}**: ${group.completedTasks}/${group.totalTasks} (${group.completionPercentage}%)\n`;

          if (group.inProgressTasks > 0) {
            responseText += `   🔄 In Progress: ${group.inProgressTasks}\n`;
          }
          if (group.pendingTasks > 0) {
            responseText += `   ⏰ Pending: ${group.pendingTasks}\n`;
          }
          if (group.blockedTasks > 0) {
            responseText += `   🚫 Blocked: ${group.blockedTasks}\n`;
          }
          responseText += '\n';
        });
      } else {
        responseText += `No tasks found with valid ${groupBy} grouping.\n`;
      }

      responseText += `\n💡 **Usage**: \`task_progress_summary(groupBy="phase|status|priority|type|assignedTo")\``;

      return {
        content: [{
          type: "text",
          text: responseText
        }]
      };

    } catch (error) {
      const err = error as Error;
      return {
        content: [{
          type: "text",
          text: `❌ Progress summary failed!\n\n` +
                `🚨 **Error:** ${err.message}\n\n` +
                `💡 Try: task_progress_summary(groupBy="phase")`
        }]
      };
    }
  }

  /**
   * Handle task details requests
   */
  private async handleTaskDetails(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    
    // Get single task with full details
    const tasks = await tasksHandler.listTasks(projectId);
    const task = tasks.find(t => t.id === args.taskId);
    
    if (!task) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Task not found\n\n` +
                  `🆔 Task ID: ${args.taskId}\n` +
                  `📋 Project: ${projectId}\n\n` +
                  `💡 Use task_list to see available tasks`
          }
        ]
      };
    }

    const statusIcon = {
      todo: '⏰',
      in_progress: '🔄',
      blocked: '🚫',
      completed: '✅',
      cancelled: '❌'
    }[task.status] || '❓';

    const priorityIcon = {
      low: '🔵',
      medium: '🟡',
      high: '🔴',
      urgent: '🚨'
    }[task.priority] || '⚪';

    const assignedText = task.assignedTo ? `\n👤 Assigned: ${task.assignedTo}` : '\n👤 Assigned: (unassigned)';
    const createdByText = task.createdBy ? `\n🛠️  Created By: ${task.createdBy}` : '';
    const tagsText = task.tags.length > 0 ? `\n🏷️  Tags: [${task.tags.join(', ')}]` : '';
    const dependenciesText = task.dependencies.length > 0 ? `\n🔗 Dependencies: [${task.dependencies.join(', ')}]` : '';
    const descriptionText = task.description ? `\n\n📝 **Description:**\n${task.description}` : '\n\n📝 **Description:** (no description provided)';
    const startedText = task.startedAt ? `\n🚀 Started: ${task.startedAt.toISOString()}` : '';
    const completedText = task.completedAt ? `\n✅ Completed: ${task.completedAt.toISOString()}` : '';
    const metadataText = Object.keys(task.metadata).length > 0 ? `\n📊 Metadata: ${JSON.stringify(task.metadata, null, 2)}` : '';

    return {
      content: [
        {
          type: 'text',
          text: `📋 **Task Details** ${statusIcon} ${priorityIcon}\n\n` +
                `🆔 **ID:** ${task.id}\n` +
                `📌 **Title:** ${task.title}\n` +
                `🔖 **Type:** ${task.type}\n` +
                `📊 **Status:** ${task.status}\n` +
                `⚡ **Priority:** ${task.priority}${assignedText}${createdByText}${tagsText}${dependenciesText}${descriptionText}\n\n` +
                `⏰ **Created:** ${task.createdAt.toISOString()}\n` +
                `🔄 **Updated:** ${task.updatedAt.toISOString()}${startedText}${completedText}${metadataText}\n\n` +
                `💡 Update with: task_update(taskId="${task.id}", status="...", assignedTo="...")`
        }
      ]
    };
  }

  /**
   * Handle agent message requests
   */

  /**
   * Handle agent messages retrieval requests
   */

  /**
   * Handle agent join project requests
   */

  /**
   * Handle agent leave project requests
   */

  /**
   * Handle agent sessions list requests
   */

  /**
   * Handle code analysis requests
   */

  /**
   * Handle code components list requests
   */

  /**
   * Handle code dependencies requests
   */

  /**
   * Handle code impact analysis requests  
   */

  /**
   * Handle code statistics requests
   */

  /**
   * Handle smart search requests
   */
  private async handleSmartSearch(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    const results = await smartSearchHandler.smartSearch(
      projectId,
      args.query,
      args.includeTypes,
      args.limit
    );

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `🔍 No results found for: "${args.query}"\n\n` +
                  `💡 Try broader search terms or different data sources`
          },
        ],
      };
    }

    const resultsList = results.map((result, index) => {
      const typeIcon = {
        context: '📝',
        component: '📦',
        decision: '🎯',
        naming: '🏷️',
        task: '📋',
        agent: '🤖'
      }[result.type] || '📄';

      const relevanceBar = '▓'.repeat(Math.round(result.relevanceScore * 5));
      const sourceText = result.source ? ` (${result.source})` : '';
      
      return `   ${index + 1}. **${result.title}** ${typeIcon}\n` +
             `      💬 ${result.summary.substring(0, 80)}${result.summary.length > 80 ? '...' : ''}\n` +
             `      📊 Relevance: ${relevanceBar} (${Math.round(result.relevanceScore * 100)}%)${sourceText}\n` +
             `      🆔 ID: ${result.id}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `🔍 Smart Search Results (${results.length})\n\n${resultsList}\n\n` +
                `🎯 Searched: [${args.includeTypes?.join(', ') || 'context, component, decision, naming'}]\n` +
                `💡 Refine with different includeTypes or broader query`
        },
      ],
    };
  }

  /**
   * Handle recommendations requests
   */
  private async handleRecommendations(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    const recommendations = await smartSearchHandler.getRecommendations(
      projectId,
      args.context,
      args.type
    );

    if (recommendations.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `💡 No specific recommendations for: "${args.context}"\n\n` +
                  `🎯 Try different context or recommendation type`
          },
        ],
      };
    }

    const recList = recommendations.map((rec, index) => {
      const typeIcon = {
        naming: '🏷️',
        pattern: '🔧',
        decision: '🎯',
        refactor: '♻️',
        task: '📋'
      }[rec.type] || '💡';

      const confidenceBar = '▓'.repeat(Math.round(rec.confidence * 5));
      const actionableIcon = rec.actionable ? '✅' : 'ℹ️';
      const refsText = rec.references.length > 0 ? `\n      🔗 References: ${rec.references.length} items` : '';
      
      return `   ${index + 1}. **${rec.title}** ${typeIcon} ${actionableIcon}\n` +
             `      💬 ${rec.description}\n` +
             `      📊 Confidence: ${confidenceBar} (${Math.round(rec.confidence * 100)}%)${refsText}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `💡 AI Recommendations (${recommendations.length})\n\n${recList}\n\n` +
                `✅ = Actionable | ℹ️ = Informational\n` +
                `🎯 Type: ${args.type} recommendations`
        },
      ],
    };
  }

  /**
   * Handle project insights requests
   */
  private async handleProjectInsights(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    const insights = await smartSearchHandler.getProjectInsights(projectId);

    const healthLevelMap = {
      healthy: '🟢 HEALTHY',
      moderate: '🟡 MODERATE',
      needs_attention: '🔴 NEEDS ATTENTION',
      no_data: '⚪ NO DATA'
    } as const;
    const healthLevel = healthLevelMap[insights.insights.codeHealth.level as keyof typeof healthLevelMap] || '❓ UNKNOWN';

    const efficiencyLevelMap = {
      efficient: '🟢 EFFICIENT',
      moderate: '🟡 MODERATE',
      needs_improvement: '🔴 NEEDS IMPROVEMENT',
      no_data: '⚪ NO DATA'
    } as const;
    const efficiencyLevel = efficiencyLevelMap[insights.insights.teamEfficiency.level as keyof typeof efficiencyLevelMap] || '❓ UNKNOWN';

    const gapsText = insights.insights.knowledgeGaps.length > 0
      ? `\n📋 Knowledge Gaps:\n` + insights.insights.knowledgeGaps.map((gap: string) => `   • ${gap}`).join('\n')
      : '';

    const issuesText = insights.insights.codeHealth.issues.length > 0
      ? `\n⚠️  Code Issues:\n` + insights.insights.codeHealth.issues.map((issue: string) => `   • ${issue}`).join('\n')
      : '';

    return {
      content: [
        {
          type: 'text',
          text: `🔍 Project Health Insights\n\n` +
                `📊 Code Health: ${healthLevel} (${insights.insights.codeHealth.score}/100)\n` +
                `🤝 Team Efficiency: ${efficiencyLevel} (${Math.round((insights.insights.teamEfficiency.completionRate || 0) * 100)}%)\n` +
                `📦 Components: ${insights.codeStats.totalComponents}\n` +
                `📝 Contexts: ${Object.values(insights.contextStats).reduce((a: any, b: any) => a + (b.count || 0), 0)}\n` +
                `🎯 Decisions: ${insights.decisionStats.total}\n` +
                `📋 Tasks: ${insights.taskStats.total}${gapsText}${issuesText}\n\n` +
                `💡 Get specific recommendations with: get_recommendations`
        },
      ],
    };
  }

  /**
   * Start the MCP server with Enterprise Hardening
   */
  async start(): Promise<void> {
    RequestLogger.logSystemEvent('server_startup_initiated', {
      version: '0.1.0-hardened',
      processId: process.pid,
      nodeVersion: process.version
    });

    // ORACLE FIX #1: Enforce process singleton (CRITICAL)
    try {
      processLock.acquire();
      logger.info('Process singleton acquired successfully', {
        component: 'STARTUP',
        operation: 'singleton_lock'
      });
    } catch (error) {
      logger.error('Cannot start: Another AIDIS instance is already running', error as Error, {
        component: 'STARTUP',
        operation: 'singleton_lock_failed'
      });
      process.exit(1);
    }
    
    try {
      // ORACLE FIX #2: Initialize database with retry and circuit breaker
      logger.info('Initializing database connection with retry logic', {
        component: 'STARTUP',
        operation: 'database_init'
      });
      
      if (!SKIP_DATABASE) {
        await RetryHandler.executeWithRetry(async () => {
          await this.circuitBreaker.execute(async () => {
            const startTime = Date.now();
            // Initialize legacy database connection
            await initializeDatabase();

            // Initialize optimized connection pool (TR008-4)
            await dbPool.initialize();
            this.dbHealthy = true;
            
            logger.info('Database connection established successfully', {
              component: 'STARTUP',
              operation: 'database_connected',
              duration: Date.now() - startTime,
              metadata: {
                circuitBreakerState: this.circuitBreaker.getState()
              }
            });
          });
        });
        
        // Initialize session tracking for this AIDIS instance
        console.log('📋 Ensuring session exists for this AIDIS instance...');
        try {
          const currentProject = await projectHandler.getCurrentProject();
          // Use ensureActiveSession to reuse existing active session or create new one
          const sessionId = await ensureActiveSession(currentProject?.id);
          console.log(`✅ Session tracking initialized: ${sessionId.substring(0, 8)}...`);
        } catch (error) {
          console.warn('⚠️  Failed to initialize session tracking:', error);
          console.warn('   Contexts will be stored without session association');
        }
      } else {
        console.log('🧪 Skipping database initialization (AIDIS_SKIP_DATABASE=true)');
        this.dbHealthy = true;
      }

      if (!SKIP_BACKGROUND_SERVICES) {
        // Initialize BullMQ queue system (replaces timer-based polling)
        console.log('🚀 Starting BullMQ queue system...');
        try {
          await getQueueManager();
          console.log('✅ Queue system initialized successfully');
        } catch (error) {
          console.warn('⚠️  Failed to initialize queue system:', error);
          console.warn('   Background services will be disabled');
        }

        // Initialize real-time git tracking (file watching only)
        console.log('⚡ Starting real-time git tracking...');
        try {
          await startGitTracking({
            enableFileWatching: true,
            enablePeriodicPolling: false, // Disabled: polling moved to queue
            pollingIntervalMs: 30000, // Still used by queue system
            correlationDelayMs: 5000   // 5 seconds delay after detection
          });
          console.log('✅ Git tracking initialized successfully');
        } catch (error) {
          console.warn('⚠️  Failed to initialize git tracking:', error);
          console.warn('   Git correlation will be manual only');
        }

        // Initialize pattern detection service
        console.log('🔍 Starting pattern detection service...');
        try {
          await startPatternDetection({
            enableRealTimeDetection: true,
            enableBatchProcessing: true,
            detectionTimeoutMs: 100, // Sub-100ms target
            patternUpdateIntervalMs: 5000 // 5 seconds
          });
          console.log('✅ Pattern detection service initialized successfully');
        } catch (error) {
          console.warn('⚠️  Failed to initialize pattern detection:', error);
          console.warn('   Pattern detection will be manual only');
        }

        // Initialize development metrics collection service
        console.log('📊 Starting development metrics collection service...');
        try {
          await startMetricsCollection({
            enableRealTimeCollection: true,
            enableBatchProcessing: true,
            collectionTimeoutMs: 100, // Sub-100ms target
            autoCollectOnCommit: true,
            autoCollectOnPatternUpdate: true,
            autoCollectOnSessionEnd: true,
            scheduledCollectionIntervalMs: 300000 // 5 minutes
          });
          console.log('✅ Metrics collection service initialized successfully');
        } catch (error) {
          console.warn('⚠️  Failed to initialize metrics collection:', error);
          console.warn('   Metrics collection will be manual only');
        }

        // Initialize metrics integration service for real-time triggers
        console.log('🔗 Starting metrics integration service...');
        try {
          await startMetricsIntegration({
            enableGitTriggers: true,
            enablePatternTriggers: true,
            enableSessionTriggers: true,
            enableAlertNotifications: true,
            gitTriggerDelayMs: 5000,
            patternTriggerDelayMs: 3000,
            maxConcurrentCollections: 3
          });
          console.log('✅ Metrics integration service initialized successfully');
        } catch (error) {
          console.warn('⚠️  Failed to initialize metrics integration:', error);
          console.warn('   Real-time metrics triggers will be disabled');
        }

        // TS004-1: Initialize session timeout service (2-hour inactivity timeout)
        console.log('⏱️  Starting session timeout service...');
        try {
          const { SessionTimeoutService } = await import('./services/sessionTimeout.js');
          SessionTimeoutService.start();
          console.log('✅ Session timeout service initialized successfully');
        } catch (error) {
          console.warn('⚠️  Failed to initialize session timeout service:', error);
          console.warn('   Session timeouts will not be automatic');
        }

        // TC015: Initialize code complexity tracking service
        console.log('🧮 Starting complexity tracking service...');
        try {
          await startComplexityTracking({
            enableRealTimeAnalysis: true,
            enableBatchProcessing: true,
            analysisTimeoutMs: 100, // Sub-100ms target
            autoAnalyzeOnCommit: true,
            autoAnalyzeOnThresholdBreach: true,
            scheduledAnalysisIntervalMs: 600000 // 10 minutes
          });
          console.log('✅ Complexity tracking service initialized successfully');
        } catch (error) {
          console.warn('⚠️  Failed to initialize complexity tracking:', error);
          console.warn('   Complexity tracking will be manual only');
        }
      } else {
        console.log('🧪 Skipping background services (AIDIS_SKIP_BACKGROUND=true)');
      }
      
      // ORACLE FIX #3: Start health check server with dynamic port assignment
      const assignedPort = await portManager.assignPort('aidis-mcp');
      console.log(`🏥 Starting health check server...`);

      this.healthServer?.listen(assignedPort, async () => {
        const actualPort = (this.healthServer!.address() as any)?.port || assignedPort;

        // Register the service with its actual port
        await portManager.registerService('aidis-mcp', actualPort, '/healthz');
        await portManager.logPortConfiguration('aidis-mcp', actualPort);

        console.log(`✅ Health endpoints available:`);
        console.log(`   🏥 Liveness:  http://localhost:${actualPort}/healthz`);
        console.log(`   🎯 Readiness: http://localhost:${actualPort}/readyz`);
      });
      
      // ORACLE FIX #4: Create transport with MCP debug logging
      if (!SKIP_STDIO_TRANSPORT) {
        console.log('🔗 Creating MCP transport with debug logging...');
        const transport = new StdioServerTransport();
        
        // Enhanced connection logging
        console.log('🤝 Connecting to MCP transport...');
        await this.server.connect(transport);
        
        console.log('✅ AIDIS MCP Server is running and ready for connections!');
      } else {
        console.log('🧪 Skipping MCP stdio transport (AIDIS_SKIP_STDIO=true)');
      }
      console.log('🔒 Enterprise Security Features:');
      console.log(`   🔒 Process Singleton: ACTIVE (PID: ${process.pid})`);

      // Get the actual assigned port for logging
      const actualPort = (this.healthServer?.address() as any)?.port;
      if (actualPort) {
        console.log(`   🏥 Health Endpoints: http://localhost:${actualPort}/healthz,readyz`);
      } else {
        console.log(`   🏥 Health Endpoints: Starting up...`);
      }

      console.log(`   🔄 Retry Logic: ${MAX_RETRIES} attempts with exponential backoff`);
      console.log(`   ⚡ Circuit Breaker: ${this.circuitBreaker.getState().toUpperCase()}`);
      console.log(`   🐛 MCP Debug: ${getEnvVar('AIDIS_MCP_DEBUG', 'MCP_DEBUG', 'DISABLED')}`);
      
      console.log('🎯 Available tools:');
      console.log('   📊 System: aidis_ping, aidis_status');
      console.log('   📝 Context: context_store, context_search, context_get_recent, context_stats');
      console.log('   📋 Projects: project_list, project_create, project_switch, project_current, project_info');
      console.log('   🏷️  Naming: naming_register, naming_check, naming_suggest, naming_stats');
      console.log('   📋 Decisions: decision_record, decision_search, decision_update, decision_stats');
      console.log('   🤖 Agents: agent_register, agent_list, agent_status, agent_join, agent_leave, agent_sessions');
      console.log('   📋 Tasks: task_create, task_list, task_update, task_bulk_update, task_details, task_progress_summary, agent_message, agent_messages');
      console.log('   📦 Code Analysis: code_analyze, code_components, code_dependencies, code_impact, code_stats');
      console.log('   🧠 Smart Search: smart_search, get_recommendations, project_insights');
      console.log('   📊 Development Metrics: metrics_collect_project, metrics_get_dashboard, metrics_get_alerts, metrics_get_trends');
      console.log('   📊 Metrics Aggregation: metrics_aggregate_projects, metrics_aggregate_timeline, metrics_calculate_correlations, metrics_get_executive_summary, metrics_export_data');
      
      console.log('🚀 System Status:');
      console.log('🧠 AI Context Management: ONLINE');
      console.log('🔍 Semantic Search: READY');
      console.log('📋 Multi-Project Support: READY');
      console.log('🏷️  Naming Registry: READY');
      console.log('📋 Decision Tracking: READY');
      console.log('🤖 Multi-Agent Coordination: READY');
      console.log('📦 Code Analysis: READY');
      console.log('🧠 Smart Search & AI Recommendations: READY');
      console.log('📊 Development Metrics Collection: READY');
      console.log('📊 Metrics Aggregation & Correlation: READY');
      
    } catch (error) {
      // Enhanced error handling for startup failures
      ErrorHandler.handleError(error as Error, {
        component: 'STARTUP',
        operation: 'server_startup_failed',
        systemState: {
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime()
        }
      }, 'startup');
      
      this.dbHealthy = false;
      
      // Clean up on startup failure
      await this.gracefulShutdown('STARTUP_FAILURE');
      process.exit(1);
    }
  }
  /**
   * Enhanced Graceful Shutdown
   */
  async gracefulShutdown(signal: string): Promise<void> {
    RequestLogger.logSystemEvent('graceful_shutdown_initiated', {
      signal,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    });
    
    try {
      if (!SKIP_DATABASE) {
        // End current session if active
        console.log('📋 Ending active session...');
        try {
          const activeSessionId = await SessionTracker.getActiveSession();
          if (activeSessionId) {
            await SessionTracker.endSession(activeSessionId);
            console.log('✅ Session ended gracefully');
          } else {
            console.log('ℹ️  No active session to end');
          }
        } catch (error) {
          console.warn('⚠️  Failed to end session:', error);
        }
      } else {
        console.log('🧪 Skipping session shutdown (AIDIS_SKIP_DATABASE=true)');
      }

      if (!SKIP_BACKGROUND_SERVICES) {
        // Stop queue system first (it manages background jobs)
        console.log('🚀 Stopping queue system...');
        try {
          await shutdownQueue();
          console.log('✅ Queue system stopped gracefully');
        } catch (error) {
          console.warn('⚠️  Failed to stop queue system:', error);
        }

        // Stop git tracking
        console.log('⚡ Stopping git tracking...');
        try {
          await stopGitTracking();
          console.log('✅ Git tracking stopped gracefully');
        } catch (error) {
          console.warn('⚠️  Failed to stop git tracking:', error);
        }

        // Stop pattern detection service
        console.log('🔍 Stopping pattern detection service...');
        try {
          await stopPatternDetection();
          console.log('✅ Pattern detection service stopped gracefully');
        } catch (error) {
          console.warn('⚠️  Failed to stop pattern detection:', error);
        }

        // Stop metrics collection service
        console.log('📊 Stopping metrics collection service...');
        try {
          await stopMetricsCollection();
          console.log('✅ Metrics collection service stopped gracefully');
        } catch (error) {
          console.warn('⚠️  Failed to stop metrics collection:', error);
        }

        // Stop metrics integration service
        console.log('🔗 Stopping metrics integration service...');
        try {
          await stopMetricsIntegration();
          console.log('✅ Metrics integration service stopped gracefully');
        } catch (error) {
          console.warn('⚠️  Failed to stop metrics integration:', error);
        }

        // TS004-1: Stop session timeout service
        console.log('⏱️  Stopping session timeout service...');
        try {
          const { SessionTimeoutService } = await import('./services/sessionTimeout.js');
          SessionTimeoutService.stop();
          console.log('✅ Session timeout service stopped gracefully');
        } catch (error) {
          console.warn('⚠️  Failed to stop session timeout service:', error);
        }

        // TC015: Stop complexity tracking service
        console.log('🧮 Stopping complexity tracking service...');
        try {
          await stopComplexityTracking();
          console.log('✅ Complexity tracking service stopped gracefully');
        } catch (error) {
          console.warn('⚠️  Failed to stop complexity tracking:', error);
        }
      } else {
        console.log('🧪 Background services disabled; skipping shutdown hooks');
      }
      
      // Close health check server and unregister from port registry
      if (this.healthServer) {
        console.log('🏥 Closing health check server...');
        await new Promise<void>((resolve) => {
          this.healthServer!.close(async () => {
            // Unregister the service from port registry
            await portManager.unregisterService('aidis-mcp');
            console.log('✅ Health check server closed and unregistered');
            resolve();
          });
        });
      }
      
      if (!SKIP_DATABASE) {
        // Close database connections
        console.log('🔌 Closing database connections...');
        await closeDatabase();
        console.log('✅ Database connections closed');
        
        // Mark as unhealthy
        this.dbHealthy = false;
      } else {
        console.log('🧪 Skipping database close (AIDIS_SKIP_DATABASE=true)');
      }
      
      RequestLogger.logSystemEvent('graceful_shutdown_completed', {
        signal,
        shutdownDuration: process.uptime(),
        finalMemoryUsage: process.memoryUsage()
      });
      
    } catch (error) {
      logger.error('Error during graceful shutdown', error as Error, {
        component: 'SHUTDOWN',
        operation: 'shutdown_error',
        metadata: { signal }
      });
      throw error;
    }
  }

  // Session Management Handler Methods
  
  /**
   * Handle session assignment to project
   */
  private async handleSessionAssign(args: any) {
    console.log(`🔗 Session assign request: project="${args.projectName}"`);
    
    const result = await SessionManagementHandler.assignSessionToProject(args.projectName);
    
    return {
      content: [
        {
          type: 'text',
          text: result.message + (result.success ? `\n\n📝 Session ID: ${result.sessionId?.substring(0, 8)}...\n🏷️  Project: ${result.projectName}` : '')
        }
      ]
    };
  }

  /**
   * Handle session status request
   */
  private async handleSessionStatus() {
    console.log('📋 Session status request');
    
    const result = await SessionManagementHandler.getSessionStatus();
    
    if (!result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ ${result.message}`
          }
        ]
      };
    }

    const session = result.session!;
    const statusText = `📋 Current Session Status\n\n` +
      `🆔 Session ID: ${session.id.substring(0, 8)}...\n` +
      `🏷️  Type: ${session.type}\n` +
      `🏢 Project: ${session.project_name}\n` +
      `⏰ Started: ${new Date(session.started_at).toLocaleString()}\n` +
      `⏱️  Duration: ${session.duration_minutes} minutes\n` +
      `📝 Contexts: ${session.contexts_created}\n` +
      `📋 Tasks: ${session.tasks_created || 0} created, ${session.tasks_updated || 0} updated, ${session.tasks_completed || 0} completed\n` +
      `🎯 Decisions: ${session.decisions_created}\n` +
      `🪙 Tokens: ${session.total_tokens?.toLocaleString() || 0} (↓${session.input_tokens?.toLocaleString() || 0} ↑${session.output_tokens?.toLocaleString() || 0})\n` +
      (session.metadata.title ? `📌 Title: "${session.metadata.title}"\n` : '') +
      (session.metadata.assigned_manually ? `🔧 Manually assigned at: ${new Date(session.metadata.assigned_at).toLocaleString()}\n` : '');

    return {
      content: [
        {
          type: 'text',
          text: statusText
        }
      ]
    };
  }

  /**
   * Handle new session creation
   */
  private async handleSessionNew(args: any) {
    console.log(`🆕 New session request: title="${args.title}", project="${args.projectName}"`);
    
    const result = await SessionManagementHandler.createNewSession(args.title, args.projectName);
    
    return {
      content: [
        {
          type: 'text',
          text: result.message + (result.success ? `\n\n📝 Session ID: ${result.sessionId?.substring(0, 8)}...\n🏷️  Project: ${result.projectName}` : '')
        }
      ]
    };
  }

  /**
   * Handle session update (title and description)
   */
  private async handleSessionUpdate(args: any) {
    console.log(`✏️  Session update request: session="${args.sessionId?.substring(0, 8)}...", title="${args.title || 'unchanged'}", description="${args.description ? args.description.substring(0, 50) + '...' : 'unchanged'}"`);
    
    if (!args.sessionId) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ Session ID is required for updates'
          }
        ]
      };
    }

    if (!args.title && !args.description) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ At least one field (title or description) must be provided for update'
          }
        ]
      };
    }
    
    const result = await SessionManagementHandler.updateSessionDetails(
      args.sessionId, 
      args.title, 
      args.description
    );
    
    if (!result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ ${result.message}`
          }
        ]
      };
    }

    const session = result.session!;
    let updateText = `✅ Session Updated Successfully\n\n`;
    updateText += `🆔 Session ID: ${session.id.substring(0, 8)}...\n`;
    
    if (session.title) {
      updateText += `📌 Title: "${session.title}"\n`;
    }
    
    if (session.description) {
      updateText += `📝 Description: ${session.description.length > 100 ? session.description.substring(0, 100) + '...' : session.description}\n`;
    }
    
    updateText += `🏢 Project: ${session.project_name || 'No project assigned'}\n`;
    updateText += `⏰ Updated: ${new Date(session.updated_at).toLocaleString()}`;

    return {
      content: [
        {
          type: 'text',
          text: updateText
        }
      ]
    };
  }

  /**
   * Handle session details request
   */
  private async handleSessionDetails(args: any) {
    console.log(`🔍 Session details request: session="${args.sessionId?.substring(0, 8)}..."`);
    
    if (!args.sessionId) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ Session ID is required'
          }
        ]
      };
    }
    
    const result = await SessionManagementHandler.getSessionDetailsWithMeta(args.sessionId);
    
    if (!result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ ${result.message}`
          }
        ]
      };
    }

    const session = result.session!;
    let detailsText = `📋 Session Details\n\n`;
    detailsText += `🆔 Session ID: ${session.id.substring(0, 8)}...\n`;
    
    if (session.title) {
      detailsText += `📌 Title: "${session.title}"\n`;
    } else {
      detailsText += `📌 Title: (not set)\n`;
    }
    
    if (session.description) {
      detailsText += `📝 Description: ${session.description}\n`;
    } else {
      detailsText += `📝 Description: (not set)\n`;
    }
    
    detailsText += `🏷️  Type: ${session.type}\n`;
    detailsText += `🏢 Project: ${session.project_name}\n`;
    detailsText += `⏰ Started: ${new Date(session.started_at).toLocaleString()}\n`;
    
    if (session.ended_at) {
      detailsText += `🏁 Ended: ${new Date(session.ended_at).toLocaleString()}\n`;
    }
    
    detailsText += `⏱️  Duration: ${session.duration_minutes} minutes\n`;
    detailsText += `📝 Contexts: ${session.contexts_created}\n`;
    detailsText += `🎯 Decisions: ${session.decisions_created}\n`;
    
    if (session.context_summary) {
      detailsText += `\n📄 Summary: ${session.context_summary}\n`;
    }
    
    if (session.updated_at && session.updated_at !== session.started_at) {
      detailsText += `\n🔄 Last Updated: ${new Date(session.updated_at).toLocaleString()}`;
    }

    return {
      content: [
        {
          type: 'text',
          text: detailsText
        }
      ]
    };
  }

  // Git Correlation Handler Methods
  
  /**
   * Handle git session commits request
   */

  /**
   * Handle git commit sessions request
   */

  /**
   * Handle git correlation trigger request
   */
}

/**
 * Global shutdown handling - now uses instance method
 */
let serverInstance: AIDISServer | null = null;

async function shutdown(signal: string): Promise<void> {
  if (serverInstance) {
    await serverInstance.gracefulShutdown(signal);
  } else {
    console.log(`\n📴 Received ${signal}, no server instance to shut down`);
  }
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  
  // DIRECT MODE OPERATION: Always start in Full Server Mode (SystemD removed)
  (async () => {
    try {
      console.log('🚀 Starting AIDIS in Direct Mode (SystemD dependency removed)');
      
      await ensureFeatureFlags();

      serverInstance = new AIDISServer();
      
      // Start with enhanced error handling
      await serverInstance.start();
      
    } catch (error) {
      console.error('❌ Unhandled startup error:', error);
      
      // Attempt graceful cleanup even on startup failure
      if (serverInstance) {
        await serverInstance.gracefulShutdown('STARTUP_ERROR');
      }
      process.exit(1);
    }
  })();
}

export { AIDISServer };
