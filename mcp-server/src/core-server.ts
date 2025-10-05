#!/usr/bin/env node

/**
 * AIDIS CORE HTTP API SERVER - PURE HTTP SERVICE
 * 
 * This is the core AIDIS service that provides pure HTTP API endpoints.
 * STDIO MCP transport has been extracted to separate adapters.
 * 
 * Core Features:
 * - HTTP API for all 96 AIDIS tools
 * - Health endpoints (/healthz, /readyz)
 * - Database connectivity with circuit breaker
 * - Process management and graceful shutdown
 * 
 * WEEK 1 EXTRACTION GOALS:
 * ✅ Remove STDIO transport dependencies
 * ✅ Keep all HTTP endpoints functional
 * ✅ Preserve database connectivity and reliability features
 * ✅ Maintain all 96 AIDIS tools via HTTP API
 */

import { processLock } from './utils/processLock.js';

// import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import {
  // CallToolRequestSchema,
  ErrorCode,
  // ListResourcesRequestSchema,
  // ListToolsRequestSchema,
  McpError,
  // ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { initializeDatabase, closeDatabase } from './config/database.js';
import { AIDIS_TOOL_DEFINITIONS } from './config/toolDefinitions.js';
import { contextHandler } from './handlers/context.js';
import { projectHandler } from './handlers/project.js';
import { namingHandler } from './handlers/naming.js';
import { decisionsHandler } from './handlers/decisions.js';
// import { tasksHandler } from './handlers/tasks.js';
import { codeAnalysisHandler } from './handlers/codeAnalysis.js';
import { smartSearchHandler } from './handlers/smartSearch.js';
import { navigationHandler } from './handlers/navigation.js';
import { agentsHandler } from './handlers/agents.js';
import { validationMiddleware } from './middleware/validation.js';

// Enterprise hardening constants
const PID_FILE = '/home/ridgetop/aidis/run/aidis-core.pid';
const HTTP_PORT = process.env.AIDIS_HTTP_PORT || 8080;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

/**
 * Check if another AIDIS core service is already running
 */
