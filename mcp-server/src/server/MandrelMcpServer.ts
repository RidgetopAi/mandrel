#!/usr/bin/env node

/**
 * AIDIS MCP Server - ENTERPRISE HARDENED
 *
 * This is the main server class for our AI Development Intelligence System.
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

import { logger, CorrelationIdManager } from '../utils/logger.js';
import { RequestLogger } from '../middleware/requestLogger.js';
import { ErrorHandler } from '../utils/errorHandler.js';
import { CircuitBreaker, RetryHandler } from '../utils/resilience.js';
import { HealthServer } from './healthServer.js';
import { backgroundServices } from '../services/backgroundServices.js';
import { registerMcpHandlers, type McpHandlerDeps } from './registerMcpHandlers.js';
import { RemoteMcpTransport } from './remoteMcpTransport.js';
import { assertRemoteMcpEnvOrExit } from './requireRemoteMcpEnv.js';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { initializeDatabase, closeDatabase } from '../config/database.js';
import { dbPool } from '../services/databasePool.js';
import { validationMiddleware } from '../middleware/validation.js';
import { SessionTracker } from '../services/sessionTracker.js';
import { ActiveSessionStore } from '../services/session/index.js';
import { ensureFeatureFlags } from '../utils/featureFlags.js';
// Phase 6.3: Route executor integration - replaces individual handler imports
import { routeExecutor } from '../routes/index.js';
// Keep projectHandler for session state access only (line 148)
import { projectHandler } from '../handlers/project.js';

// Enterprise hardening constants
const MAX_RETRIES = 3;
// Helper function to get environment variable with AIDIS_ prefix and fallback
function getEnvVar(aidisKey: string, legacyKey: string, defaultValue: string = ''): string {
  return process.env[aidisKey] || process.env[legacyKey] || defaultValue;
}

const SKIP_DATABASE = getEnvVar('AIDIS_SKIP_DATABASE', 'SKIP_DATABASE', 'false') === 'true';
const SKIP_STDIO_TRANSPORT = getEnvVar('AIDIS_SKIP_STDIO', 'SKIP_STDIO', 'false') === 'true';

/**
 * AIDIS Server Class - ENTERPRISE HARDENED
 *
 * This handles all MCP protocol communication and routes requests
 * to our various handlers (context, naming, decisions, etc.)
 */
export default class MandrelMcpServer {
  private server: Server;
  private healthServer: HealthServer;
  // private v2McpRouter: V2McpRouter; // Disabled - using direct integration
  private circuitBreaker: CircuitBreaker;
  private remoteMcp: RemoteMcpTransport;

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

    // Shared MCP handler dependencies — used by BOTH the stdio Server and each
    // per-session HTTP Server so tool logic lives in exactly one place (DRY).
    const handlerDeps: McpHandlerDeps = {
      executeMcpTool: this.executeMcpTool.bind(this),
      deserializeParameters: this.deserializeParameters.bind(this),
      getServerStatus: this.getServerStatus.bind(this),
    };

    // Register handlers on the long-lived stdio Server (connectionId defaults to stdio)
    registerMcpHandlers(this.server, handlerDeps);

    // Remote Streamable HTTP transport reuses the SAME handler registration per session
    this.remoteMcp = new RemoteMcpTransport(handlerDeps);

    // Initialize health server with MCP tool executor + remote transport mount
    this.healthServer = new HealthServer(
      this.executeMcpTool.bind(this),
      this.deserializeParameters.bind(this),
      this.remoteMcp
    );
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

  // setupHealthServer(), handleMcpToolRequest(), handleV2McpRequest(), and simulateV2Routing() methods moved to server/healthServer.ts

  /**
   * Execute MCP Tool (shared logic for both MCP and HTTP)
   * @param context - Optional execution context with connectionId for session isolation
   */
  private async executeMcpTool(toolName: string, args: any, context?: { connectionId?: string }): Promise<any> {
    // Generate correlation ID for request tracing
    const correlationId = CorrelationIdManager.generate();
    // Use connectionId from context for session isolation, default for stdio
    const connectionId = context?.connectionId ?? 'stdio';
    const sessionId = this.getCurrentSessionId(connectionId);

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

        return this.executeToolOperation(toolName, validatedArgs, connectionId);
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
      logger.error('Failed to record token usage', error as Error);
    }

