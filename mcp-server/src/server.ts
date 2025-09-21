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
import { contextHandler } from './handlers/context.js';
import { projectHandler } from './handlers/project.js';
import { namingHandler } from './handlers/naming.js';
import { decisionsHandler } from './handlers/decisions.js';
import { tasksHandler } from './handlers/tasks.js';
import { getQueueManager, shutdownQueue } from './services/queueManager.js';
import { codeAnalysisHandler } from './handlers/codeAnalysis.js';
import { smartSearchHandler } from './handlers/smartSearch.js';
import { navigationHandler } from './handlers/navigation.js';
import { validationMiddleware } from './middleware/validation.js';
import { AIDISMCPProxy } from './utils/mcpProxy.js';
import { SessionTracker, ensureActiveSession } from './services/sessionTracker.js';
import { SessionManagementHandler } from './handlers/sessionAnalytics.js';
import { GitHandler } from './handlers/git.js';
import { startGitTracking, stopGitTracking } from './services/gitTracker.js';
import { patternDetectionHandlers } from './handlers/patternDetection.js';
import { patternAnalysisHandlers } from './handlers/patternAnalysis.js';
import { startPatternDetection, stopPatternDetection } from './services/patternDetector.js';
import { DevelopmentMetricsHandler } from './handlers/developmentMetrics.js';
import { 
  startMetricsCollection, 
  stopMetricsCollection, 
  collectMetricsOnCommit,
  collectMetricsOnPatternUpdate 
} from './services/metricsCollector.js';
import { 
  startMetricsIntegration,
  stopMetricsIntegration 
} from './services/metricsIntegration.js';
// TC015: Code Complexity Tracking imports
import { CodeComplexityHandler } from './handlers/codeComplexity.js';
import { handleComplexityAnalyze } from './handlers/complexity/complexityAnalyze.js';
import { handleComplexityInsights } from './handlers/complexity/complexityInsights.js';
import { handleComplexityManage } from './handlers/complexity/complexityManage.js';
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
// TC016: Decision Outcome Tracking imports
import { outcomeTrackingHandler } from './handlers/outcomeTracking.js';
// TC018: Metrics Aggregation imports
import { MetricsAggregationHandler } from './handlers/metricsAggregation.js';
import { ensureFeatureFlags } from './utils/featureFlags.js';
import { portManager } from './utils/portManager.js';

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
async function isSystemDServiceRunning(): Promise<boolean> {
  try {
    // Try to discover the port from registry first
    const registeredPort = await portManager.discoverServicePort('aidis-mcp');
    const healthPort = registeredPort || (await portManager.assignPort('aidis-mcp'));

    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${healthPort}/healthz`, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          resolve(data.includes('"status":"healthy"'));
        });
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

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
  private circuitBreaker: CircuitBreaker;
  private singleton: ProcessSingleton;
  private dbHealthy: boolean = false;

  constructor() {
    this.circuitBreaker = new CircuitBreaker();
    this.singleton = new ProcessSingleton();
    
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
   * Get current session ID for logging context
   */
  private getCurrentSessionId(): string | undefined {
    try {
      return SessionTracker.getCurrentSessionId();
    } catch {
      return undefined;
    }
  }

  /**
   * Get current project ID for logging context
   */
  private getCurrentProjectId(): string | undefined {
    try {
      return projectHandler.getCurrentProject()?.id;
    } catch {
      return undefined;
    }
  }

  /**
   * Setup Health Check Server with MCP Tool Endpoints
   */
  private setupHealthServer(): void {
    this.healthServer = http.createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      
      if (req.url === '/healthz') {
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
        RequestLogger.logHealthCheck('/livez', 'alive', Date.now() - startTime);

      } else if (req.url?.startsWith('/mcp/tools/') && req.method === 'POST') {
        // MCP Tool HTTP Endpoints for Proxy Forwarding
        await this.handleMcpToolRequest(req, res);
        
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
   * Execute MCP Tool (shared logic for both MCP and HTTP)
   */
  private async executeMcpTool(toolName: string, args: any): Promise<any> {
    // Generate correlation ID for request tracing
    const correlationId = CorrelationIdManager.generate();
    
    return RequestLogger.wrapOperation(
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
        sessionId: this.getCurrentSessionId(),
        projectId: this.getCurrentProjectId()
      }
    );
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

      case 'code_analyze':
        return await this.handleCodeAnalyze(validatedArgs as any);
        
      case 'code_components':
        return await this.handleCodeComponents(validatedArgs as any);
        
      case 'code_dependencies':
        return await this.handleCodeDependencies(validatedArgs as any);
        
      case 'code_impact':
        return await this.handleCodeImpact(validatedArgs as any);
        
      case 'code_stats':
        return await this.handleCodeStats(validatedArgs as any);
        
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

      // Git Correlation Tools
      case 'git_session_commits':
        return await this.handleGitSessionCommits(validatedArgs as any);
        
      case 'git_commit_sessions':
        return await this.handleGitCommitSessions(validatedArgs as any);
        
      case 'git_correlate_session':
        return await this.handleGitCorrelateSession(validatedArgs as any);

      // TC013: Pattern Detection Tools
      case 'pattern_detection_start':
        return await patternDetectionHandlers.pattern_detection_start(validatedArgs as any);
      
      case 'pattern_detection_stop':
        return await patternDetectionHandlers.pattern_detection_stop();
      
      case 'pattern_detect_commits':
        return await patternDetectionHandlers.pattern_detect_commits(validatedArgs as any);
      
      case 'pattern_get_session_insights':
        return await patternDetectionHandlers.pattern_get_session_insights(validatedArgs as any);
      
      case 'pattern_analyze_project':
        return await patternDetectionHandlers.pattern_analyze_project(validatedArgs as any);
      
      case 'pattern_get_alerts':
        return await patternDetectionHandlers.pattern_get_alerts(validatedArgs as any);
      
      case 'pattern_detection_status':
        return await patternDetectionHandlers.pattern_detection_status();
      
      case 'pattern_track_git_activity':
        return await patternDetectionHandlers.pattern_track_git_activity();
      
      // TC017: Pattern Analysis Tools - Comprehensive pattern intelligence API
      case 'pattern_get_discovered':
        return await patternAnalysisHandlers.pattern_get_discovered(validatedArgs as any);
      
      case 'pattern_get_trends':
        return await patternAnalysisHandlers.pattern_get_trends(validatedArgs as any);
      
      case 'pattern_get_correlations':
        return await patternAnalysisHandlers.pattern_get_correlations(validatedArgs as any);
      
      case 'pattern_get_insights':
        return await patternAnalysisHandlers.pattern_get_insights(validatedArgs as any);
      
      case 'pattern_get_alerts':
        return await patternAnalysisHandlers.pattern_get_alerts(validatedArgs as any);
      
      case 'pattern_get_anomalies':
        return await patternAnalysisHandlers.pattern_get_anomalies(validatedArgs as any);
      
      case 'pattern_get_recommendations':
        return await patternAnalysisHandlers.pattern_get_recommendations(validatedArgs as any);
      
      case 'pattern_analyze_session':
        return await patternAnalysisHandlers.pattern_analyze_session(validatedArgs as any);
      
      case 'pattern_analyze_commit':
        return await patternAnalysisHandlers.pattern_analyze_commit(validatedArgs as any);
      
      case 'pattern_get_performance':
        return await patternAnalysisHandlers.pattern_get_performance(validatedArgs as any);
      
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

      // Development Metrics Tools (to be consolidated in Phase 2)
      case 'metrics_collect_project':
      case 'metrics_get_dashboard':
      case 'metrics_get_core_metrics':
      case 'metrics_get_pattern_intelligence':
      case 'metrics_get_productivity_health':
      case 'metrics_get_alerts':
      case 'metrics_acknowledge_alert':
      case 'metrics_resolve_alert':
      case 'metrics_get_trends':
      case 'metrics_get_performance':
      case 'metrics_start_collection':
      case 'metrics_stop_collection':
        return await DevelopmentMetricsHandler.handleTool(toolName, validatedArgs);

      // TC018: Metrics Aggregation Tools
      case 'metrics_aggregate_projects':
      case 'metrics_aggregate_timeline':
      case 'metrics_calculate_correlations':
      case 'metrics_get_executive_summary':
      case 'metrics_export_data':
        return await MetricsAggregationHandler.handleTool(toolName, validatedArgs);
        
      // TC015: Code Complexity Tracking tools
      case 'complexity_analyze':
        return await handleComplexityAnalyze(validatedArgs);
      case 'complexity_insights':
        return await handleComplexityInsights(validatedArgs);
      case 'complexity_manage':
        return await handleComplexityManage(validatedArgs);
      // TC015: Deprecated complexity tools removed - TT009-1 Tool Consolidation Phase 1 Complete
      // 16 tools consolidated into complexity_analyze, complexity_insights, complexity_manage
        
      // TC016: Decision Outcome Tracking tools - REMOVED in TT009-4 (Academic features)
      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${toolName}. Available tools: ${this.getAvailableTools().join(', ')}`
        );
    }
  }

  /**
   * Set up all MCP request handlers
   */
  private setupHandlers(): void {
    // Handle tool listing requests - shows what tools are available
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'aidis_ping',
            description: 'Test connectivity to AIDIS server',
            inputSchema: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'Optional test message',
                  default: 'Hello AIDIS!'
                }
              }
            },
          },
          {
            name: 'aidis_status',
            description: 'Get AIDIS server status and health information',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'aidis_help',
            description: 'Display categorized list of all AIDIS tools',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'aidis_explain',
            description: 'Get detailed help for a specific AIDIS tool',
            inputSchema: {
              type: 'object',
              properties: {
                toolName: { type: 'string', description: 'Name of the tool to explain (e.g., "context_search", "project_list")' }
              },
              required: ['toolName']
            },
          },
          {
            name: 'aidis_examples',
            description: 'Get usage examples and patterns for a specific AIDIS tool',
            inputSchema: {
              type: 'object',
              properties: {
                toolName: { type: 'string', description: 'Name of the tool to get examples for (e.g., "context_search", "project_create")' }
              },
              required: ['toolName']
            },
          },
          {
            name: 'context_store',
            description: 'Store development context with automatic embedding generation for semantic search',
            inputSchema: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'The context content to store (code, decisions, discussions, etc.)'
                },
                type: {
                  type: 'string',
                  enum: ['code', 'decision', 'error', 'discussion', 'planning', 'completion', 'milestone', 'reflections', 'handoff'],
                  description: 'Type of context being stored'
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Optional tags for categorization'
                },
                relevanceScore: {
                  type: 'number',
                  minimum: 0,
                  maximum: 10,
                  description: 'Relevance score (0-10, default: 5)'
                },
                metadata: {
                  type: 'object',
                  description: 'Optional metadata as key-value pairs'
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses default if not specified)'
                },
                sessionId: {
                  type: 'string',
                  description: 'Optional session ID for grouping related contexts'
                }
              },
              required: ['content', 'type']
            },
          },
          {
            name: 'context_search',
            description: 'Search stored contexts using semantic similarity and filters',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query (uses semantic similarity matching)'
                },
                type: {
                  type: 'string',
                  enum: ['code', 'decision', 'error', 'discussion', 'planning', 'completion', 'milestone', 'reflections', 'handoff'],
                  description: 'Optional filter by context type'
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Optional filter by tags'
                },
                limit: {
                  type: 'number',
                  minimum: 1,
                  maximum: 50,
                  description: 'Maximum number of results (default: 10)'
                },
                minSimilarity: {
                  type: 'number',
                  minimum: 0,
                  maximum: 100,
                  description: 'Minimum similarity percentage (0-100)'
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID filter'
                }
              },
              required: ['query']
            },
          },
          {
            name: 'context_get_recent',
            description: 'Get recent contexts in chronological order (newest first)',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  minimum: 1,
                  maximum: 20,
                  description: 'Maximum number of results (default: 5)'
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                }
              },
              required: []
            },
          },
          {
            name: 'context_stats',
            description: 'Get context statistics for a project',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses default if not specified)'
                }
              }
            },
          },
          {
            name: 'project_list',
            description: 'List all available projects with statistics',
            inputSchema: {
              type: 'object',
              properties: {
                includeStats: {
                  type: 'boolean',
                  description: 'Include context statistics for each project (default: true)'
                }
              }
            },
          },
          {
            name: 'project_create',
            description: 'Create a new project',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Unique project name'
                },
                description: {
                  type: 'string',
                  description: 'Optional project description'
                },
                gitRepoUrl: {
                  type: 'string',
                  description: 'Optional Git repository URL'
                },
                rootDirectory: {
                  type: 'string',
                  description: 'Optional root directory path'
                },
                metadata: {
                  type: 'object',
                  description: 'Optional metadata as key-value pairs'
                }
              },
              required: ['name']
            },
          },
          {
            name: 'project_switch',
            description: 'Switch to a different project (sets it as current active project)',
            inputSchema: {
              type: 'object',
              properties: {
                project: {
                  type: 'string',
                  description: 'Project ID or name to switch to'
                }
              },
              required: ['project']
            },
          },
          {
            name: 'project_current',
            description: 'Get the currently active project information',
            inputSchema: {
              type: 'object',
              properties: {}
            },
          },
          {
            name: 'project_info',
            description: 'Get detailed information about a specific project',
            inputSchema: {
              type: 'object',
              properties: {
                project: {
                  type: 'string',
                  description: 'Project ID or name to get information for'
                }
              },
              required: ['project']
            },
          },
          {
            name: 'naming_register',
            description: 'Register a name in the naming registry to prevent conflicts',
            inputSchema: {
              type: 'object',
              properties: {
                entityType: {
                  type: 'string',
                  enum: ['variable', 'function', 'class', 'interface', 'type', 'component', 'file', 'directory', 'module', 'service', 'endpoint', 'database_table', 'database_column', 'config_key', 'environment_var', 'css_class', 'html_id'],
                  description: 'Type of entity being named'
                },
                canonicalName: {
                  type: 'string',
                  description: 'The official name to register'
                },
                description: {
                  type: 'string',
                  description: 'Description of what this entity represents'
                },
                aliases: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Alternative names or variations'
                },
                contextTags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Tags for categorization'
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                }
              },
              required: ['entityType', 'canonicalName']
            },
          },
          {
            name: 'naming_check',
            description: 'Check for naming conflicts before using a name',
            inputSchema: {
              type: 'object',
              properties: {
                entityType: {
                  type: 'string',
                  enum: ['variable', 'function', 'class', 'interface', 'type', 'component', 'file', 'directory', 'module', 'service', 'endpoint', 'database_table', 'database_column', 'config_key', 'environment_var', 'css_class', 'html_id'],
                  description: 'Type of entity being named'
                },
                proposedName: {
                  type: 'string',
                  description: 'The name you want to check'
                },
                contextTags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Context tags for smarter conflict detection'
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                }
              },
              required: ['entityType', 'proposedName']
            },
          },
          {
            name: 'naming_suggest',
            description: 'Get name suggestions based on description and project patterns',
            inputSchema: {
              type: 'object',
              properties: {
                entityType: {
                  type: 'string',
                  enum: ['variable', 'function', 'class', 'interface', 'type', 'component', 'file', 'directory', 'module', 'service', 'endpoint', 'database_table', 'database_column', 'config_key', 'environment_var', 'css_class', 'html_id'],
                  description: 'Type of entity being named'
                },
                description: {
                  type: 'string',
                  description: 'Description of what needs to be named'
                },
                contextTags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Context tags to influence suggestions'
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                }
              },
              required: ['entityType', 'description']
            },
          },
          {
            name: 'naming_stats',
            description: 'Get naming statistics and convention compliance for a project',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                }
              }
            },
          },
          {
            name: 'decision_record',
            description: 'Record a technical decision with full context and alternatives',
            inputSchema: {
              type: 'object',
              properties: {
                decisionType: {
                  type: 'string',
                  enum: ['architecture', 'library', 'framework', 'pattern', 'api_design', 'database', 'deployment', 'security', 'performance', 'ui_ux', 'testing', 'tooling', 'process', 'naming_convention', 'code_style'],
                  description: 'Type of decision being made'
                },
                title: {
                  type: 'string',
                  description: 'Brief title of the decision'
                },
                description: {
                  type: 'string',
                  description: 'Detailed description of the decision'
                },
                rationale: {
                  type: 'string',
                  description: 'Why this decision was made'
                },
                impactLevel: {
                  type: 'string',
                  enum: ['low', 'medium', 'high', 'critical'],
                  description: 'Impact level of this decision'
                },
                alternativesConsidered: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      pros: { type: 'array', items: { type: 'string' } },
                      cons: { type: 'array', items: { type: 'string' } },
                      reasonRejected: { type: 'string' }
                    },
                    required: ['name', 'reasonRejected']
                  },
                  description: 'Alternatives that were considered and rejected'
                },
                problemStatement: {
                  type: 'string',
                  description: 'What problem was being solved'
                },
                affectedComponents: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Components affected by this decision'
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Tags for categorization'
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                }
              },
              required: ['decisionType', 'title', 'description', 'rationale', 'impactLevel']
            },
          },
          {
            name: 'decision_search',
            description: 'Search technical decisions with various filters',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Text query to search in decision content'
                },
                decisionType: {
                  type: 'string',
                  enum: ['architecture', 'library', 'framework', 'pattern', 'api_design', 'database', 'deployment', 'security', 'performance', 'ui_ux', 'testing', 'tooling', 'process', 'naming_convention', 'code_style'],
                  description: 'Filter by decision type'
                },
                impactLevel: {
                  type: 'string',
                  enum: ['low', 'medium', 'high', 'critical'],
                  description: 'Filter by impact level'
                },
                component: {
                  type: 'string',
                  description: 'Find decisions affecting this component'
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by tags'
                },
                limit: {
                  type: 'number',
                  minimum: 1,
                  maximum: 50,
                  description: 'Maximum number of results (default: 20)'
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                }
              }
            },
          },
          {
            name: 'decision_update',
            description: 'Update decision status, outcomes, or lessons learned',
            inputSchema: {
              type: 'object',
              properties: {
                decisionId: {
                  type: 'string',
                  description: 'ID of the decision to update'
                },
                outcomeStatus: {
                  type: 'string',
                  enum: ['unknown', 'successful', 'failed', 'mixed', 'too_early'],
                  description: 'How did this decision turn out?'
                },
                outcomeNotes: {
                  type: 'string',
                  description: 'Notes about the outcome'
                },
                lessonsLearned: {
                  type: 'string',
                  description: 'What was learned from this decision'
                }
              },
              required: ['decisionId']
            },
          },
          {
            name: 'decision_stats',
            description: 'Get technical decision statistics and analysis',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                }
              }
            },
          },



          {
            name: 'task_create',
            description: 'Create a new task for agent coordination',
            inputSchema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'Task title'
                },
                description: {
                  type: 'string',
                  description: 'Detailed task description'
                },
                type: {
                  type: 'string',
                  description: 'Task type (feature, bugfix, refactor, test, review, documentation)',
                  default: 'general'
                },
                priority: {
                  type: 'string',
                  enum: ['low', 'medium', 'high', 'urgent'],
                  description: 'Task priority',
                  default: 'medium'
                },
                assignedTo: {
                  type: 'string',
                  description: 'Agent ID to assign task to'
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Task tags'
                },
                dependencies: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Task IDs this task depends on'
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                },
                metadata: {
                  type: 'object',
                  description: 'Additional task metadata'
                }
              },
              required: ['title']
            },
          },
          {
            name: 'task_list',
            description: 'List tasks with optional filtering',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                },
                assignedTo: {
                  type: 'string',
                  description: 'Filter by assigned agent ID'
                },
                status: {
                  type: 'string',
                  enum: ['todo', 'in_progress', 'blocked', 'completed', 'cancelled'],
                  description: 'Filter by single task status'
                },
                statuses: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['todo', 'in_progress', 'blocked', 'completed', 'cancelled']
                  },
                  description: 'Filter by multiple task statuses (takes precedence over status)'
                },
                type: {
                  type: 'string',
                  description: 'Filter by task type'
                },
                tags: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description: 'Filter by tags (matches ANY of the provided tags)'
                },
                priority: {
                  type: 'string',
                  enum: ['low', 'medium', 'high', 'urgent'],
                  description: 'Filter by priority level'
                },
                phase: {
                  type: 'string',
                  description: 'Filter by phase (looks for "phase-{value}" in tags)'
                }
              }
            },
          },
          {
            name: 'task_update',
            description: 'Update task status and assignment',
            inputSchema: {
              type: 'object',
              properties: {
                taskId: {
                  type: 'string',
                  description: 'Task ID to update'
                },
                status: {
                  type: 'string',
                  enum: ['todo', 'in_progress', 'blocked', 'completed', 'cancelled'],
                  description: 'New task status'
                },
                assignedTo: {
                  type: 'string',
                  description: 'Agent ID to assign/reassign task to'
                },
                metadata: {
                  type: 'object',
                  description: 'Additional task metadata'
                }
              },
              required: ['taskId', 'status']
            },
          },
          {
            name: 'task_details',
            description: 'Get detailed information for a specific task',
            inputSchema: {
              type: 'object',
              properties: {
                taskId: {
                  type: 'string',
                  description: 'Task ID to get details for'
                },
                projectId: {
                  type: 'string', 
                  description: 'Optional project ID (uses current if not specified)'
                }
              },
              required: ['taskId']
            },
          },
          {
            name: 'task_bulk_update',
            description: 'Update multiple tasks atomically with the same changes',
            inputSchema: {
              type: 'object',
              properties: {
                task_ids: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description: 'Array of task IDs to update'
                },
                status: {
                  type: 'string',
                  enum: ['todo', 'in_progress', 'blocked', 'completed', 'cancelled'],
                  description: 'New status for all specified tasks'
                },
                assignedTo: {
                  type: 'string',
                  description: 'Agent ID to assign all tasks to'
                },
                priority: {
                  type: 'string',
                  enum: ['low', 'medium', 'high', 'urgent'],
                  description: 'New priority for all specified tasks'
                },
                metadata: {
                  type: 'object',
                  description: 'Additional metadata to apply to all tasks'
                },
                notes: {
                  type: 'string',
                  description: 'Notes to add to all tasks (stored in metadata)'
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID for validation (uses current if not specified)'
                }
              },
              required: ['task_ids']
            },
          },
          {
            name: 'task_progress_summary',
            description: 'Get task progress summary with grouping and completion percentages',
            inputSchema: {
              type: 'object',
              properties: {
                groupBy: {
                  type: 'string',
                  enum: ['phase', 'status', 'priority', 'type', 'assignedTo'],
                  description: 'How to group the progress summary (default: phase)',
                  default: 'phase'
                },
                projectId: {
                  type: 'string',
                  description: 'Project ID to analyze (optional, uses current project if not provided)'
                }
              }
            }
          },
          {
            name: 'code_analyze',
            description: 'Analyze code file structure and dependencies',
            inputSchema: {
              type: 'object',
              properties: {
                filePath: {
                  type: 'string',
                  description: 'Path to file to analyze'
                },
                content: {
                  type: 'string',
                  description: 'File content (optional, will read from disk if not provided)'
                },
                forceReanalyze: {
                  type: 'boolean',
                  description: 'Force reanalysis even if cached',
                  default: false
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                }
              },
              required: ['filePath']
            },
          },
          {
            name: 'code_components',
            description: 'List code components (functions, classes, etc.) in project',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                },
                componentType: {
                  type: 'string',
                  description: 'Filter by component type (function, class, interface, etc.)'
                },
                filePath: {
                  type: 'string',
                  description: 'Filter by specific file path'
                }
              }
            },
          },
          {
            name: 'code_dependencies',
            description: 'Get dependencies for a specific component',
            inputSchema: {
              type: 'object',
              properties: {
                componentId: {
                  type: 'string',
                  description: 'Component ID to get dependencies for'
                }
              },
              required: ['componentId']
            },
          },
          {
            name: 'code_impact',
            description: 'Analyze the impact of changing a component',
            inputSchema: {
              type: 'object',
              properties: {
                componentId: {
                  type: 'string',
                  description: 'Component ID to analyze impact for'
                }
              },
              required: ['componentId']
            },
          },
          {
            name: 'code_stats',
            description: 'Get code analysis statistics for a project',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                }
              }
            },
          },
          {
            name: 'smart_search',
            description: 'Intelligent search across all project data sources',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query'
                },
                includeTypes: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['context', 'component', 'decision', 'naming', 'task', 'agent']
                  },
                  description: 'Data sources to search',
                  default: ['context', 'component', 'decision', 'naming']
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results to return',
                  default: 10
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                }
              },
              required: ['query']
            },
          },
          {
            name: 'get_recommendations',
            description: 'Get AI-powered recommendations for development',
            inputSchema: {
              type: 'object',
              properties: {
                context: {
                  type: 'string',
                  description: 'Context for recommendations (what you\'re working on)'
                },
                type: {
                  type: 'string',
                  enum: ['naming', 'implementation', 'architecture', 'testing'],
                  description: 'Type of recommendations needed',
                  default: 'implementation'
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                }
              },
              required: ['context']
            },
          },
          {
            name: 'project_insights',
            description: 'Get comprehensive project health and insights',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                }
              }
            },
          },
        
        // Session Management Tools
        {
          name: 'session_assign',
          description: 'Assign current session to a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectName: {
                type: 'string',
                description: 'Name of the project to assign the session to'
              }
            },
            required: ['projectName']
          }
        },
        {
          name: 'session_status',
          description: 'Get current session status and details',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'session_new',
          description: 'Create a new session with optional title and project assignment',
          inputSchema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Optional custom title for the session'
              },
              projectName: {
                type: 'string',
                description: 'Optional project to assign the new session to'
              }
            },
            required: []
          }
        },
        {
          name: 'session_update',
          description: 'Update session title and description for better organization',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: 'ID of the session to update'
              },
              title: {
                type: 'string',
                description: 'New title for the session (optional)'
              },
              description: {
                type: 'string',
                description: 'New description for the session (optional)'
              }
            },
            required: ['sessionId']
          }
        },
        {
          name: 'session_details',
          description: 'Get detailed session information including title, description, and metadata',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: 'ID of the session to get details for'
              }
            },
            required: ['sessionId']
          }
        },

        // Git Correlation Tools
        {
          name: 'git_session_commits',
          description: 'Get all git commits linked to a session with correlation details',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: 'Session ID (uses current session if not provided)'
              },
              includeDetails: {
                type: 'boolean',
                description: 'Include full commit details like files changed, insertions, deletions (default: false)'
              },
              confidenceThreshold: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'Minimum correlation confidence score (0.0-1.0, default: 0.0)'
              }
            },
            required: []
          }
        },
        {
          name: 'git_commit_sessions',
          description: 'Get all sessions that contributed to a specific git commit',
          inputSchema: {
            type: 'object',
            properties: {
              commitSha: {
                type: 'string',
                description: 'Git commit SHA (full or partial)'
              },
              includeDetails: {
                type: 'boolean',
                description: 'Include detailed session information (default: false)'
              }
            },
            required: ['commitSha']
          }
        },
        {
          name: 'git_correlate_session',
          description: 'Manually trigger git correlation for current or specified session',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: 'Session ID (uses current session if not provided)'
              },
              projectId: {
                type: 'string',
                description: 'Project ID (uses session project if not provided)'
              },
              forceRefresh: {
                type: 'boolean',
                description: 'Recalculate existing correlations (default: false)'
              },
              confidenceThreshold: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'Minimum correlation confidence threshold (default: 0.3)'
              }
            },
            required: []
          }
        },

        // TC013: Pattern Detection Tools
        {
          name: 'pattern_detection_start',
          description: 'Start the real-time pattern detection service',
          inputSchema: {
            type: 'object',
            properties: {
              enableRealTime: {
                type: 'boolean',
                description: 'Enable real-time pattern detection (default: true)'
              },
              enableBatchProcessing: {
                type: 'boolean',
                description: 'Enable batch processing for historical analysis (default: true)'
              },
              detectionTimeoutMs: {
                type: 'number',
                description: 'Detection timeout in milliseconds (default: 100)'
              },
              updateIntervalMs: {
                type: 'number',
                description: 'Pattern update interval in milliseconds (default: 5000)'
              }
            }
          }
        },
        {
          name: 'pattern_detection_stop',
          description: 'Stop the pattern detection service and get final metrics',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'pattern_detect_commits',
          description: 'Detect patterns in specific commits or recent commits for current session',
          inputSchema: {
            type: 'object',
            properties: {
              commitShas: {
                type: 'array',
                items: { type: 'string' },
                description: 'Specific commit SHAs to analyze (if not provided, uses recent commits)'
              },
              sessionId: {
                type: 'string',
                description: 'Optional session ID (uses current if not specified)'
              },
              projectId: {
                type: 'string',
                description: 'Optional project ID (uses session project if not specified)'
              },
              realTimeMode: {
                type: 'boolean',
                description: 'Use real-time buffered processing (default: false)'
              }
            }
          }
        },
        {
          name: 'pattern_get_session_insights',
          description: 'Get pattern insights for current session',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: 'Optional session ID (uses current if not specified)'
              },
              confidenceThreshold: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'Minimum confidence score for insights (default: 0.5)'
              },
              includeHistorical: {
                type: 'boolean',
                description: 'Include historical insights (default: false)'
              },
              riskLevelFilter: {
                type: 'array',
                items: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                description: 'Filter by risk levels'
              },
              insightTypeFilter: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by insight types'
              }
            }
          }
        },
        {
          name: 'pattern_analyze_project',
          description: 'Get comprehensive pattern analysis for project',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Optional project ID (uses session project if not specified)'
              },
              sessionId: {
                type: 'string',
                description: 'Optional session ID (uses current if not specified)'
              },
              timeRangeHours: {
                type: 'number',
                description: 'Analysis time range in hours (default: 72)'
              },
              includeArchived: {
                type: 'boolean',
                description: 'Include archived patterns (default: false)'
              },
              patternTypes: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by pattern types'
              }
            }
          }
        },
        {
          name: 'pattern_get_alerts',
          description: 'Get real-time pattern alerts for high-risk discoveries',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Optional project ID (uses session project if not specified)'
              },
              sessionId: {
                type: 'string',
                description: 'Optional session ID (uses current if not specified)'
              },
              severityFilter: {
                type: 'array',
                items: { type: 'string', enum: ['info', 'warning', 'error', 'critical'] },
                description: 'Filter by alert severity'
              },
              alertTypeFilter: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by alert types'
              },
              timeRangeHours: {
                type: 'number',
                description: 'Time range in hours (default: 24)'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of alerts (default: 20)'
              }
            }
          }
        },
        {
          name: 'pattern_detection_status',
          description: 'Get pattern detection service status and performance metrics',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'pattern_track_git_activity',
          description: 'Track git activity with automatic pattern detection',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        
        // TC017: Pattern Analysis Tools - Comprehensive pattern intelligence API
        {
          name: 'pattern_get_discovered',
          description: 'Get discovered patterns with advanced filtering and search capabilities',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID to analyze' },
              sessionId: { type: 'string', description: 'Session ID to analyze' },
              patternTypes: { type: 'array', items: { type: 'string' }, description: 'Pattern types to include' },
              confidenceMin: { type: 'number', description: 'Minimum confidence threshold' },
              riskLevelFilter: { type: 'array', items: { type: 'string' }, description: 'Risk levels to filter' },
              timeRangeHours: { type: 'number', description: 'Time range in hours' },
              limit: { type: 'number', description: 'Maximum results to return' },
              offset: { type: 'number', description: 'Result offset for pagination' }
            }
          }
        },
        {
          name: 'pattern_get_trends',
          description: 'Analyze pattern trends over time with forecasting',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID to analyze' },
              patternType: { type: 'string', description: 'Pattern type to analyze trends for' },
              timeRangeDays: { type: 'number', description: 'Time range in days' },
              granularity: { type: 'string', enum: ['hour', 'day', 'week', 'month'], description: 'Time granularity' },
              includeForecasting: { type: 'boolean', description: 'Include trend forecasting' },
              minConfidence: { type: 'number', description: 'Minimum confidence threshold' }
            },
            required: ['patternType']
          }
        },
        {
          name: 'pattern_get_correlations',
          description: 'Find correlations between different pattern types and instances',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID to analyze' },
              pattern1Type: { type: 'string', description: 'First pattern type' },
              pattern2Type: { type: 'string', description: 'Second pattern type' },
              minCorrelationScore: { type: 'number', description: 'Minimum correlation score' },
              timeRangeHours: { type: 'number', description: 'Time range in hours' },
              includeNegativeCorrelations: { type: 'boolean', description: 'Include negative correlations' },
              limit: { type: 'number', description: 'Maximum results to return' }
            }
          }
        },
        {
          name: 'pattern_get_insights',
          description: 'Get actionable pattern insights with advanced filtering',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID to analyze' },
              sessionId: { type: 'string', description: 'Session ID to analyze' },
              insightTypes: { type: 'array', items: { type: 'string' }, description: 'Insight types to include' },
              riskLevelFilter: { type: 'array', items: { type: 'string' }, description: 'Risk levels to filter' },
              confidenceMin: { type: 'number', description: 'Minimum confidence threshold' },
              businessImpactFilter: { type: 'array', items: { type: 'string' }, description: 'Business impact levels' },
              sortBy: { type: 'string', enum: ['confidence', 'risk', 'priority', 'impact', 'created'], description: 'Sort order' },
              limit: { type: 'number', description: 'Maximum results to return' },
              offset: { type: 'number', description: 'Result offset for pagination' }
            }
          }
        },
        {
          name: 'pattern_get_anomalies',
          description: 'Detect pattern anomalies and outliers with statistical analysis',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID to analyze' },
              patternTypes: { type: 'array', items: { type: 'string' }, description: 'Pattern types to analyze' },
              detectionMethod: { type: 'string', enum: ['statistical', 'ml', 'threshold', 'hybrid'], description: 'Detection method' },
              sensitivityLevel: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Detection sensitivity' },
              timeRangeHours: { type: 'number', description: 'Time range in hours' },
              minAnomalyScore: { type: 'number', description: 'Minimum anomaly score threshold' },
              limit: { type: 'number', description: 'Maximum results to return' }
            }
          }
        },
        {
          name: 'pattern_get_recommendations',
          description: 'Generate AI-driven pattern-based recommendations',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID to analyze' },
              sessionId: { type: 'string', description: 'Session ID to analyze' },
              focusAreas: { type: 'array', items: { type: 'string' }, description: 'Areas to focus recommendations on' },
              priorityLevel: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Minimum priority level' },
              implementationCapacity: { type: 'string', enum: ['limited', 'moderate', 'high'], description: 'Implementation capacity' },
              limit: { type: 'number', description: 'Maximum results to return' }
            }
          }
        },
        {
          name: 'pattern_analyze_session',
          description: 'Analyze patterns for specific session context',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session ID to analyze' },
              includeHistorical: { type: 'boolean', description: 'Include historical patterns' },
              timeRangeHours: { type: 'number', description: 'Time range in hours' },
              analysisDepth: { type: 'string', enum: ['basic', 'detailed', 'comprehensive'], description: 'Analysis depth' }
            }
          }
        },
        {
          name: 'pattern_analyze_commit',
          description: 'Analyze patterns for specific git commits with impact analysis',
          inputSchema: {
            type: 'object',
            properties: {
              commitShas: { type: 'array', items: { type: 'string' }, description: 'Git commit SHAs to analyze' },
              projectId: { type: 'string', description: 'Project ID' },
              includeImpactAnalysis: { type: 'boolean', description: 'Include change impact analysis' },
              analysisDepth: { type: 'string', enum: ['basic', 'detailed', 'comprehensive'], description: 'Analysis depth' }
            },
            required: ['commitShas']
          }
        },
        {
          name: 'pattern_get_performance',
          description: 'Get pattern detection system performance metrics and optimization insights',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID to analyze' },
              timeRangeHours: { type: 'number', description: 'Time range in hours' },
              includeOptimizationSuggestions: { type: 'boolean', description: 'Include optimization suggestions' }
            }
          }
        },

        // TT009-2: Phase 2 Metrics Consolidation Tools
        {
          name: 'metrics_collect',
          description: 'Unified metrics collection tool - replaces metrics_collect_project, metrics_get_core_metrics, metrics_get_pattern_intelligence, and metrics_get_productivity_health',
          inputSchema: {
            type: 'object',
            properties: {
              scope: {
                type: 'string',
                enum: ['project', 'core', 'patterns', 'productivity'],
                description: 'Scope of metrics to collect'
              },
              target: {
                type: 'string',
                description: 'Target identifier (usually project ID)'
              },
              options: {
                type: 'object',
                description: 'Scope-specific options',
                properties: {
                  trigger: {
                    type: 'string',
                    enum: ['manual', 'git_commit', 'scheduled', 'pattern_update', 'session_end'],
                    description: 'What triggered this collection (for project scope)'
                  },
                  metricTypes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Specific metric types to retrieve (for core scope)'
                  },
                  intelligenceTypes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Intelligence types to retrieve (for patterns scope)'
                  },
                  productivityTypes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Productivity metrics to retrieve (for productivity scope)'
                  },
                  timeframe: {
                    type: 'string',
                    enum: ['1d', '7d', '30d', '90d'],
                    description: 'Time period for analysis',
                    default: '30d'
                  },
                  developerEmail: {
                    type: 'string',
                    description: 'Specific developer email (for productivity scope)'
                  }
                }
              }
            },
            required: ['scope', 'target']
          }
        },
        {
          name: 'metrics_analyze',
          description: 'Unified metrics analysis tool - replaces metrics_get_dashboard, metrics_get_trends, metrics_aggregate_projects, metrics_aggregate_timeline, metrics_calculate_correlations, and metrics_get_executive_summary',
          inputSchema: {
            type: 'object',
            properties: {
              analysis: {
                type: 'string',
                enum: ['dashboard', 'trends', 'correlations', 'executive', 'aggregate_projects', 'aggregate_timeline'],
                description: 'Type of analysis to perform'
              },
              options: {
                type: 'object',
                description: 'Analysis-specific options',
                properties: {
                  projectId: {
                    type: 'string',
                    description: 'Project ID (required for most analysis types)'
                  },
                  projectIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Multiple project IDs (for aggregate_projects analysis)'
                  },
                  timeframe: {
                    oneOf: [
                      {
                        type: 'string',
                        enum: ['1d', '7d', '30d', '90d', 'all'],
                        description: 'Simple timeframe'
                      },
                      {
                        type: 'object',
                        properties: {
                          startDate: { type: 'string', description: 'ISO date string' },
                          endDate: { type: 'string', description: 'ISO date string' }
                        },
                        description: 'Custom date range'
                      }
                    ],
                    description: 'Time period for analysis'
                  },
                  metricTypes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Specific metric types to analyze'
                  },
                  includeAlerts: {
                    type: 'boolean',
                    description: 'Include alerts in dashboard analysis',
                    default: true
                  },
                  includeTrends: {
                    type: 'boolean',
                    description: 'Include trends in dashboard analysis',
                    default: true
                  },
                  includeForecast: {
                    type: 'boolean',
                    description: 'Include forecasts in trends analysis',
                    default: true
                  },
                  correlationType: {
                    type: 'string',
                    enum: ['pearson', 'spearman', 'kendall'],
                    description: 'Correlation calculation method',
                    default: 'pearson'
                  },
                  metric1: {
                    type: 'object',
                    description: 'First metric for correlation analysis'
                  },
                  metric2: {
                    type: 'object',
                    description: 'Second metric for correlation analysis'
                  },
                  aggregationType: {
                    type: 'string',
                    enum: ['sum', 'average', 'median', 'percentile', 'count', 'min', 'max'],
                    description: 'Aggregation method for project aggregation',
                    default: 'average'
                  },
                  period: {
                    type: 'string',
                    enum: ['daily', 'weekly', 'monthly', 'quarterly'],
                    description: 'Period for timeline aggregation',
                    default: 'daily'
                  },
                  granularity: {
                    type: 'string',
                    enum: ['hour', 'day', 'week', 'month'],
                    description: 'Granularity for timeline aggregation',
                    default: 'day'
                  }
                }
              }
            },
            required: ['analysis']
          }
        },
        {
          name: 'metrics_control',
          description: 'TT009-2-3: Unified metrics control tool - collection management, alerts, performance, export',
          inputSchema: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                enum: ['start', 'stop', 'alerts', 'acknowledge', 'resolve', 'performance', 'export'],
                description: 'Control operation to perform'
              },
              options: {
                type: 'object',
                description: 'Operation-specific options',
                properties: {
                  // Start operation options
                  projectId: {
                    type: 'string',
                    description: 'Project ID (for start/alerts/export operations)'
                  },
                  sessionId: {
                    type: 'string',
                    description: 'Session ID (for start operation)'
                  },
                  intervalMs: {
                    type: 'number',
                    description: 'Collection interval in milliseconds (for start operation)',
                    default: 300000
                  },
                  autoCollectGit: {
                    type: 'boolean',
                    description: 'Enable automatic git correlation (for start operation)',
                    default: true
                  },
                  // Stop operation options
                  gracefulShutdown: {
                    type: 'boolean',
                    description: 'Graceful shutdown flag (for stop operation)',
                    default: true
                  },
                  collectFinalMetrics: {
                    type: 'boolean',
                    description: 'Collect final metrics before stopping (for stop operation)',
                    default: true
                  },
                  // Alerts operation options
                  severity: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Alert severity levels to include (for alerts operation)',
                    default: ['low', 'medium', 'high', 'critical']
                  },
                  status: {
                    type: 'string',
                    description: 'Alert status filter (for alerts operation)',
                    default: 'active'
                  },
                  limit: {
                    type: 'number',
                    description: 'Maximum number of alerts to return (for alerts operation)',
                    default: 50
                  },
                  includeResolved: {
                    type: 'boolean',
                    description: 'Include resolved alerts (for alerts operation)',
                    default: false
                  },
                  // Acknowledge/Resolve operation options
                  alertId: {
                    type: 'string',
                    description: 'Alert ID (for acknowledge/resolve operations)'
                  },
                  acknowledgedBy: {
                    type: 'string',
                    description: 'Who acknowledged the alert (for acknowledge operation)',
                    default: 'ai'
                  },
                  resolvedBy: {
                    type: 'string',
                    description: 'Who resolved the alert (for resolve operation)',
                    default: 'ai'
                  },
                  notes: {
                    type: 'string',
                    description: 'Acknowledgment notes (for acknowledge operation)'
                  },
                  resolution: {
                    type: 'string',
                    description: 'Resolution description (for resolve operation)'
                  },
                  resolutionNotes: {
                    type: 'string',
                    description: 'Resolution notes (for resolve operation)'
                  },
                  // Performance operation options
                  timeframe: {
                    type: 'string',
                    description: 'Performance timeframe (for performance operation)',
                    default: '1h'
                  },
                  includeSystemMetrics: {
                    type: 'boolean',
                    description: 'Include system performance metrics (for performance operation)',
                    default: true
                  },
                  includeQueueMetrics: {
                    type: 'boolean',
                    description: 'Include queue performance metrics (for performance operation)',
                    default: true
                  },
                  // Export operation options
                  format: {
                    type: 'string',
                    enum: ['json', 'csv'],
                    description: 'Export format (for export operation)',
                    default: 'json'
                  },
                  dateRange: {
                    type: 'object',
                    description: 'Date range for export (for export operation)',
                    properties: {
                      startDate: { type: 'string', format: 'date-time' },
                      endDate: { type: 'string', format: 'date-time' }
                    }
                  },
                  metricTypes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Metric types to export (for export operation)',
                    default: []
                  },
                  includeMetadata: {
                    type: 'boolean',
                    description: 'Include metadata in export (for export operation)',
                    default: true
                  },
                  compressionLevel: {
                    type: 'string',
                    enum: ['none', 'low', 'medium', 'high'],
                    description: 'Compression level for export (for export operation)',
                    default: 'none'
                  }
                }
              }
            },
            required: ['operation']
          }
        },
        {
          name: 'pattern_analyze',
          description: 'TT009-3-1: Unified pattern analysis tool - detection, analysis, tracking operations',
          inputSchema: {
            type: 'object',
            properties: {
              target: {
                type: 'string',
                enum: ['project', 'session', 'commit', 'git', 'service'],
                description: 'Analysis target type'
              },
              action: {
                type: 'string',
                enum: ['start', 'stop', 'status', 'analyze', 'detect', 'track', 'discovered', 'performance'],
                description: 'Analysis action to perform'
              },
              options: {
                type: 'object',
                description: 'Target and action-specific options',
                properties: {
                  // Service operations
                  enableRealTime: {
                    type: 'boolean',
                    description: 'Enable real-time detection (for service operations)',
                    default: true
                  },
                  enableBatchProcessing: {
                    type: 'boolean',
                    description: 'Enable batch processing (for service operations)',
                    default: true
                  },
                  detectionTimeoutMs: {
                    type: 'number',
                    description: 'Detection timeout in milliseconds (for service operations)',
                    default: 30000
                  },
                  updateIntervalMs: {
                    type: 'number',
                    description: 'Update interval in milliseconds (for service operations)',
                    default: 5000
                  },
                  // Project analysis
                  projectId: {
                    type: 'string',
                    description: 'Project ID (for project/git operations)'
                  },
                  includeGitPatterns: {
                    type: 'boolean',
                    description: 'Include git patterns (for project analysis)',
                    default: true
                  },
                  includeSessionPatterns: {
                    type: 'boolean',
                    description: 'Include session patterns (for project analysis)',
                    default: true
                  },
                  includeHistoricalData: {
                    type: 'boolean',
                    description: 'Include historical data (for project analysis)',
                    default: true
                  },
                  analysisDepth: {
                    type: 'string',
                    enum: ['basic', 'comprehensive', 'deep'],
                    description: 'Analysis depth level (for project analysis)',
                    default: 'comprehensive'
                  },
                  patternTypes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Pattern types to analyze (for various operations)',
                    default: ['all']
                  },
                  // Session analysis
                  sessionId: {
                    type: 'string',
                    description: 'Session ID (for session operations)'
                  },
                  includeContextPatterns: {
                    type: 'boolean',
                    description: 'Include context patterns (for session analysis)',
                    default: true
                  },
                  includeTimePatterns: {
                    type: 'boolean',
                    description: 'Include time patterns (for session analysis)',
                    default: true
                  },
                  includeActivityPatterns: {
                    type: 'boolean',
                    description: 'Include activity patterns (for session analysis)',
                    default: true
                  },
                  confidenceThreshold: {
                    type: 'number',
                    description: 'Confidence threshold (for session analysis)',
                    default: 0.7
                  },
                  // Commit analysis
                  commitSha: {
                    type: 'string',
                    description: 'Commit SHA (for single commit analysis)'
                  },
                  commitShas: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Commit SHAs (for multiple commit detection)'
                  },
                  includeImpactAnalysis: {
                    type: 'boolean',
                    description: 'Include impact analysis (for commit analysis)',
                    default: true
                  },
                  includeFilePatterns: {
                    type: 'boolean',
                    description: 'Include file patterns (for commit operations)',
                    default: true
                  },
                  includeChangePatterns: {
                    type: 'boolean',
                    description: 'Include change patterns (for commit operations)',
                    default: true
                  },
                  maxCommits: {
                    type: 'number',
                    description: 'Maximum commits to analyze (for commit detection)',
                    default: 10
                  },
                  // Git tracking
                  enableRealTimeTracking: {
                    type: 'boolean',
                    description: 'Enable real-time git tracking (for git operations)',
                    default: true
                  },
                  trackingIntervalMs: {
                    type: 'number',
                    description: 'Tracking interval in milliseconds (for git operations)',
                    default: 30000
                  },
                  minConfidence: {
                    type: 'number',
                    description: 'Minimum confidence score (for various operations)',
                    default: 0.6
                  },
                  includeMetadata: {
                    type: 'boolean',
                    description: 'Include metadata (for discovered patterns)',
                    default: true
                  },
                  limitResults: {
                    type: 'number',
                    description: 'Limit number of results (for discovered patterns)',
                    default: 100
                  }
                }
              }
            },
            required: ['target', 'action']
          }
        },
        {
          name: 'pattern_insights',
          description: 'TT009-3-2: Unified pattern insights tool - insights, correlations, recommendations, alerts',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['alerts', 'session', 'insights', 'trends', 'correlations', 'anomalies', 'recommendations'],
                description: 'Type of insight to retrieve'
              },
              options: {
                type: 'object',
                description: 'Type-specific options',
                properties: {
                  // General options
                  projectId: {
                    type: 'string',
                    description: 'Project ID (for various operations)'
                  },
                  sessionId: {
                    type: 'string',
                    description: 'Session ID (for various operations)'
                  },
                  // Alerts options
                  severity: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Alert severity levels (for alerts)',
                    default: ['medium', 'high', 'critical']
                  },
                  status: {
                    type: 'string',
                    description: 'Alert status filter (for alerts)',
                    default: 'active'
                  },
                  limit: {
                    type: 'number',
                    description: 'Maximum results to return (for various operations)',
                    default: 50
                  },
                  includeResolved: {
                    type: 'boolean',
                    description: 'Include resolved alerts (for alerts)',
                    default: false
                  },
                  // Session insights options
                  includeContextPatterns: {
                    type: 'boolean',
                    description: 'Include context patterns (for session insights)',
                    default: true
                  },
                  includeActivityPatterns: {
                    type: 'boolean',
                    description: 'Include activity patterns (for session insights)',
                    default: true
                  },
                  includeTimePatterns: {
                    type: 'boolean',
                    description: 'Include time patterns (for session insights)',
                    default: true
                  },
                  minConfidence: {
                    type: 'number',
                    description: 'Minimum confidence score (for various operations)',
                    default: 0.6
                  },
                  // Actionable insights options
                  patternTypes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Pattern types to analyze (for various operations)',
                    default: ['all']
                  },
                  riskLevels: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Risk levels to include (for insights)',
                    default: ['medium', 'high', 'critical']
                  },
                  maxAge: {
                    type: 'string',
                    description: 'Maximum age of patterns (for insights)',
                    default: '30d'
                  },
                  includeRecommendations: {
                    type: 'boolean',
                    description: 'Include recommendations (for insights)',
                    default: true
                  },
                  limitResults: {
                    type: 'number',
                    description: 'Limit number of results (for insights)',
                    default: 100
                  },
                  // Trends options
                  timeframe: {
                    type: 'string',
                    description: 'Analysis timeframe (for trends/correlations)',
                    default: '30d'
                  },
                  includeForecast: {
                    type: 'boolean',
                    description: 'Include forecast data (for trends)',
                    default: true
                  },
                  forecastPeriods: {
                    type: 'number',
                    description: 'Number of forecast periods (for trends)',
                    default: 7
                  },
                  granularity: {
                    type: 'string',
                    enum: ['hourly', 'daily', 'weekly'],
                    description: 'Data granularity (for trends)',
                    default: 'daily'
                  },
                  smoothing: {
                    type: 'string',
                    enum: ['none', 'moving_average', 'exponential'],
                    description: 'Smoothing method (for trends)',
                    default: 'moving_average'
                  },
                  // Correlations options
                  patternType1: {
                    type: 'string',
                    description: 'First pattern type (for correlations)'
                  },
                  patternType2: {
                    type: 'string',
                    description: 'Second pattern type (for correlations)'
                  },
                  correlationType: {
                    type: 'string',
                    enum: ['pearson', 'spearman', 'kendall'],
                    description: 'Correlation method (for correlations)',
                    default: 'pearson'
                  },
                  includeLagAnalysis: {
                    type: 'boolean',
                    description: 'Include lag analysis (for correlations)',
                    default: false
                  },
                  maxLag: {
                    type: 'number',
                    description: 'Maximum lag periods (for correlations)',
                    default: 7
                  },
                  // Anomalies options
                  detectionMethod: {
                    type: 'string',
                    enum: ['statistical', 'isolation_forest', 'one_class_svm'],
                    description: 'Anomaly detection method (for anomalies)',
                    default: 'statistical'
                  },
                  sensitivityLevel: {
                    type: 'string',
                    enum: ['low', 'medium', 'high'],
                    description: 'Detection sensitivity (for anomalies)',
                    default: 'medium'
                  },
                  includeContext: {
                    type: 'boolean',
                    description: 'Include contextual information (for anomalies)',
                    default: true
                  },
                  // Recommendations options
                  contextType: {
                    type: 'string',
                    enum: ['development', 'quality', 'performance', 'security'],
                    description: 'Recommendation context (for recommendations)',
                    default: 'development'
                  },
                  includeActionItems: {
                    type: 'boolean',
                    description: 'Include action items (for recommendations)',
                    default: true
                  },
                  includePrioritization: {
                    type: 'boolean',
                    description: 'Include prioritization (for recommendations)',
                    default: true
                  },
                  includeRiskAssessment: {
                    type: 'boolean',
                    description: 'Include risk assessment (for recommendations)',
                    default: true
                  },
                  maxRecommendations: {
                    type: 'number',
                    description: 'Maximum recommendations (for recommendations)',
                    default: 20
                  }
                }
              }
            },
            required: ['type']
          }
        },

        // Development Metrics Tools - TC014: Comprehensive metrics collection system (to be consolidated)
        {
          name: 'metrics_collect_project',
          description: 'Trigger comprehensive metrics collection for a project',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Project ID to collect metrics for'
              },
              trigger: {
                type: 'string',
                enum: ['manual', 'git_commit', 'scheduled', 'pattern_update', 'session_end'],
                description: 'What triggered this collection',
                default: 'manual'
              },
              startDate: {
                type: 'string',
                description: 'Analysis start date (ISO format), defaults to 30 days ago'
              },
              endDate: {
                type: 'string',
                description: 'Analysis end date (ISO format), defaults to now'
              }
            },
            required: ['projectId']
          }
        },
        {
          name: 'metrics_get_dashboard',
          description: 'Get comprehensive project metrics dashboard data',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Project ID to get dashboard for'
              },
              timeframe: {
                type: 'string',
                enum: ['1d', '7d', '30d', '90d', 'all'],
                description: 'Time period for metrics',
                default: '30d'
              },
              includeAlerts: {
                type: 'boolean',
                description: 'Include active alerts in response',
                default: true
              },
              includeTrends: {
                type: 'boolean',
                description: 'Include trend analysis',
                default: true
              }
            },
            required: ['projectId']
          }
        },
        {
          name: 'metrics_get_core_metrics',
          description: 'Get detailed core development metrics (velocity, quality, debt)',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Project ID'
              },
              metricTypes: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['code_velocity', 'development_focus', 'change_frequency', 'volatility_index', 'technical_debt_accumulation', 'quality_trend']
                },
                description: 'List of specific metrics to retrieve'
              },
              timeframe: {
                type: 'string',
                enum: ['1d', '7d', '30d', '90d', 'all'],
                description: 'Time period for metrics',
                default: '30d'
              },
              includeDetails: {
                type: 'boolean',
                description: 'Include detailed breakdown and analysis',
                default: false
              }
            },
            required: ['projectId']
          }
        },
        {
          name: 'metrics_get_pattern_intelligence',
          description: 'Get pattern-based intelligence metrics',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Project ID'
              },
              analysisDepth: {
                type: 'string',
                enum: ['basic', 'detailed', 'comprehensive'],
                description: 'Level of pattern analysis',
                default: 'detailed'
              },
              timeframe: {
                type: 'string',
                enum: ['1d', '7d', '30d', '90d', 'all'],
                description: 'Time period for analysis',
                default: '30d'
              }
            },
            required: ['projectId']
          }
        },
        {
          name: 'metrics_get_productivity_health',
          description: 'Get developer productivity and health metrics',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Project ID'
              },
              includeTeamMetrics: {
                type: 'boolean',
                description: 'Include team-wide metrics',
                default: true
              },
              timeframe: {
                type: 'string',
                enum: ['1d', '7d', '30d', '90d', 'all'],
                description: 'Time period for metrics',
                default: '30d'
              }
            },
            required: ['projectId']
          }
        },
        {
          name: 'metrics_get_alerts',
          description: 'Get active metrics alerts and notifications',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Project ID to get alerts for'
              },
              severity: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical'],
                description: 'Filter by alert severity'
              },
              category: {
                type: 'string',
                enum: ['performance', 'quality', 'debt', 'velocity', 'complexity'],
                description: 'Filter by alert category'
              },
              includeResolved: {
                type: 'boolean',
                description: 'Include resolved alerts',
                default: false
              }
            },
            required: ['projectId']
          }
        },
        {
          name: 'metrics_acknowledge_alert',
          description: 'Acknowledge a metrics alert',
          inputSchema: {
            type: 'object',
            properties: {
              alertId: {
                type: 'string',
                description: 'Alert ID to acknowledge'
              },
              message: {
                type: 'string',
                description: 'Acknowledgment message'
              }
            },
            required: ['alertId']
          }
        },
        {
          name: 'metrics_resolve_alert',
          description: 'Mark a metrics alert as resolved',
          inputSchema: {
            type: 'object',
            properties: {
              alertId: {
                type: 'string',
                description: 'Alert ID to resolve'
              },
              resolution: {
                type: 'string',
                description: 'Description of how the alert was resolved'
              }
            },
            required: ['alertId', 'resolution']
          }
        },
        {
          name: 'metrics_get_trends',
          description: 'Get metrics trends and forecasting data',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Project ID'
              },
              metricTypes: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of metric types to analyze for trends'
              },
              timeframe: {
                type: 'string',
                enum: ['7d', '30d', '90d', '180d', '1y'],
                description: 'Time period for trend analysis',
                default: '30d'
              },
              includeForecast: {
                type: 'boolean',
                description: 'Include forecasting projections',
                default: true
              }
            },
            required: ['projectId']
          }
        },
        {
          name: 'metrics_get_performance',
          description: 'Get metrics collection system performance statistics',
          inputSchema: {
            type: 'object',
            properties: {
              includeDetailedStats: {
                type: 'boolean',
                description: 'Include detailed performance breakdown',
                default: false
              },
              timeframe: {
                type: 'string',
                enum: ['1h', '24h', '7d', '30d'],
                description: 'Time period for performance stats',
                default: '24h'
              }
            }
          }
        },
        {
          name: 'metrics_start_collection',
          description: 'Start the metrics collection service',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Project ID to start collection for (optional, starts for all if not specified)'
              },
              collectionMode: {
                type: 'string',
                enum: ['real_time', 'batch', 'hybrid'],
                description: 'Collection mode',
                default: 'hybrid'
              }
            }
          }
        },
        {
          name: 'metrics_stop_collection',
          description: 'Stop the metrics collection service',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Project ID to stop collection for (optional, stops all if not specified)'
              },
              graceful: {
                type: 'boolean',
                description: 'Perform graceful shutdown',
                default: true
              }
            }
          }
        },
        
        // TC018: Metrics Aggregation Tools - Advanced aggregation and correlation analysis
        {
          name: 'metrics_aggregate_projects',
          description: 'Aggregate metrics across multiple projects with various aggregation types',
          inputSchema: {
            type: 'object',
            properties: {
              projectIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of project IDs to aggregate metrics from'
              },
              timeframe: {
                type: 'object',
                properties: {
                  startDate: { type: 'string', description: 'Start date (ISO format)' },
                  endDate: { type: 'string', description: 'End date (ISO format)' }
                },
                required: ['startDate', 'endDate'],
                description: 'Time period for aggregation'
              },
              metricTypes: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of metric types to include (e.g., code_velocity, technical_debt_accumulation)'
              },
              aggregationType: {
                type: 'string',
                enum: ['sum', 'average', 'median', 'percentile', 'count', 'min', 'max'],
                description: 'Type of aggregation to perform'
              },
              percentileValue: {
                type: 'number',
                description: 'Percentile value (0-100) for percentile aggregation'
              },
              groupBy: {
                type: 'string',
                enum: ['project', 'metric_type', 'time_period', 'scope'],
                description: 'How to group the aggregated results'
              },
              includeConfidenceMetrics: {
                type: 'boolean',
                description: 'Include confidence intervals and statistical measures'
              }
            },
            required: ['projectIds', 'timeframe', 'metricTypes', 'aggregationType']
          }
        },
        {
          name: 'metrics_aggregate_timeline',
          description: 'Aggregate metrics over time with specified granularity and smoothing',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Project ID to analyze'
              },
              period: {
                type: 'string',
                enum: ['daily', 'weekly', 'monthly', 'quarterly'],
                description: 'Aggregation period'
              },
              granularity: {
                type: 'string',
                enum: ['hour', 'day', 'week', 'month'],
                description: 'Time granularity for data points'
              },
              metricTypes: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of metric types to include (optional, all if not specified)'
              },
              timeframe: {
                type: 'object',
                properties: {
                  startDate: { type: 'string', description: 'Start date (ISO format)' },
                  endDate: { type: 'string', description: 'End date (ISO format)' }
                },
                required: ['startDate', 'endDate'],
                description: 'Time period for analysis'
              },
              fillGaps: {
                type: 'boolean',
                description: 'Fill missing time periods with interpolated values'
              },
              smoothing: {
                type: 'string',
                enum: ['none', 'moving_average', 'exponential'],
                description: 'Smoothing algorithm to apply'
              },
              windowSize: {
                type: 'number',
                description: 'Window size for smoothing algorithms'
              }
            },
            required: ['projectId', 'period', 'granularity', 'timeframe']
          }
        },
        {
          name: 'metrics_calculate_correlations',
          description: 'Calculate correlations and relationships between metrics with advanced analysis',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Project ID to analyze'
              },
              metric1: {
                type: 'object',
                properties: {
                  type: { type: 'string', description: 'First metric type' },
                  scope: { type: 'string', description: 'First metric scope (optional)' }
                },
                required: ['type'],
                description: 'First metric for correlation analysis'
              },
              metric2: {
                type: 'object',
                properties: {
                  type: { type: 'string', description: 'Second metric type' },
                  scope: { type: 'string', description: 'Second metric scope (optional)' }
                },
                required: ['type'],
                description: 'Second metric for correlation analysis'
              },
              timeframe: {
                type: 'object',
                properties: {
                  startDate: { type: 'string', description: 'Start date (ISO format)' },
                  endDate: { type: 'string', description: 'End date (ISO format)' }
                },
                required: ['startDate', 'endDate'],
                description: 'Time period for analysis'
              },
              correlationType: {
                type: 'string',
                enum: ['pearson', 'spearman', 'kendall'],
                description: 'Type of correlation analysis (default: pearson)'
              },
              includeLagAnalysis: {
                type: 'boolean',
                description: 'Include lag correlation analysis'
              },
              maxLag: {
                type: 'number',
                description: 'Maximum lag periods to analyze'
              },
              includeLeadingIndicators: {
                type: 'boolean',
                description: 'Detect leading indicators'
              },
              includePerformanceDrivers: {
                type: 'boolean',
                description: 'Identify performance drivers'
              }
            },
            required: ['projectId', 'metric1', 'metric2', 'timeframe']
          }
        },
        {
          name: 'metrics_get_executive_summary',
          description: 'Generate comprehensive executive summary with key insights and recommendations',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Project ID to analyze'
              },
              dateRange: {
                type: 'object',
                properties: {
                  startDate: { type: 'string', description: 'Start date (ISO format)' },
                  endDate: { type: 'string', description: 'End date (ISO format)' }
                },
                required: ['startDate', 'endDate'],
                description: 'Analysis period'
              },
              includeForecasts: {
                type: 'boolean',
                description: 'Include predictive forecasts'
              },
              includeRiskAssessment: {
                type: 'boolean',
                description: 'Include risk assessment'
              },
              includeRecommendations: {
                type: 'boolean',
                description: 'Include actionable recommendations'
              },
              compareToBaseline: {
                type: 'boolean',
                description: 'Compare to historical baseline'
              },
              baselinePeriodDays: {
                type: 'number',
                description: 'Number of days for baseline comparison period'
              }
            },
            required: ['projectId', 'dateRange']
          }
        },
        {
          name: 'metrics_export_data',
          description: 'Export aggregated metrics data in various formats (CSV, JSON, Excel)',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Project ID to export data from'
              },
              exportType: {
                type: 'string',
                enum: ['csv', 'json', 'excel'],
                description: 'Export format'
              },
              metricTypes: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of metric types to export (optional, all if not specified)'
              },
              timeframe: {
                type: 'object',
                properties: {
                  startDate: { type: 'string', description: 'Start date (ISO format)' },
                  endDate: { type: 'string', description: 'End date (ISO format)' }
                },
                required: ['startDate', 'endDate'],
                description: 'Time period for export'
              },
              aggregationType: {
                type: 'string',
                enum: ['raw', 'daily', 'weekly', 'monthly'],
                description: 'Aggregation level for export data'
              },
              includeMetadata: {
                type: 'boolean',
                description: 'Include statistical metadata in export'
              },
              includeCorrelations: {
                type: 'boolean',
                description: 'Include correlation analysis in export'
              }
            },
            required: ['projectId', 'exportType', 'timeframe']
          }
        },

        // Code Complexity Tools - TC015: Multi-dimensional complexity tracking system
        {
          name: 'complexity_analyze',
          description: 'Unified complexity analysis tool - replaces complexity_analyze_files, complexity_analyze_commit, complexity_get_file_metrics, and complexity_get_function_metrics',
          inputSchema: {
            type: 'object',
            properties: {
              target: {
                oneOf: [
                  { type: 'string' },
                  { type: 'array', items: { type: 'string' } }
                ],
                description: 'Target for analysis - file path(s), commit hash(es), or function identifier'
              },
              type: {
                type: 'string',
                enum: ['file', 'files', 'commit', 'function'],
                description: 'Type of analysis to perform'
              },
              options: {
                type: 'object',
                properties: {
                  projectId: {
                    type: 'string',
                    description: 'Project ID for context (auto-detected if not provided)'
                  },
                  trigger: {
                    type: 'string',
                    enum: ['manual', 'git_commit', 'scheduled', 'threshold_breach', 'batch_analysis'],
                    description: 'Analysis trigger source',
                    default: 'manual'
                  },
                  includeMetrics: {
                    type: 'array',
                    items: {
                      type: 'string',
                      enum: ['cyclomatic', 'cognitive', 'halstead', 'dependency', 'all']
                    },
                    description: 'Specific complexity metrics to include',
                    default: ['all']
                  },
                  functionOptions: {
                    type: 'object',
                    properties: {
                      className: {
                        type: 'string',
                        description: 'Class name containing the function'
                      },
                      functionSignature: {
                        type: 'string',
                        description: 'Function signature to match'
                      },
                      lineRange: {
                        type: 'object',
                        properties: {
                          start: { type: 'number' },
                          end: { type: 'number' }
                        },
                        description: 'Line range for analysis'
                      }
                    },
                    description: 'Function-specific options (when type = function)'
                  },
                  fileOptions: {
                    type: 'object',
                    properties: {
                      includeDetailedMetrics: {
                        type: 'boolean',
                        description: 'Include detailed function-level metrics'
                      },
                      excludeTests: {
                        type: 'boolean',
                        description: 'Exclude test files from analysis'
                      },
                      excludePatterns: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Custom file patterns to exclude'
                      }
                    },
                    description: 'File analysis options (when type = file/files)'
                  },
                  commitOptions: {
                    type: 'object',
                    properties: {
                      compareWith: {
                        type: 'string',
                        description: 'Compare against specific commit (default: previous commit)'
                      },
                      includeImpactAnalysis: {
                        type: 'boolean',
                        description: 'Include impact analysis'
                      },
                      changedFilesOnly: {
                        type: 'boolean',
                        description: 'Only analyze changed files'
                      }
                    },
                    description: 'Commit analysis options (when type = commit)'
                  },
                  format: {
                    type: 'object',
                    properties: {
                      includeRawMetrics: {
                        type: 'boolean',
                        description: 'Include raw metrics data'
                      },
                      includeChartData: {
                        type: 'boolean',
                        description: 'Include visualization data'
                      },
                      groupBy: {
                        type: 'string',
                        enum: ['file', 'function', 'class', 'none'],
                        description: 'Group results by file/function/class'
                      }
                    },
                    description: 'Output formatting options'
                  }
                },
                description: 'Optional analysis configuration'
              }
            },
            required: ['target', 'type']
          }
        },
        {
          name: 'complexity_insights',
          description: 'Unified complexity insights tool - replaces complexity_get_dashboard, complexity_get_hotspots, complexity_get_trends, complexity_get_technical_debt, and complexity_get_refactoring_opportunities',
          inputSchema: {
            type: 'object',
            properties: {
              view: {
                type: 'string',
                enum: ['dashboard', 'hotspots', 'trends', 'debt', 'refactoring'],
                description: 'Type of insights to retrieve'
              },
              filters: {
                type: 'object',
                properties: {
                  projectId: {
                    type: 'string',
                    description: 'Project ID for scoping'
                  },
                  timeRange: {
                    type: 'object',
                    properties: {
                      startDate: { type: 'string', description: 'ISO date string' },
                      endDate: { type: 'string', description: 'ISO date string' },
                      period: {
                        type: 'string',
                        enum: ['day', 'week', 'month', 'quarter', 'year'],
                        description: 'Time period for trends and historical data'
                      }
                    },
                    description: 'Time range for trends and historical data'
                  },
                  thresholds: {
                    type: 'object',
                    properties: {
                      minComplexity: { type: 'number', minimum: 0, description: 'Minimum complexity threshold' },
                      maxComplexity: { type: 'number', minimum: 0, description: 'Maximum complexity threshold' },
                      riskLevels: {
                        type: 'array',
                        items: {
                          type: 'string',
                          enum: ['very_low', 'low', 'moderate', 'high', 'very_high', 'critical']
                        },
                        description: 'Risk levels to filter by'
                      }
                    },
                    description: 'Complexity thresholds for filtering'
                  },
                  dashboardOptions: {
                    type: 'object',
                    properties: {
                      includeHotspots: { type: 'boolean', description: 'Include hotspots in dashboard' },
                      includeAlerts: { type: 'boolean', description: 'Include alerts in dashboard' },
                      includeOpportunities: { type: 'boolean', description: 'Include refactoring opportunities' },
                      includeTrends: { type: 'boolean', description: 'Include trend indicators' }
                    },
                    description: 'Dashboard-specific options'
                  },
                  hotspotOptions: {
                    type: 'object',
                    properties: {
                      minHotspotScore: { type: 'number', minimum: 0, maximum: 1, description: 'Minimum hotspot score (0-1)' },
                      hotspotTypes: {
                        type: 'array',
                        items: {
                          type: 'string',
                          enum: ['high_complexity', 'frequent_changes', 'combined_risk', 'coupling_hotspot']
                        },
                        description: 'Types of hotspots to detect'
                      },
                      limit: { type: 'number', minimum: 1, description: 'Maximum number of hotspots to return' },
                      sortBy: {
                        type: 'string',
                        enum: ['complexity', 'change_frequency', 'hotspot_score', 'risk_level'],
                        description: 'Sort order for hotspots'
                      }
                    },
                    description: 'Hotspots-specific options'
                  },
                  trendsOptions: {
                    type: 'object',
                    properties: {
                      metrics: {
                        type: 'array',
                        items: {
                          type: 'string',
                          enum: ['cyclomatic', 'cognitive', 'halstead', 'coupling', 'maintainability']
                        },
                        description: 'Metrics to include in trend analysis'
                      },
                      includeForecast: { type: 'boolean', description: 'Include forecasting data' },
                      forecastPeriods: { type: 'number', minimum: 1, description: 'Number of periods to forecast' }
                    },
                    description: 'Trends-specific options'
                  },
                  debtOptions: {
                    type: 'object',
                    properties: {
                      calculationMethod: {
                        type: 'string',
                        enum: ['conservative', 'aggressive', 'balanced'],
                        description: 'Debt calculation method'
                      },
                      includeRemediation: { type: 'boolean', description: 'Include remediation estimates' },
                      groupBy: {
                        type: 'string',
                        enum: ['file', 'function', 'class', 'component', 'severity'],
                        description: 'Group debt by category'
                      }
                    },
                    description: 'Technical debt-specific options'
                  },
                  refactoringOptions: {
                    type: 'object',
                    properties: {
                      minRoiScore: { type: 'number', minimum: 0, description: 'Minimum ROI score for opportunities' },
                      maxEffortHours: { type: 'number', minimum: 1, description: 'Maximum effort hours to consider' },
                      opportunityTypes: {
                        type: 'array',
                        items: {
                          type: 'string',
                          enum: ['extract_method', 'split_function', 'reduce_nesting', 'eliminate_duplication', 'simplify_conditionals', 'reduce_parameters', 'break_dependencies', 'improve_cohesion']
                        },
                        description: 'Opportunity types to include'
                      },
                      sortBy: {
                        type: 'string',
                        enum: ['priority', 'roi', 'effort', 'complexity_reduction'],
                        description: 'Sort opportunities by priority'
                      },
                      limit: { type: 'number', minimum: 1, description: 'Maximum number of opportunities to return' }
                    },
                    description: 'Refactoring-specific options'
                  }
                },
                description: 'Optional insight configuration filters'
              }
            },
            required: ['view']
          }
        },
        {
          name: 'complexity_manage',
          description: 'Unified complexity management tool - replaces complexity_start_tracking, complexity_stop_tracking, complexity_get_alerts, complexity_acknowledge_alert, complexity_resolve_alert, complexity_set_thresholds, and complexity_get_performance',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['start', 'stop', 'alerts', 'acknowledge', 'resolve', 'thresholds', 'performance'],
                description: 'Management action to perform'
              },
              params: {
                type: 'object',
                properties: {
                  projectId: {
                    type: 'string',
                    description: 'Project ID for scoping operations'
                  },
                  alertParams: {
                    type: 'object',
                    properties: {
                      alertId: {
                        type: 'string',
                        description: 'Alert ID for acknowledge/resolve actions'
                      },
                      alertIds: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Multiple alert IDs for batch operations'
                      },
                      notes: {
                        type: 'string',
                        description: 'Acknowledgment/resolution notes'
                      },
                      userId: {
                        type: 'string',
                        description: 'User performing the action'
                      },
                      filters: {
                        type: 'object',
                        properties: {
                          severity: {
                            type: 'array',
                            items: {
                              type: 'string',
                              enum: ['info', 'warning', 'error', 'critical']
                            },
                            description: 'Filter alerts by severity'
                          },
                          type: {
                            type: 'array',
                            items: {
                              type: 'string',
                              enum: ['threshold_exceeded', 'complexity_regression', 'hotspot_detected', 'technical_debt_spike']
                            },
                            description: 'Filter alerts by type'
                          },
                          filePath: {
                            type: 'string',
                            description: 'Filter alerts by file path'
                          },
                          dateRange: {
                            type: 'object',
                            properties: {
                              startDate: { type: 'string', description: 'Start date (ISO format)' },
                              endDate: { type: 'string', description: 'End date (ISO format)' }
                            },
                            description: 'Filter alerts by date range'
                          }
                        },
                        description: 'Filter criteria for alerts'
                      }
                    },
                    description: 'Alert management parameters'
                  },
                  thresholdParams: {
                    type: 'object',
                    properties: {
                      cyclomaticComplexityThresholds: {
                        type: 'object',
                        properties: {
                          low: { type: 'number', minimum: 1, description: 'Low complexity threshold' },
                          moderate: { type: 'number', minimum: 1, description: 'Moderate complexity threshold' },
                          high: { type: 'number', minimum: 1, description: 'High complexity threshold' },
                          veryHigh: { type: 'number', minimum: 1, description: 'Very high complexity threshold' },
                          critical: { type: 'number', minimum: 1, description: 'Critical complexity threshold' }
                        },
                        description: 'Cyclomatic complexity thresholds'
                      },
                      cognitiveComplexityThresholds: {
                        type: 'object',
                        properties: {
                          low: { type: 'number', minimum: 1 },
                          moderate: { type: 'number', minimum: 1 },
                          high: { type: 'number', minimum: 1 },
                          veryHigh: { type: 'number', minimum: 1 },
                          critical: { type: 'number', minimum: 1 }
                        },
                        description: 'Cognitive complexity thresholds'
                      },
                      halsteadEffortThresholds: {
                        type: 'object',
                        properties: {
                          low: { type: 'number', minimum: 1 },
                          moderate: { type: 'number', minimum: 1 },
                          high: { type: 'number', minimum: 1 },
                          veryHigh: { type: 'number', minimum: 1 },
                          critical: { type: 'number', minimum: 1 }
                        },
                        description: 'Halstead effort thresholds'
                      },
                      couplingThresholds: {
                        type: 'object',
                        properties: {
                          low: { type: 'number', minimum: 0, maximum: 1 },
                          moderate: { type: 'number', minimum: 0, maximum: 1 },
                          high: { type: 'number', minimum: 0, maximum: 1 },
                          veryHigh: { type: 'number', minimum: 0, maximum: 1 },
                          critical: { type: 'number', minimum: 0, maximum: 1 }
                        },
                        description: 'Coupling thresholds'
                      },
                      alertConfiguration: {
                        type: 'object',
                        properties: {
                          alertOnThresholdBreach: { type: 'boolean', description: 'Enable threshold breach alerts' },
                          alertOnComplexityRegression: { type: 'number', minimum: 5, maximum: 100, description: 'Percentage increase to trigger regression alert' },
                          alertOnHotspotDetection: { type: 'boolean', description: 'Enable hotspot detection alerts' }
                        },
                        description: 'Alert configuration settings'
                      },
                      hotspotConfiguration: {
                        type: 'object',
                        properties: {
                          hotspotMinComplexity: { type: 'number', minimum: 0, description: 'Minimum complexity for hotspot detection' },
                          hotspotMinChangeFrequency: { type: 'number', minimum: 0, description: 'Minimum change frequency for hotspot detection' },
                          hotspotChangeTimeFrameDays: { type: 'number', minimum: 1, description: 'Time frame in days for change frequency calculation' }
                        },
                        description: 'Hotspot detection configuration'
                      }
                    },
                    description: 'Threshold configuration parameters'
                  },
                  trackingParams: {
                    type: 'object',
                    properties: {
                      enableRealTimeAnalysis: { type: 'boolean', description: 'Enable real-time complexity analysis' },
                      enableBatchProcessing: { type: 'boolean', description: 'Enable batch processing of complexity analysis' },
                      analysisTimeoutMs: { type: 'number', minimum: 1000, description: 'Analysis timeout in milliseconds' },
                      maxFilesPerBatch: { type: 'number', minimum: 1, description: 'Maximum files per batch analysis' },
                      autoAnalyzeOnCommit: { type: 'boolean', description: 'Automatically analyze complexity on git commits' },
                      scheduledAnalysisIntervalMs: { type: 'number', minimum: 60000, description: 'Interval for scheduled analysis in milliseconds' },
                      supportedFileTypes: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'File types to include in analysis'
                      },
                      excludePatterns: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'File patterns to exclude from analysis'
                      }
                    },
                    description: 'Tracking configuration parameters'
                  },
                  performanceParams: {
                    type: 'object',
                    properties: {
                      includeDetailedTiming: { type: 'boolean', description: 'Include detailed timing breakdown' },
                      includeMemoryStats: { type: 'boolean', description: 'Include memory usage statistics' },
                      includeQualityMetrics: { type: 'boolean', description: 'Include analysis quality metrics' },
                      timeRange: {
                        type: 'object',
                        properties: {
                          startDate: { type: 'string', description: 'Start date for performance data (ISO format)' },
                          endDate: { type: 'string', description: 'End date for performance data (ISO format)' }
                        },
                        description: 'Time range for performance data'
                      }
                    },
                    description: 'Performance monitoring parameters'
                  }
                },
                description: 'Action-specific parameters'
              }
            },
            required: ['action']
          }
        },
        // TC016: Decision Outcome Tracking Tools - REMOVED in TT009-4 (Academic features not used for building)
        {
          description: 'Predict decision success probability using historical patterns and ML insights',
          inputSchema: {
            type: 'object',
            properties: {
              decisionType: { 
                type: 'string', 
                enum: ['architecture', 'library', 'framework', 'pattern', 'api_design', 'database', 'deployment', 'security', 'performance', 'ui_ux', 'testing', 'tooling', 'process', 'naming_convention', 'code_style'],
                description: 'Type of decision to predict success for' 
              },
              impactLevel: { 
                type: 'string', 
                enum: ['low', 'medium', 'high', 'critical'],
                description: 'Impact level of the decision' 
              },
              projectId: { 
                type: 'string', 
                description: 'Optional project ID (uses current project if not specified)' 
              },
              teamExperience: { 
                type: 'string', 
                enum: ['low', 'medium', 'high'],
                description: 'Team experience level with this type of decision' 
              },
              timelinePressure: { 
                type: 'string', 
                enum: ['low', 'medium', 'high'],
                description: 'Timeline pressure for the decision' 
              },
              complexity: { 
                type: 'string', 
                enum: ['low', 'medium', 'high'],
                description: 'Complexity level of the decision' 
              },
              stakeholderAlignment: { 
                type: 'string', 
                enum: ['low', 'medium', 'high'],
                description: 'Level of stakeholder alignment on the decision' 
              }
            },
            required: ['decisionType', 'impactLevel']
          }
        },
        ],
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

    const currentProject = await projectHandler.getCurrentProject();
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
      const project = await projectHandler.switchProjectWithValidation(args.project, sessionId);

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
  private async handleProjectCurrent(args: any) {
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
  private async handleAgentRegister(args: any) {
    const agent = await agentsHandler.registerAgent(
      args.name,
      args.type,
      args.capabilities,
      args.metadata
    );

    return {
      content: [
        {
          type: 'text',
          text: `✅ Agent registered successfully!\n\n` +
                `🤖 Name: ${agent.name}\n` +
                `🎯 Type: ${agent.type}\n` +
                `⚡ Capabilities: [${agent.capabilities.join(', ')}]\n` +
                `📊 Status: ${agent.status}\n` +
                `⏰ Registered: ${agent.createdAt.toISOString().split('T')[0]}\n` +
                `🆔 ID: ${agent.id}\n\n` +
                `🤝 Agent is now ready for multi-agent coordination!`
        },
      ],
    };
  }

  /**
   * Handle agent list requests
   */
  private async handleAgentList(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    const agents = await agentsHandler.listAgents(projectId);

    if (agents.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `🤖 No agents registered${projectId ? ' for this project' : ''}\n\n` +
                  `💡 Register agents with: agent_register`
          },
        ],
      };
    }

    const agentList = agents.map((agent, index) => {
      const lastSeenTime = new Date(agent.lastSeen).toISOString().split('T')[0];
      const statusIcon = {
        active: '🟢',
        busy: '🟡', 
        offline: '⚪',
        error: '🔴'
      }[agent.status] || '❓';

      return `   ${index + 1}. **${agent.name}** ${statusIcon}\n` +
             `      🎯 Type: ${agent.type}\n` +
             `      ⚡ Capabilities: [${agent.capabilities.join(', ')}]\n` +
             `      📊 Status: ${agent.status}\n` +
             `      ⏰ Last Seen: ${lastSeenTime}\n` +
             `      🆔 ID: ${agent.id}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `🤖 Registered Agents (${agents.length})\n\n${agentList}\n\n` +
                `💡 Update status with: agent_status\n` +
                `💬 Send messages with: agent_message`
        },
      ],
    };
  }

  /**
   * Handle agent status update requests
   */
  private async handleAgentStatus(args: any) {
    await agentsHandler.updateAgentStatus(args.agentId, args.status, args.metadata);

    const statusIcon = {
      active: '🟢',
      busy: '🟡',
      offline: '⚪', 
      error: '🔴'
    }[args.status] || '❓';

    return {
      content: [
        {
          type: 'text',
          text: `✅ Agent status updated!\n\n` +
                `🤖 Agent: ${args.agentId}\n` +
                `📊 New Status: ${args.status} ${statusIcon}\n` +
                `⏰ Updated: ${new Date().toISOString().split('T')[0]}\n\n` +
                `🎯 Status change recorded for coordination!`
        },
      ],
    };
  }

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

    const statusIcon = {
      todo: '⏰',
      in_progress: '🔄',
      blocked: '🚫',
      completed: '✅',
      cancelled: '❌'
    }[args.status] || '❓';

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

      const statusIcon = args.status ? {
        todo: '⏰',
        in_progress: '🔄',
        blocked: '🚫',
        completed: '✅',
        cancelled: '❌'
      }[args.status] || '❓' : '';

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
      return {
        content: [
          {
            type: 'text',
            text: `❌ Bulk update failed!\n\n` +
                  `🚨 **Error:** ${error.message}\n\n` +
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
      return {
        content: [{
          type: "text",
          text: `❌ Progress summary failed!\n\n` +
                `🚨 **Error:** ${error.message}\n\n` +
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
  private async handleAgentMessage(args: any) {
    // Ensure session is initialized before getting project ID
    await projectHandler.initializeSession('default-session');
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    
    const message = await agentsHandler.sendMessage(
      projectId,
      args.fromAgentId,
      args.content,
      args.toAgentId,
      args.messageType,
      args.title,
      args.contextRefs,
      args.taskRefs,
      args.metadata
    );

    const recipientText = message.toAgentId ? `to ${message.toAgentId}` : 'to all agents (broadcast)';
    const titleText = message.title ? `\n📝 Title: ${message.title}` : '';
    const refsText = message.contextRefs.length > 0 || message.taskRefs.length > 0 
      ? `\n🔗 References: ${[...message.contextRefs, ...message.taskRefs].join(', ')}`
      : '';

    return {
      content: [
        {
          type: 'text',
          text: `✅ Message sent successfully!\n\n` +
                `📨 From: ${message.fromAgentId}\n` +
                `📬 To: ${recipientText}\n` +
                `🏷️  Type: ${message.messageType}${titleText}${refsText}\n` +
                `⏰ Sent: ${message.createdAt.toISOString().split('T')[0]}\n` +
                `🆔 ID: ${message.id}\n\n` +
                `💬 Message delivered to coordination system!`
        },
      ],
    };
  }

  /**
   * Handle agent messages retrieval requests
   */
  private async handleAgentMessages(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    const messages = await agentsHandler.getMessages(
      projectId,
      args.agentId,
      args.messageType,
      args.unreadOnly
    );

    if (messages.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `📨 No messages found\n\n` +
                  `💡 Send messages with: agent_message`
          },
        ],
      };
    }

    const messageList = messages.map((message, index) => {
      const typeIcon = {
        info: 'ℹ️',
        request: '❓',
        response: '💬',
        alert: '⚠️',
        coordination: '🤝'
      }[message.messageType] || '📝';

      const recipientText = message.toAgentId ? `to ${message.toAgentId}` : 'broadcast';
      const titleText = message.title ? ` - ${message.title}` : '';
      const unreadMarker = !message.readAt ? ' 🆕' : '';

      return `   ${index + 1}. **${message.messageType}** ${typeIcon}${unreadMarker}\n` +
             `      📨 From: ${message.fromAgentId} ${recipientText}${titleText}\n` +
             `      💬 Content: ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}\n` +
             `      ⏰ Sent: ${message.createdAt.toISOString().split('T')[0]}\n` +
             `      🆔 ID: ${message.id}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `📨 Agent Messages (${messages.length})\n\n${messageList}\n\n` +
                `🆕 = Unread | 💬 Send with: agent_message`
        },
      ],
    };
  }

  /**
   * Handle agent join project requests
   */
  private async handleAgentJoin(args: any) {
    // Ensure session is initialized before getting project ID
    await projectHandler.initializeSession('default-session');
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    const sessionId = args.sessionId || 'default-session';
    
    // Convert agent name to ID if needed
    let agentId = args.agentId;
    if (!this.isUUID(args.agentId)) {
      const client = await agentsHandler['pool'].connect();
      try {
        const agentResult = await client.query('SELECT id FROM agents WHERE name = $1', [args.agentId]);
        if (agentResult.rows.length > 0) {
          agentId = agentResult.rows[0].id;
        } else {
          throw new Error(`Agent "${args.agentId}" not found`);
        }
      } finally {
        client.release();
      }
    }

    await agentsHandler.joinProject(agentId, sessionId, projectId);

    return {
      content: [
        {
          type: 'text',
          text: `✅ Agent joined project session!\n\n` +
                `🤖 Agent: ${args.agentId}\n` +
                `📋 Project: ${projectId}\n` +
                `🔗 Session: ${sessionId}\n` +
                `⏰ Joined: ${new Date().toISOString().split('T')[0]}\n\n` +
                `🤝 Agent is now active in this project!`
        },
      ],
    };
  }

  /**
   * Handle agent leave project requests
   */
  private async handleAgentLeave(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    const sessionId = args.sessionId || 'default-session';
    
    // Convert agent name to ID if needed
    let agentId = args.agentId;
    if (!this.isUUID(args.agentId)) {
      const client = await agentsHandler['pool'].connect();
      try {
        const agentResult = await client.query('SELECT id FROM agents WHERE name = $1', [args.agentId]);
        if (agentResult.rows.length > 0) {
          agentId = agentResult.rows[0].id;
        } else {
          throw new Error(`Agent "${args.agentId}" not found`);
        }
      } finally {
        client.release();
      }
    }

    await agentsHandler.leaveProject(agentId, sessionId, projectId);

    return {
      content: [
        {
          type: 'text',
          text: `✅ Agent left project session!\n\n` +
                `🤖 Agent: ${args.agentId}\n` +
                `📋 Project: ${projectId}\n` +
                `👋 Session ended: ${sessionId}\n` +
                `⏰ Left: ${new Date().toISOString().split('T')[0]}\n\n` +
                `🔌 Agent session disconnected from project!`
        },
      ],
    };
  }

  /**
   * Handle agent sessions list requests
   */
  private async handleAgentSessions(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    const sessions = await agentsHandler.getActiveAgentSessions(projectId);

    if (sessions.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `🔗 No active agent sessions for this project\n\n` +
                  `💡 Join agents with: agent_join`
          },
        ],
      };
    }

    const sessionList = sessions.map((session, index) => {
      const startTime = new Date(session.started_at).toISOString().split('T')[0];
      const lastActivity = new Date(session.last_activity).toISOString().split('T')[0];
      
      const statusIcon = {
        active: '🟢',
        idle: '🟡',
        disconnected: '⚪'
      }[session.status] || '❓';

      return `   ${index + 1}. **${session.agent_name}** ${statusIcon}\n` +
             `      🎯 Type: ${session.agent_type}\n` +
             `      🔗 Session: ${session.session_name}\n` +
             `      📊 Status: ${session.status} (agent: ${session.agent_status})\n` +
             `      🏁 Started: ${startTime}\n` +
             `      ⚡ Activity: ${lastActivity}\n` +
             `      🆔 Agent ID: ${session.agent_id}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `🔗 Active Agent Sessions (${sessions.length})\n\n${sessionList}\n\n` +
                `💡 Manage sessions with: agent_join, agent_leave`
        },
      ],
    };
  }

  private isUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * Handle code analysis requests
   */
  private async handleCodeAnalyze(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    
    const analysis = await codeAnalysisHandler.analyzeFile(
      projectId,
      args.filePath,
      args.content,
      args.forceReanalyze
    );

    const componentsText = analysis.components.length > 0 
      ? `\n📦 Components Found:\n` + analysis.components.map(c => 
          `   • ${c.componentType}: ${c.name} (line ${c.startLine}, complexity: ${c.complexityScore})`
        ).join('\n')
      : '';

    const depsText = analysis.dependencies.length > 0
      ? `\n🔗 Dependencies Found:\n` + analysis.dependencies.map(d =>
          `   • ${d.dependencyType}: ${d.importPath || 'internal'} ${d.isExternal ? '(external)' : ''}`
        ).join('\n')
      : '';

    return {
      content: [
        {
          type: 'text',
          text: `✅ Code analysis completed!\n\n` +
                `📄 File: ${args.filePath}\n` +
                `📦 Components: ${analysis.components.length}\n` +
                `🔗 Dependencies: ${analysis.dependencies.length}${componentsText}${depsText}\n\n` +
                `🔍 Analysis cached for future use!`
        },
      ],
    };
  }

  /**
   * Handle code components list requests
   */
  private async handleCodeComponents(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    const components = await codeAnalysisHandler.getProjectComponents(
      projectId,
      args.componentType,
      args.filePath
    );

    if (components.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `📦 No code components found\n\n` +
                  `💡 Analyze files with: code_analyze`
          },
        ],
      };
    }

    const componentList = components.map((comp, index) => {
      const exportIcon = comp.isExported ? '🌍' : '🔒';
      const deprecatedIcon = comp.isDeprecated ? '⚠️' : '';
      const tagsText = comp.tags.length > 0 ? `\n      🏷️  Tags: [${comp.tags.join(', ')}]` : '';
      
      return `   ${index + 1}. **${comp.name}** ${exportIcon}${deprecatedIcon}\n` +
             `      📝 Type: ${comp.componentType}\n` +
             `      📄 File: ${comp.filePath} (lines ${comp.startLine}-${comp.endLine})\n` +
             `      📊 Complexity: ${comp.complexityScore} | LOC: ${comp.linesOfCode}${tagsText}\n` +
             `      🆔 ID: ${comp.id}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `📦 Code Components (${components.length})\n\n${componentList}\n\n` +
                `🌍 = Exported | 🔒 = Private | ⚠️ = Deprecated\n` +
                `💡 Get dependencies with: code_dependencies\n` +
                `📊 Check impact with: code_impact`
        },
      ],
    };
  }

  /**
   * Handle code dependencies requests
   */
  private async handleCodeDependencies(args: any) {
    const dependencies = await codeAnalysisHandler.getComponentDependencies(args.componentId);

    if (dependencies.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `🔗 No dependencies found for this component\n\n` +
                  `💡 This component appears to be self-contained!`
          },
        ],
      };
    }

    const depList = dependencies.map((dep, index) => {
      const externalIcon = dep.isExternal ? '🌐' : '🏠';
      const confidenceBar = '▓'.repeat(Math.round(dep.confidenceScore * 5));
      const aliasText = dep.importAlias ? ` as ${dep.importAlias}` : '';
      
      return `   ${index + 1}. **${dep.dependencyType}** ${externalIcon}\n` +
             `      📦 Path: ${dep.importPath || 'internal'}${aliasText}\n` +
             `      📊 Confidence: ${confidenceBar} (${Math.round(dep.confidenceScore * 100)}%)\n` +
             `      🆔 ID: ${dep.id}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `🔗 Component Dependencies (${dependencies.length})\n\n${depList}\n\n` +
                `🌐 = External | 🏠 = Internal\n` +
                `📊 Higher confidence = more certain dependency`
        },
      ],
    };
  }

  /**
   * Handle code impact analysis requests  
   */
  private async handleCodeImpact(args: any) {
    const impact = await codeAnalysisHandler.analyzeImpact(
      await projectHandler.getCurrentProjectId('default-session'),
      args.componentId
    );

    const impactLevel = impact.impactScore >= 10 ? 'HIGH 🔴' : 
                       impact.impactScore >= 5 ? 'MEDIUM 🟡' : 'LOW 🟢';

    if (impact.dependents.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `📊 Impact Analysis: ${impactLevel}\n\n` +
                  `🔗 No dependents found - this component can be changed safely!\n` +
                  `📊 Impact Score: ${impact.impactScore}/20\n\n` +
                  `✅ Safe to modify without affecting other code`
          },
        ],
      };
    }

    const dependentsList = impact.dependents.map((dep, index) => {
      const typeIcon = {
        function: '⚡',
        class: '🏗️',
        interface: '📋',
        module: '📦'
      }[dep.component_type] || '📝';
      
      return `   ${index + 1}. **${dep.name}** ${typeIcon}\n` +
             `      📄 File: ${dep.file_path}\n` +
             `      🔗 Dependency: ${dep.dependency_type}\n` +
             `      📊 Confidence: ${Math.round(dep.confidence_score * 100)}%`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `📊 Impact Analysis: ${impactLevel}\n\n` +
                `🔗 ${impact.dependents.length} components depend on this:\n\n${dependentsList}\n\n` +
                `📊 Impact Score: ${impact.impactScore}/20\n` +
                `⚠️  Changes to this component will affect ${impact.dependents.length} other components!`
        },
      ],
    };
  }

  /**
   * Handle code statistics requests
   */
  private async handleCodeStats(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    const stats = await codeAnalysisHandler.getProjectAnalysisStats(projectId);

    const componentBreakdown = Object.entries(stats.componentsByType)
      .map(([type, count]) => `   ${type}: ${count}`)
      .join('\n') || '   (no components analyzed yet)';

    const complexityLevel = stats.averageComplexity >= 5 ? 'HIGH 🔴' :
                           stats.averageComplexity >= 3 ? 'MEDIUM 🟡' : 'LOW 🟢';

    return {
      content: [
        {
          type: 'text',
          text: `📊 Code Analysis Statistics\n\n` +
                `📦 Total Components: ${stats.totalComponents}\n` +
                `📄 Files Analyzed: ${stats.filesAnalyzed}\n` +
                `🔗 Dependencies: ${stats.totalDependencies} (${stats.externalDependencies} external)\n` +
                `📏 Total Lines: ${stats.totalLinesOfCode.toLocaleString()}\n` +
                `🧠 Avg Complexity: ${stats.averageComplexity.toFixed(1)} (${complexityLevel})\n` +
                `⚡ Max Complexity: ${stats.maxComplexity}\n\n` +
                `📋 Components by Type:\n${componentBreakdown}\n\n` +
                `💡 Analyze more files with: code_analyze`
        },
      ],
    };
  }

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

    const healthLevel = {
      healthy: '🟢 HEALTHY',
      moderate: '🟡 MODERATE', 
      needs_attention: '🔴 NEEDS ATTENTION',
      no_data: '⚪ NO DATA'
    }[insights.insights.codeHealth.level] || '❓ UNKNOWN';

    const efficiencyLevel = {
      efficient: '🟢 EFFICIENT',
      moderate: '🟡 MODERATE',
      needs_improvement: '🔴 NEEDS IMPROVEMENT',
      no_data: '⚪ NO DATA'
    }[insights.insights.teamEfficiency.level] || '❓ UNKNOWN';

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
      `🎯 Decisions: ${session.decisions_created}\n` +
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
  private async handleGitSessionCommits(args: any) {
    console.log(`📊 Git session commits request: sessionId="${args.sessionId || 'current'}", includeDetails=${args.includeDetails || false}`);
    
    const result = await GitHandler.gitSessionCommits({
      sessionId: args.sessionId,
      includeDetails: args.includeDetails || false,
      confidenceThreshold: args.confidenceThreshold || 0.0
    });

    if (!result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to get session commits: ${result.error}`
          }
        ]
      };
    }

    let responseText = `📊 **Git Commits for Session ${result.sessionId.substring(0, 8)}...**\n\n`;
    responseText += `**Summary:**\n`;
    responseText += `• Total commits: ${result.totalCommits}\n`;
    responseText += `• Average confidence: ${result.avgConfidence}%\n`;
    
    if (result.timeRange) {
      responseText += `• Session timeframe: ${new Date(result.timeRange.start).toLocaleString()} - ${new Date(result.timeRange.end).toLocaleString()}\n`;
    }

    if (result.commits.length > 0) {
      responseText += `\n**Linked Commits:**\n`;
      result.commits.forEach((commit, index) => {
        responseText += `\n${index + 1}. **${commit.short_sha}** (${Math.round(commit.confidence_score * 100)}% confidence)\n`;
        responseText += `   📝 ${commit.message}\n`;
        responseText += `   👤 ${commit.author_name} <${commit.author_email}>\n`;
        responseText += `   📅 ${new Date(commit.author_date).toLocaleString()}\n`;
        responseText += `   🔗 Link type: ${commit.link_type}`;
        
        if (commit.time_proximity_minutes !== null && commit.time_proximity_minutes !== undefined) {
          responseText += ` (${commit.time_proximity_minutes} min proximity)`;
        }
        
        if (commit.author_match) {
          responseText += ` ✅ Author match`;
        }
        
        if (args.includeDetails && commit.files_changed) {
          responseText += `\n   📁 Files: ${commit.files_changed}, +${commit.insertions || 0}/-${commit.deletions || 0} lines`;
        }
      });
    } else {
      responseText += `\n🔍 No commits found linked to this session.`;
      if (args.confidenceThreshold && args.confidenceThreshold > 0) {
        responseText += ` Try lowering the confidence threshold (currently ${args.confidenceThreshold}).`;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: responseText
        }
      ]
    };
  }

  /**
   * Handle git commit sessions request
   */
  private async handleGitCommitSessions(args: any) {
    console.log(`🔍 Git commit sessions request: commitSha="${args.commitSha}", includeDetails=${args.includeDetails || false}`);
    
    const result = await GitHandler.gitCommitSessions({
      commitSha: args.commitSha,
      includeDetails: args.includeDetails || false
    });

    if (!result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to get commit sessions: ${result.error}`
          }
        ]
      };
    }

    let responseText = `🔍 **Sessions for Git Commit ${result.commitSha}**\n\n`;
    
    if (result.commit) {
      responseText += `**Commit Details:**\n`;
      responseText += `• **${result.commit.short_sha}**: ${result.commit.message}\n`;
      responseText += `• 👤 ${result.commit.author_name} <${result.commit.author_email}>\n`;
      responseText += `• 📅 ${new Date(result.commit.author_date).toLocaleString()}\n`;
      
      if (result.commit.files_changed) {
        responseText += `• 📁 ${result.commit.files_changed} files changed, +${result.commit.insertions || 0}/-${result.commit.deletions || 0} lines\n`;
      }
      
      if (result.commit.branch_name) {
        responseText += `• 🌿 Branch: ${result.commit.branch_name}\n`;
      }
    }

    responseText += `\n**Session Correlation:**\n`;
    responseText += `• Total sessions: ${result.totalSessions}\n`;
    responseText += `• Average confidence: ${result.avgConfidence}%\n`;

    if (result.sessions.length > 0) {
      responseText += `\n**Linked Sessions:**\n`;
      result.sessions.forEach((session, index) => {
        responseText += `\n${index + 1}. **Session ${session.id.substring(0, 8)}...** (${Math.round(session.confidence_score * 100)}% confidence)\n`;
        responseText += `   🎯 Type: ${session.session_type}\n`;
        responseText += `   📅 Started: ${new Date(session.started_at).toLocaleString()}\n`;
        responseText += `   ⏱️  Duration: ${session.duration_minutes} minutes\n`;
        responseText += `   🔗 Link type: ${session.link_type}\n`;
        
        if (session.project_name) {
          responseText += `   🏷️  Project: ${session.project_name}\n`;
        }
        
        if (args.includeDetails) {
          if (session.contexts_created !== undefined && session.decisions_created !== undefined) {
            responseText += `   📝 Activity: ${session.contexts_created} contexts, ${session.decisions_created} decisions\n`;
          }
        }
      });
    } else {
      responseText += `\n🔍 No sessions found linked to this commit.`;
    }

    return {
      content: [
        {
          type: 'text',
          text: responseText
        }
      ]
    };
  }

  /**
   * Handle git correlation trigger request
   */
  private async handleGitCorrelateSession(args: any) {
    console.log(`🔗 Git correlate session request: sessionId="${args.sessionId || 'current'}", forceRefresh=${args.forceRefresh || false}`);
    
    const result = await GitHandler.gitCorrelateSession({
      sessionId: args.sessionId,
      projectId: args.projectId,
      forceRefresh: args.forceRefresh || false,
      confidenceThreshold: args.confidenceThreshold || 0.3
    });

    if (!result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to correlate session with git: ${result.error}`
          }
        ]
      };
    }

    let responseText = `🔗 **Git Correlation Completed**\n\n`;
    responseText += `**Session:** ${result.sessionId.substring(0, 8)}...\n`;
    
    if (result.projectId) {
      responseText += `**Project:** ${result.projectId}\n`;
    }
    
    responseText += `\n**Correlation Results:**\n`;
    responseText += `• Links created: ${result.linksCreated}\n`;
    responseText += `• Links updated: ${result.linksUpdated}\n`;
    responseText += `• High confidence links: ${result.highConfidenceLinks}\n`;
    responseText += `• Average confidence: ${result.avgConfidence}%\n`;
    responseText += `• Processing time: ${result.processingTimeMs}ms\n`;

    if (result.correlationStats) {
      responseText += `\n**Correlation Analysis:**\n`;
      responseText += `• Author matches: ${result.correlationStats.authorMatches}\n`;
      responseText += `• Time proximity matches: ${result.correlationStats.timeProximityMatches}\n`;
      responseText += `• Content similarity matches: ${result.correlationStats.contentSimilarityMatches}\n`;
    }

    if (result.linksCreated === 0 && result.linksUpdated === 0) {
      responseText += `\n💡 **No new correlations found.** This could mean:\n`;
      responseText += `• No recent commits in the session timeframe\n`;
      responseText += `• Correlation confidence below threshold (${args.confidenceThreshold || 0.3})\n`;
      responseText += `• Session not assigned to a project with git repository\n`;
      responseText += `\nTry:\n`;
      responseText += `• Lowering the confidence threshold\n`;
      responseText += `• Checking if the session is assigned to the correct project\n`;
      responseText += `• Using \`git_session_commits\` to see existing correlations\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: responseText
        }
      ]
    };
  }
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
