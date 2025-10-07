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

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { initializeDatabase, closeDatabase } from '../config/database.js';
import { dbPool } from '../services/databasePool.js';
import { AIDIS_TOOL_DEFINITIONS } from '../config/toolDefinitions.js';
import { validationMiddleware } from '../middleware/validation.js';
import { SessionTracker, ensureActiveSession } from '../services/sessionTracker.js';
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
export default class AidisMcpServer {
  private server: Server;
  private healthServer: HealthServer;
  // private v2McpRouter: V2McpRouter; // Disabled - using direct integration
  private circuitBreaker: CircuitBreaker;

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

    // Initialize health server with MCP tool executor
    this.healthServer = new HealthServer(
      this.executeMcpTool.bind(this),
      this.deserializeParameters.bind(this)
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
   * Phase 6.3: Execute the actual tool operation via route dispatcher
   * All tool routing logic moved to routes/index.ts
   */
  private async executeToolOperation(toolName: string, validatedArgs: any): Promise<any> {
    // Delegate to centralized route executor
    // All 38 MCP tools now handled by domain-based route modules
    return await routeExecutor(toolName, validatedArgs);
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
   * Get current session ID (placeholder for future session tracking enhancement)
   */
  private getCurrentSessionId(): string {
    // In future versions, this would come from proper session tracking
    // For now, use a default session ID that integrates with existing ProjectHandler
    return 'default-session';
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
   * Start the AIDIS MCP Server
   * Phase 6.3: Simplified using backgroundServices module
   */
  async start(): Promise<void> {
    RequestLogger.logSystemEvent('server_startup_initiated', {
      version: '0.1.0-hardened',
      processId: process.pid,
      nodeVersion: process.version
    });

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
      }

      // Phase 6.3: Start background services via backgroundServices module
      console.log('🚀 Starting background services...');
      try {
        await backgroundServices.startAll();
        console.log('✅ Background services initialized successfully');
      } catch (error) {
        console.warn('⚠️  Failed to initialize background services:', error);
        console.warn('   Background processing will be disabled');
      }

      // ORACLE FIX #3: Start health check server
      console.log(`🏥 Starting health check server...`);
      try {
        await this.healthServer.start();
        console.log(`✅ Health endpoints available`);
      } catch (error) {
        console.warn('⚠️  Failed to start health server:', error);
      }

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
      console.log(`   🔄 Retry Logic: ${MAX_RETRIES} attempts with exponential backoff`);
      console.log(`   ⚡ Circuit Breaker: ${this.circuitBreaker.getState().toUpperCase()}`);
      console.log(`   🐛 MCP Debug: ${getEnvVar('AIDIS_MCP_DEBUG', 'MCP_DEBUG', 'DISABLED')}`);

      console.log('🎯 AIDIS System Status: ONLINE');

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
      }

      // Phase 6.3: Stop background services via backgroundServices module
      console.log('🚀 Stopping background services...');
      try {
        await backgroundServices.stopAll();
        console.log('✅ Background services stopped gracefully');
      } catch (error) {
        console.warn('⚠️  Failed to stop background services:', error);
      }

      // Close health check server
      if (this.healthServer) {
        console.log('🏥 Closing health check server...');
        await this.healthServer.stop();
        console.log('✅ Health check server closed');
      }

      if (!SKIP_DATABASE) {
        // Close database connections
        console.log('🔌 Closing database connections...');
        await closeDatabase();
        console.log('✅ Database connections closed');
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