    return result;
  }

  /**
   * Phase 6.3: Execute the actual tool operation via route dispatcher
   * All tool routing logic moved to routes/index.ts
   */
  private async executeToolOperation(toolName: string, validatedArgs: any, connectionId?: string): Promise<any> {
    // Delegate to centralized route executor with connection context for session isolation
    // All 38 MCP tools now handled by domain-based route modules
    return await routeExecutor(toolName, validatedArgs, { connectionId });
  }

  // MCP request-handler registration extracted to server/registerMcpHandlers.ts so the
  // stdio Server and every per-session HTTP Server share ONE handler definition (DRY).

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
            logger.error(`✅ Deserialized ${param} array parameter (${parsed.length} items)`);
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
          logger.error(`✅ Converted ${param} to number: ${numValue}`);
        }
      }
    }

    return result;
  }

  // Phase 6.3: All 38 handler methods removed - now in routes/*.routes.ts
  // Handlers extracted to:
  //   - routes/system.routes.ts (5 tools: ping, status, help, explain, examples)
  //   - routes/context.routes.ts (4 tools)
  //   - routes/project.routes.ts (6 tools)
  //   - routes/naming.routes.ts (4 tools)
  //   - routes/decisions.routes.ts (4 tools)
  //   - routes/tasks.routes.ts (6 tools)
  //   - routes/sessions.routes.ts (5 tools)
  //   - routes/search.routes.ts (3 tools)
  //   - routes/patterns.routes.ts (2 tools)
  // All routing logic centralized in routes/index.ts via routeExecutor()

  /**
   * Get current session ID from active session store for a specific connection
   * @param connectionId - Connection identifier for session isolation
   */
  private getCurrentSessionId(connectionId?: string): string | null {
    return ActiveSessionStore.get(connectionId);
  }

  /**
   * Get server status information
   */
  private async getServerStatus() {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const featureFlagStore = await ensureFeatureFlags();
    const featureFlags = featureFlagStore.getAllFlags();

    // Test database connectivity
    let databaseConnected = false;
    try {
      const { db } = await import('../config/database.js');
      const result = await db.query('SELECT 1 as test');
      databaseConnected = result.rows.length > 0;
    } catch (error) {
      logger.warn('Database connectivity test failed', { metadata: { error } });
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
   * Start the AIDIS MCP Server
   * Phase 6.3: Simplified using backgroundServices module
   */
  async start(): Promise<void> {
    RequestLogger.logSystemEvent('server_startup_initiated', {
      version: '0.1.0-hardened',
      processId: process.pid,
      nodeVersion: process.version
    });

    // FAIL-LOUD STARTUP GUARD (Lesson 009): if this process is in a mode that actually
    // serves the remote HTTP MCP transport but a required env var is missing/empty, log
    // a NAMED FATAL error and exit non-zero BEFORE binding any port — never boot into a
    // broken fail-closed state. No-op for local/stdio/dev/test. See requireRemoteMcpEnv.ts.
    assertRemoteMcpEnvOrExit();

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

        // LAZY SESSION LIFECYCLE (no eager create on boot/connect).
        // Previously this called ensureActiveSession('stdio') at startup, which
        // stamped an empty DB session row on every server boot even if the
        // connection never produced any content. We no longer do that: a session
        // is created lazily by the route-level ACTION gate (routes/index.ts) the
        // first time a content-producing tool (context_store / task_create /
        // decision_record) runs on a connection. Passive/read tools never create
        // a session. The detected AI model is applied when that lazy create fires.
        logger.info('📋 Session lifecycle: lazy (created on first content-producing tool, not on boot)');
      } else {
        logger.info('🧪 Skipping database initialization (AIDIS_SKIP_DATABASE=true)');
      }

      // Phase 6.3: Start background services via backgroundServices module
      logger.info('🚀 Starting background services...');
      try {
        await backgroundServices.startAll();
        logger.info('✅ Background services initialized successfully');
      } catch (error) {
        logger.warn('⚠️  Failed to initialize background services', { metadata: { error } });
        logger.warn('   Background processing will be disabled');
      }

      // ORACLE FIX #3: Start health check server
      logger.info(`🏥 Starting health check server...`);
      try {
        await this.healthServer.start();
        logger.info(`✅ Health endpoints available`);
      } catch (error) {
        logger.warn('⚠️  Failed to start health server', { metadata: { error } });
      }

      // ORACLE FIX #4: Create transport with MCP debug logging
      if (!SKIP_STDIO_TRANSPORT) {
        logger.info('🔗 Creating MCP transport with debug logging...');
        const transport = new StdioServerTransport();

        // Enhanced connection logging
        logger.info('🤝 Connecting to MCP transport...');
        await this.server.connect(transport);

        logger.info('✅ AIDIS MCP Server is running and ready for connections!');
      } else {
        logger.info('🧪 Skipping MCP stdio transport (AIDIS_SKIP_STDIO=true)');
      }

      logger.info('🔒 Enterprise Security Features:');
      logger.info(`   🔒 Process Singleton: ACTIVE (PID: ${process.pid})`);
      logger.info(`   🔄 Retry Logic: ${MAX_RETRIES} attempts with exponential backoff`);
      logger.info(`   ⚡ Circuit Breaker: ${this.circuitBreaker.getState().toUpperCase()}`);
      logger.info(`   🐛 MCP Debug: ${getEnvVar('AIDIS_MCP_DEBUG', 'MCP_DEBUG', 'DISABLED')}`);

      logger.info('🎯 AIDIS System Status: ONLINE');

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

      // Clean up on startup failure
      await this.gracefulShutdown('STARTUP_FAILURE');
      process.exit(1);
    }
  }

  /**
   * Enhanced Graceful Shutdown
   * Phase 6.3: Simplified using backgroundServices module
   */
  async gracefulShutdown(signal: string): Promise<void> {
    RequestLogger.logSystemEvent('graceful_shutdown_initiated', {
      signal,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    });

    try {
      if (!SKIP_DATABASE) {
        // Flush in-memory data before ending session
        logger.info('💾 Flushing in-memory session data...');
        try {
          await SessionTracker.flushTokensToDatabase();
          await SessionTracker.flushActivityToDatabase();
          logger.info('✅ Session data flushed to database');
        } catch (error) {
          logger.warn('⚠️  Failed to flush session data', { metadata: { error } });
        }

        // End current session if active.
        // Lazy-create model: the stdio connection's session (if one was ever
        // created by a real action) lives under the 'stdio' connection key.
        // Connection-scoped lookup — do NOT adopt some other connection's session
        // at shutdown.
        logger.info('📋 Ending active session...');
        try {
          const activeSessionId = await SessionTracker.getActiveSession('stdio');
          if (activeSessionId) {
            await SessionTracker.endSession(activeSessionId);
            logger.info('✅ Session ended gracefully');
          } else {
            logger.info('ℹ️  No active session to end');
          }
        } catch (error) {
          logger.warn('⚠️  Failed to end session', { metadata: { error } });
        }
      }

      // Phase 6.3: Stop background services via backgroundServices module
      logger.info('🚀 Stopping background services...');
      try {
        await backgroundServices.stopAll();
        logger.info('✅ Background services stopped gracefully');
      } catch (error) {
        logger.warn('⚠️  Failed to stop background services', { metadata: { error } });
      }

      // Close any live remote MCP HTTP sessions before tearing down the server
      if (this.remoteMcp) {
        logger.info('🌐 Closing remote MCP HTTP sessions...');
        try {
          await this.remoteMcp.closeAll();
          logger.info('✅ Remote MCP HTTP sessions closed');
        } catch (error) {
          logger.warn('⚠️  Failed to close remote MCP sessions', { metadata: { error } });
        }
      }

      // Close health check server
      if (this.healthServer) {
        logger.info('🏥 Closing health check server...');
        await this.healthServer.stop();
        logger.info('✅ Health check server closed');
      }

      if (!SKIP_DATABASE) {
        // Close database connections
        logger.info('🔌 Closing database connections...');
        await closeDatabase();
        logger.info('✅ Database connections closed');
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
}