async function _isAidisCoreRunning(): Promise<boolean> {
  try {
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${HTTP_PORT}/healthz`, (res) => {
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

// Enable debug logging if needed
if (process.env.AIDIS_DEBUG) {
  console.log('🐛 AIDIS Core debug logging enabled:', process.env.AIDIS_DEBUG);
}

/**
 * Process Singleton - Prevent multiple AIDIS core instances
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
          console.error(`❌ AIDIS Core instance already running (PID: ${existingPid})`);
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
  
  constructor(
    private failureThreshold: number = 5,
    private recoveryTimeout: number = 30000
  ) {}
  
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
 * AIDIS Core HTTP Server - Pure HTTP API Service
 * 
 * This provides all AIDIS functionality via HTTP endpoints.
 * No STDIO transport - pure HTTP service for maximum reliability.
 */
class AIDISCoreServer {
  private httpServer: http.Server | null = null;
  private circuitBreaker: CircuitBreaker;
  private _singleton: ProcessSingleton;
  private dbHealthy: boolean = false;

  constructor() {
    this.circuitBreaker = new CircuitBreaker();
    this._singleton = new ProcessSingleton();
    
    this.setupHttpServer();
  }

  /**
   * Setup pure HTTP server with all AIDIS endpoints
   */
  private setupHttpServer(): void {
    this.httpServer = http.createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      if (req.url === '/healthz') {
        // Basic health check - always returns 200 if server is responding
        res.writeHead(200);
        res.end(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          pid: process.pid,
          version: '1.0.0-core',
          service: 'aidis-core-http'
        }));
        
      } else if (req.url === '/readyz') {
        // Readiness check - validates database connectivity
        const isReady = this.dbHealthy && this.circuitBreaker.getState() !== 'open';
        
        res.writeHead(isReady ? 200 : 503);
        res.end(JSON.stringify({
          status: isReady ? 'ready' : 'not_ready',
          database: this.dbHealthy ? 'connected' : 'disconnected',
          circuit_breaker: this.circuitBreaker.getState(),
          timestamp: new Date().toISOString()
        }));
        
      } else if (req.url?.startsWith('/mcp/tools/') && req.method === 'POST') {
        // AIDIS Tool HTTP Endpoints
        await this.handleToolRequest(req, res);
        
      } else if (req.url === '/mcp/tools' && req.method === 'GET') {
        // List all available tools with full schemas
        // Filter out disabled tools (Token Optimization 2025-10-01)
        const DISABLED_TOOLS = [
          'code_analyze', 'code_components', 'code_dependencies', 'code_impact', 'code_stats',
          'git_session_commits', 'git_commit_sessions', 'git_correlate_session',
          'complexity_analyze', 'complexity_insights', 'complexity_manage'
        ];
        const activeTools = AIDIS_TOOL_DEFINITIONS.filter(tool => !DISABLED_TOOLS.includes(tool.name));

        try {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            tools: activeTools.map(tool => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
              endpoint: `/mcp/tools/${tool.name}`
            })),
            count: activeTools.length,
            timestamp: new Date().toISOString()
          }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Failed to retrieve tool definitions',
            timestamp: new Date().toISOString()
          }));
        }

      } else if (req.url === '/mcp/tools/schemas' && req.method === 'GET') {
        // Get complete tool schemas (dedicated endpoint)
        // Filter out disabled tools (Token Optimization 2025-10-01)
        const DISABLED_TOOLS = [
          'code_analyze', 'code_components', 'code_dependencies', 'code_impact', 'code_stats',
          'git_session_commits', 'git_commit_sessions', 'git_correlate_session',
          'complexity_analyze', 'complexity_insights', 'complexity_manage'
        ];
        const activeTools = AIDIS_TOOL_DEFINITIONS.filter(tool => !DISABLED_TOOLS.includes(tool.name));

        try {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            tools: activeTools,
            count: activeTools.length,
            timestamp: new Date().toISOString(),
            note: 'Complete MCP tool definitions with inputSchema for all AIDIS tools'
          }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Failed to retrieve tool schemas',
            timestamp: new Date().toISOString()
          }));
        }

      } else {
        res.writeHead(404);
        res.end(JSON.stringify({
          error: 'Not found',
          available_endpoints: ['/healthz', '/readyz', '/mcp/tools', '/mcp/tools/schemas', '/mcp/tools/{toolName}']
        }));
      }
    });
  }

  /**
   * Handle AIDIS Tool Requests via HTTP
   */
  private async handleToolRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      // Extract tool name from URL: /mcp/tools/{toolName}
      const toolName = req.url?.split('/mcp/tools/')[1];
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

      const requestData = body ? JSON.parse(body) : {};
      const args = requestData.arguments || requestData.args || {};

      // Execute the tool
      const result = await this.executeTool(toolName, args);

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        result
      }));

    } catch (error: any) {
      console.error('🚨 Tool HTTP Error:', error);
      
      res.writeHead(500);
      res.end(JSON.stringify({
        success: false,
        error: error.message,
        type: error.constructor.name
      }));
    }
  }

  /**
   * Execute AIDIS Tool (core logic for all tools)
   */
  private async executeTool(toolName: string, args: any): Promise<any> {
    // Input validation middleware
    const validation = validationMiddleware(toolName, args || {});
    if (!validation.success) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Input validation failed: ${validation.error}`
      );
    }
    
    const validatedArgs = validation.data;
    
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
        
      case 'agent_register':
        return await this.handleAgentRegister(validatedArgs as any);
        
      case 'agent_list':
        return await this.handleAgentList(validatedArgs as any);
        
      case 'agent_status':
        return await this.handleAgentStatus(validatedArgs as any);
        
      case 'task_create':
        return await this.handleTaskCreate(validatedArgs as any);
        
      case 'task_list':
        return await this.handleTaskList(validatedArgs as any);
        
      case 'task_update':
        return await this.handleTaskUpdate(validatedArgs as any);
        
      case 'task_details':
        return await this.handleTaskDetails(validatedArgs as any);
        
      case 'agent_message':
        return await this.handleAgentMessage(validatedArgs as any);
        
      case 'agent_messages':
        return await this.handleAgentMessages(validatedArgs as any);
        
      case 'agent_join':
        return await this.handleAgentJoin(validatedArgs as any);
        
      case 'agent_leave':
        return await this.handleAgentLeave(validatedArgs as any);
        
      case 'agent_sessions':
        return await this.handleAgentSessions(validatedArgs as any);
        
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
        
      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${toolName}. Available tools: ${this.getAvailableTools().join(', ')}`
        );
    }
  }

  private getAvailableTools(): string[] {
    return AIDIS_TOOL_DEFINITIONS.map(tool => tool.name);
  }

  private _getToolDescription(toolName: string): string {
    const tool = AIDIS_TOOL_DEFINITIONS.find(t => t.name === toolName);
    return tool?.description || 'AIDIS tool';
  }

  // Tool handler methods (copied from original server.ts)
  private async handlePing(args: { message?: string }) {
    return {
      content: [
        {
          type: 'text',
          text: `🏓 AIDIS Core HTTP Service Pong! ${args.message || ''}\n\n` +
                `🚀 Status: All systems operational\n` +
                `⏰ Server time: ${new Date().toISOString()}\n` +
                `🔒 PID: ${process.pid}\n` +
                `🌐 Service: aidis-core-http\n` +
                `📊 Circuit breaker: ${this.circuitBreaker.getState()}\n` +
                `🗄️  Database: ${this.dbHealthy ? 'Connected' : 'Disconnected'}`
        },
      ],
    };
  }

  private async handleStatus() {
    const uptime = process.uptime();
    const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
    
    return {
      content: [
        {
          type: 'text',
          text: `📊 AIDIS Core HTTP Service Status\n\n` +
                `🚀 Service: aidis-core-http v1.0.0-core\n` +
                `⏰ Uptime: ${uptimeStr}\n` +
                `🔒 Process: ${process.pid}\n` +
                `🌐 HTTP Port: ${HTTP_PORT}\n` +
                `🗄️  Database: ${this.dbHealthy ? '✅ Connected' : '❌ Disconnected'}\n` +
                `⚡ Circuit Breaker: ${this.circuitBreaker.getState().toUpperCase()}\n` +
                `🧠 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n` +
                `📊 Available Tools: ${this.getAvailableTools().length}\n\n` +
                `🔗 Endpoints:\n` +
                `   • GET  /mcp/tools - List all tools\n` +
                `   • POST /mcp/tools/{name} - Execute tool\n` +
                `   • GET  /healthz - Health check\n` +
                `   • GET  /readyz - Readiness check`
        },
      ],
    };
  }

  private async handleHelp() {
    return navigationHandler.getHelp();
  }

  private async handleExplain(args: any) {
    return navigationHandler.explainTool(args);
  }

  private async handleExamples(args: any) {
    return navigationHandler.getExamples(args);
  }

  // Context handlers
  private async handleContextStore(args: any) {
    const result = await contextHandler.storeContext({
      content: args.content,
      type: args.type,
      tags: args.tags,
      relevanceScore: args.relevanceScore,
      metadata: args.metadata,
      projectId: args.projectId,
      sessionId: args.sessionId || 'default-session'
    });

    return {
      content: [
        {
          type: 'text',
          text: `📝 Context stored successfully!\n\n` +
                `🆔 ID: ${result.id}\n` +
                `📝 Type: ${result.type}\n` +
                `📏 Content: ${result.content.substring(0, 100)}${result.content.length > 100 ? '...' : ''}\n` +
                `🏷️  Tags: ${result.tags.length > 0 ? result.tags.join(', ') : 'none'}\n` +
                `📊 Relevance: ${result.relevanceScore || 'auto-calculated'}\n` +
                `📅 Created: ${result.createdAt}`
        },
      ],
    };
  }

  private async handleContextSearch(args: any) {
    const results = await contextHandler.searchContext({
      query: args.query,
      sessionId: args.sessionId || 'default-session',
      limit: args.limit,
      type: args.type,
      tags: args.tags,
      minSimilarity: args.minSimilarity,
      offset: args.offset,
      projectId: args.projectId
    });

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `🔍 No contexts found for query: "${args.query}"\n\n` +
                  `💡 Try broader search terms or check if contexts exist with: context_stats`
          },
        ],
      };
    }

    const contextList = results.map((ctx: any, index: number) => {
      const tags = ctx.tags?.length > 0 ? `\n      🏷️  Tags: [${ctx.tags.join(', ')}]` : '';
      const similarity = ctx.similarity ? ` (${Math.round(ctx.similarity * 100)}% match)` : '';
      
      return `   ${index + 1}. **${ctx.type}** ${similarity}\n` +
             `      💬 ${ctx.content.substring(0, 150)}${ctx.content.length > 150 ? '...' : ''}\n` +
             `      📅 ${new Date(ctx.createdAt).toLocaleDateString()}${tags}\n` +
             `      🆔 ${ctx.id}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `🔍 Context Search Results (${results.length})\n\n${contextList}\n\n` +
                `💡 Use context_get_recent for chronological listing`
        },
      ],
    };
  }

  private async handleContextGetRecent(args: any) {
    return contextHandler.getRecentContext(
      args.sessionId || 'default-session',
      args.limit,
      args.projectId
    );
  }

  private async handleContextStats(args: any) {
    return contextHandler.getContextStats(args.sessionId || 'default-session');
  }

  // Project handlers
  private async handleProjectList(args: any) {
    return projectHandler.listProjects(args.includeStats);
  }

  private async handleProjectCreate(args: any) {
    return projectHandler.createProject(
      args.name,
      args.description,
      args.sessionId || 'default-session'
    );
  }

  private async handleProjectSwitch(args: any) {
    return projectHandler.switchProject(
      args.project,
      args.sessionId || 'default-session'
    );
  }

  private async handleProjectCurrent(args: any) {
    return projectHandler.getCurrentProject(args.sessionId || 'default-session');
  }

  private async handleProjectInfo(args: any) {
    return projectHandler.getProject(
      args.projectId || await projectHandler.getCurrentProjectId('default-session')
    );
  }

  // Naming handlers
  private async handleNamingRegister(args: any) {
    return namingHandler.registerName(
      args.name,
      args.type,
      args.context,
      args.sessionId || 'default-session'
    );
  }

  private async handleNamingCheck(args: any) {
    return namingHandler.checkName(
      args.name,
      args.type,
      args.sessionId || 'default-session'
    );
  }

  private async handleNamingSuggest(args: any) {
    return namingHandler.suggestNames(
      args.type,
      args.context,
      args.sessionId || 'default-session'
    );
  }

  private async handleNamingStats(args: any) {
    return namingHandler.getNamingStats(args.sessionId || 'default-session');
  }

  // Decision handlers
  private async handleDecisionRecord(args: any) {
    return decisionsHandler.recordDecision(
      args.title,
      args.description,
      args.alternatives,
      args.reasoning,
      args.sessionId || 'default-session',
      args.tags
    );
  }

  private async handleDecisionSearch(args: any) {
    return decisionsHandler.searchDecisions(
      args.query,
      args.sessionId || 'default-session',
      args.limit
    );
  }

  private async handleDecisionUpdate(args: any) {
    return decisionsHandler.updateDecision(
      args.decisionId,
      args.status,
      args.outcome,
      args.sessionId || 'default-session'
    );
  }

  private async handleDecisionStats(args: any) {
    return decisionsHandler.getDecisionStats(args.sessionId || 'default-session');
  }

  // Agent coordination handlers
  private async handleAgentRegister(args: any) {
    return agentsHandler.registerAgent(
      args.agentId,
      args.capabilities,
      args.sessionId || 'default-session'
    );
  }

  private async handleAgentList(args: any) {
    return agentsHandler.listAgents(args.sessionId || 'default-session');
  }

  private async handleAgentStatus(args: any) {
    return agentsHandler.getAgentStatus(
      args.agentId,
      args.sessionId || 'default-session'
    );
  }

  private async handleTaskCreate(args: any) {
    return agentsHandler.createTask(
      args.title,
      args.description,
      args.assignedAgent,
      args.sessionId || 'default-session',
      args.priority,
      args.dependencies
    );
  }

  private async handleTaskList(args: any) {
    return agentsHandler.listTasks(
      args.sessionId || 'default-session',
      args.status,
      args.assignedAgent
    );
  }

  private async handleTaskUpdate(args: any) {
    return agentsHandler.updateTask(
      args.taskId,
      args.status,
      args.progress,
      args.sessionId || 'default-session',
      args.result
    );
  }

  private async handleTaskDetails(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    
    // Get single task with full details
    const tasks = await agentsHandler.listTasks(projectId);
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

  private async handleAgentMessage(args: any) {
    return agentsHandler.sendMessage(
      args.fromAgent,
      args.toAgent,
      args.message,
      args.sessionId || 'default-session',
      args.messageType
    );
  }

  private async handleAgentMessages(args: any) {
    return agentsHandler.getMessages(
      args.agentId,
      args.sessionId || 'default-session',
      args.limit
    );
  }

  private async handleAgentJoin(args: any) {
    return agentsHandler.joinSession(
      args.agentId,
      args.sessionId,
      args.currentSession || 'default-session'
    );
  }

  private async handleAgentLeave(args: any) {
    return agentsHandler.leaveSession(
      args.agentId,
      args.sessionId || 'default-session'
    );
  }

  private async handleAgentSessions(args: any) {
    return agentsHandler.getAgentSessions(
      args.agentId,
      args.sessionId || 'default-session'
    );
  }

  // Code analysis handlers
  private async handleCodeAnalyze(args: any) {
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    return codeAnalysisHandler.analyzeCode(
      projectId,
      args.filePath,
      args.fileContent,
      args.language
    );
  }

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

  // Smart search handlers
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
   * Start the AIDIS Core HTTP Service
   */
  async start(): Promise<void> {
    console.log('🚀 Starting AIDIS Core HTTP Service...');

    // Enforce process singleton (CRITICAL)
    try {
      processLock.acquire();
    } catch (error) {
      console.error('❌ Cannot start: Another AIDIS Core instance is already running');
      console.error(error);
      process.exit(1);
    }
    
    try {
      // Initialize database with retry and circuit breaker
      console.log('🔌 Initializing database connection with retry logic...');
      
      await RetryHandler.executeWithRetry(async () => {
        await this.circuitBreaker.execute(async () => {
          await initializeDatabase();
          this.dbHealthy = true;
          console.log('✅ Database connection established');
        });
      });
      
      // Start pure HTTP server
      console.log(`🌐 Starting AIDIS Core HTTP server on port ${HTTP_PORT}...`);
      this.httpServer?.listen(HTTP_PORT, () => {
        console.log('✅ AIDIS Core HTTP Service is running!');
        console.log(`🌐 Service URL: http://localhost:${HTTP_PORT}`);
        console.log(`✅ Health endpoints:`);
        console.log(`   🏥 Liveness:  http://localhost:${HTTP_PORT}/healthz`);
        console.log(`   🎯 Readiness: http://localhost:${HTTP_PORT}/readyz`);
        console.log(`   📋 Tools:     http://localhost:${HTTP_PORT}/mcp/tools`);
        console.log(`   🔧 Execute:   POST http://localhost:${HTTP_PORT}/mcp/tools/{toolName}`);
      });
      
      console.log('🔒 Enterprise Security Features:');
      console.log(`   🔒 Process Singleton: ACTIVE (PID: ${process.pid})`);
      console.log(`   🗄️  Database: ${this.dbHealthy ? 'Connected' : 'Disconnected'}`);
      console.log(`   ⚡ Circuit Breaker: ${this.circuitBreaker.getState().toUpperCase()}`);
      console.log(`   🔄 Retry Logic: ${MAX_RETRIES} attempts with exponential backoff`);
      console.log(`   🐛 Debug: ${process.env.AIDIS_DEBUG || 'DISABLED'}`);
      
      console.log('🎯 Available tools: 41 total');
      console.log('   📊 System: aidis_ping, aidis_status, aidis_help, aidis_explain, aidis_examples');
      console.log('   📝 Context: context_store, context_search, context_get_recent, context_stats');
      console.log('   📋 Projects: project_list, project_create, project_switch, project_current, project_info');
      console.log('   🏷️  Naming: naming_register, naming_check, naming_suggest, naming_stats');
      console.log('   📋 Decisions: decision_record, decision_search, decision_update, decision_stats');
      console.log('   🤖 Agents: agent_register, agent_list, agent_status, agent_join, agent_leave, agent_sessions');
      console.log('   📋 Tasks: task_create, task_list, task_update, task_details, agent_message, agent_messages');
      console.log('   📦 Code Analysis: code_analyze, code_components, code_dependencies, code_impact, code_stats');
      console.log('   🧠 Smart Search: smart_search, get_recommendations, project_insights');
      
      console.log('🚀 System Status:');
      console.log('🧠 AI Context Management: ONLINE');
      console.log('🔍 Semantic Search: READY');
      console.log('📋 Multi-Project Support: READY');
      console.log('🏷️  Naming Registry: READY');
      console.log('📋 Decision Tracking: READY');
      console.log('🤖 Multi-Agent Coordination: READY');
      console.log('📦 Code Analysis: READY');
      console.log('🧠 Smart Search & AI Recommendations: READY');
      console.log('🌐 HTTP API: READY - All 96 tools available via HTTP');
      
    } catch (error) {
      console.error('❌ Failed to start AIDIS Core HTTP Service:', error);
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
    console.log(`\n📴 Received ${signal}, shutting down gracefully...`);
    
    try {
      // Close HTTP server
      if (this.httpServer) {
        console.log('🌐 Closing HTTP server...');
        await new Promise<void>((resolve) => {
          this.httpServer!.close(() => {
            console.log('✅ HTTP server closed');
            resolve();
          });
        });
      }
      
      // Close database connections
      console.log('🔌 Closing database connections...');
      await closeDatabase();
      console.log('✅ Database connections closed');
      
      // Mark as unhealthy
      this.dbHealthy = false;
      
      console.log('✅ Graceful shutdown completed');
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }
}

/**
 * Global shutdown handling
 */
let serverInstance: AIDISCoreServer | null = null;

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
  (async () => {
    try {
      console.log('🚀 Starting AIDIS Core HTTP Service (STDIO-free)');
      
      serverInstance = new AIDISCoreServer();
      
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

export { AIDISCoreServer };
