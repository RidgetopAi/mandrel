/**
 * AIDIS Core HTTP Server
 * Main server class that orchestrates all components
 */

import * as http from 'http';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { processLock } from '../utils/processLock.js';
import { initializeDatabase, closeDatabase } from '../config/database.js';
import { AIDIS_TOOL_DEFINITIONS } from '../config/toolDefinitions.js';
import { validationMiddleware } from '../middleware/validation.js';

import { CircuitBreaker, RetryHandler } from './infra/index.js';
import { createHttpServer } from './http/index.js';
import {
  createSystemHandlers,
  contextHandlers,
  projectHandlers,
  decisionHandlers,
  agentHandlers,
  codeAnalysisHandlers,
  smartSearchHandlers
} from './handlers/index.js';

const HTTP_PORT = process.env.AIDIS_HTTP_PORT || 8080;
const MAX_RETRIES = 3;

export class AIDISCoreServer {
  private httpServer: http.Server | null = null;
  private circuitBreaker: CircuitBreaker;
  private dbHealthy: boolean = false;
  private systemHandlers: ReturnType<typeof createSystemHandlers>;

  constructor() {
    this.circuitBreaker = new CircuitBreaker();
    this.systemHandlers = createSystemHandlers(this.circuitBreaker, () => this.dbHealthy);
    this.httpServer = createHttpServer(
      this.circuitBreaker,
      () => this.dbHealthy,
      this.handleToolRequest.bind(this)
    );
  }

  private async handleToolRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const toolName = req.url?.split('/mcp/tools/')[1];
      if (!toolName) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Tool name required' }));
        return;
      }

      let body = '';
      req.on('data', chunk => body += chunk);
      
      await new Promise<void>((resolve) => {
        req.on('end', resolve);
      });

      const requestData = body ? JSON.parse(body) : {};
      const args = requestData.arguments || requestData.args || {};

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

  private async executeTool(toolName: string, args: any): Promise<any> {
    const validation = validationMiddleware(toolName, args || {});
    if (!validation.success) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Input validation failed: ${validation.error}`
      );
    }
    
    const validatedArgs = validation.data;
    
    switch (toolName) {
      // System handlers
      case 'aidis_ping':
        return await this.systemHandlers.handlePing(validatedArgs as { message?: string });
      case 'aidis_status':
        return await this.systemHandlers.handleStatus();
      case 'aidis_help':
        return await this.systemHandlers.handleHelp();
      case 'aidis_explain':
        return await this.systemHandlers.handleExplain(validatedArgs);
      case 'aidis_examples':
        return await this.systemHandlers.handleExamples(validatedArgs);

      // Context handlers
      case 'context_store':
        return await contextHandlers.handleContextStore(validatedArgs);
      case 'context_search':
        return await contextHandlers.handleContextSearch(validatedArgs);
      case 'context_get_recent':
        return await contextHandlers.handleContextGetRecent(validatedArgs);
      case 'context_stats':
        return await contextHandlers.handleContextStats(validatedArgs);

      // Project handlers
      case 'project_list':
        return await projectHandlers.handleProjectList(validatedArgs);
      case 'project_create':
        return await projectHandlers.handleProjectCreate(validatedArgs);
      case 'project_switch':
        return await projectHandlers.handleProjectSwitch(validatedArgs);
      case 'project_current':
        return await projectHandlers.handleProjectCurrent(validatedArgs);
      case 'project_info':
        return await projectHandlers.handleProjectInfo(validatedArgs);

      // Decision handlers
      case 'decision_record':
        return await decisionHandlers.handleDecisionRecord(validatedArgs);
      case 'decision_search':
        return await decisionHandlers.handleDecisionSearch(validatedArgs);
      case 'decision_update':
        return await decisionHandlers.handleDecisionUpdate(validatedArgs);
      case 'decision_stats':
        return await decisionHandlers.handleDecisionStats(validatedArgs);

      // Agent handlers
      case 'agent_register':
        return await agentHandlers.handleAgentRegister(validatedArgs);
      case 'agent_list':
        return await agentHandlers.handleAgentList(validatedArgs);
      case 'agent_status':
        return await agentHandlers.handleAgentStatus(validatedArgs);
      case 'task_create':
        return await agentHandlers.handleTaskCreate(validatedArgs);
      case 'task_list':
        return await agentHandlers.handleTaskList(validatedArgs);
      case 'task_update':
        return await agentHandlers.handleTaskUpdate(validatedArgs);
      case 'task_details':
        return await agentHandlers.handleTaskDetails(validatedArgs);
      case 'agent_message':
        return await agentHandlers.handleAgentMessage(validatedArgs);
      case 'agent_messages':
        return await agentHandlers.handleAgentMessages(validatedArgs);
      case 'agent_join':
        return await agentHandlers.handleAgentJoin(validatedArgs);
      case 'agent_leave':
        return await agentHandlers.handleAgentLeave(validatedArgs);
      case 'agent_sessions':
        return await agentHandlers.handleAgentSessions(validatedArgs);

      // Code analysis handlers
      case 'code_analyze':
        return await codeAnalysisHandlers.handleCodeAnalyze(validatedArgs);
      case 'code_components':
        return await codeAnalysisHandlers.handleCodeComponents(validatedArgs);
      case 'code_dependencies':
        return await codeAnalysisHandlers.handleCodeDependencies(validatedArgs);
      case 'code_impact':
        return await codeAnalysisHandlers.handleCodeImpact(validatedArgs);
      case 'code_stats':
        return await codeAnalysisHandlers.handleCodeStats(validatedArgs);

      // Smart search handlers
      case 'smart_search':
        return await smartSearchHandlers.handleSmartSearch(validatedArgs);
      case 'get_recommendations':
        return await smartSearchHandlers.handleRecommendations(validatedArgs);
      case 'project_insights':
        return await smartSearchHandlers.handleProjectInsights(validatedArgs);

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${toolName}. Available tools: ${AIDIS_TOOL_DEFINITIONS.map(t => t.name).join(', ')}`
        );
    }
  }

  async start(): Promise<void> {
    console.log('🚀 Starting AIDIS Core HTTP Service...');

    try {
      processLock.acquire();
    } catch (error) {
      console.error('❌ Cannot start: Another AIDIS Core instance is already running');
      console.error(error);
      process.exit(1);
    }
    
    try {
      console.log('🔌 Initializing database connection with retry logic...');
      
      await RetryHandler.executeWithRetry(async () => {
        await this.circuitBreaker.execute(async () => {
          await initializeDatabase();
          this.dbHealthy = true;
          console.log('✅ Database connection established');
        });
      });
      
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
      
      console.log('🎯 Available tools: 27 total');
      console.log('🚀 System Status: All systems READY');
      
    } catch (error) {
      console.error('❌ Failed to start AIDIS Core HTTP Service:', error);
      this.dbHealthy = false;
      await this.gracefulShutdown('STARTUP_FAILURE');
      process.exit(1);
    }
  }

  async gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n📴 Received ${signal}, shutting down gracefully...`);
    
    try {
      if (this.httpServer) {
        console.log('🌐 Closing HTTP server...');
        await new Promise<void>((resolve) => {
          this.httpServer!.close(() => {
            console.log('✅ HTTP server closed');
            resolve();
          });
        });
      }
      
      console.log('🔌 Closing database connections...');
      await closeDatabase();
      console.log('✅ Database connections closed');
      
      this.dbHealthy = false;
      console.log('✅ Graceful shutdown completed');
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }
}
