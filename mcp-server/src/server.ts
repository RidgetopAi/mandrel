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

import { processLock } from './utils/processLock.js';

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
import { contextHandler } from './handlers/context.js';
import { projectHandler } from './handlers/project.js';
import { namingHandler } from './handlers/naming.js';
import { decisionsHandler } from './handlers/decisions.js';
import { agentsHandler } from './handlers/agents.js';
import { codeAnalysisHandler } from './handlers/codeAnalysis.js';
import { smartSearchHandler } from './handlers/smartSearch.js';
import { validationMiddleware } from './middleware/validation.js';
import { AIDISMCPProxy } from './utils/mcpProxy.js';

// Enterprise hardening constants
const PID_FILE = '/home/ridgetop/aidis/run/aidis.pid';
const HEALTH_PORT = process.env.AIDIS_HEALTH_PORT || 8080;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

/**
 * Check if SystemD AIDIS service is already running
 */
async function isSystemDServiceRunning(): Promise<boolean> {
  try {
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${HEALTH_PORT}/healthz`, (res) => {
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

// Enable MCP debug logging
if (process.env.MCP_DEBUG) {
  console.log('🐛 MCP Debug logging enabled:', process.env.MCP_DEBUG);
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
   * Setup Health Check Server with MCP Tool Endpoints
   */
  private setupHealthServer(): void {
    this.healthServer = http.createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      
      if (req.url === '/healthz') {
        // Basic health check - always returns 200 if server is responding
        res.writeHead(200);
        res.end(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          pid: process.pid,
          version: '0.1.0-hardened'
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

      // Execute the tool using the same logic as MCP handler
      const result = await this.executeMcpTool(toolName, args);

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        result
      }));

    } catch (error: any) {
      console.error('🚨 MCP Tool HTTP Error:', error);
      
      res.writeHead(500);
      res.end(JSON.stringify({
        success: false,
        error: error.message,
        type: error.constructor.name
      }));
    }
  }

  /**
   * Execute MCP Tool (shared logic for both MCP and HTTP)
   */
  private async executeMcpTool(toolName: string, args: any): Promise<any> {
    // ORACLE HARDENING: Input validation middleware
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

      case 'context_store':
        return await this.handleContextStore(validatedArgs as any);
        
      case 'context_search':
        return await this.handleContextSearch(validatedArgs as any);
        
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
        return await this.handleNamingRegister(args as any);
        
      case 'naming_check':
        return await this.handleNamingCheck(args as any);
        
      case 'naming_suggest':
        return await this.handleNamingSuggest(args as any);
        
      case 'naming_stats':
        return await this.handleNamingStats(args as any);

      case 'decision_record':
        return await this.handleDecisionRecord(args as any);
        
      case 'decision_search':
        return await this.handleDecisionSearch(args as any);
        
      case 'decision_update':
        return await this.handleDecisionUpdate(args as any);
        
      case 'decision_stats':
        return await this.handleDecisionStats(args as any);
        
      case 'agent_register':
        return await this.handleAgentRegister(args as any);
        
      case 'agent_list':
        return await this.handleAgentList(args as any);
        
      case 'agent_status':
        return await this.handleAgentStatus(args as any);
        
      case 'task_create':
        return await this.handleTaskCreate(args as any);
        
      case 'task_list':
        return await this.handleTaskList(args as any);
        
      case 'task_update':
        return await this.handleTaskUpdate(args as any);
        
      case 'agent_message':
        return await this.handleAgentMessage(args as any);
        
      case 'agent_messages':
        return await this.handleAgentMessages(args as any);
        
      case 'agent_join':
        return await this.handleAgentJoin(args as any);
        
      case 'agent_leave':
        return await this.handleAgentLeave(args as any);
        
      case 'agent_sessions':
        return await this.handleAgentSessions(args as any);
        
      case 'code_analyze':
        return await this.handleCodeAnalyze(args as any);
        
      case 'code_components':
        return await this.handleCodeComponents(args as any);
        
      case 'code_dependencies':
        return await this.handleCodeDependencies(args as any);
        
      case 'code_impact':
        return await this.handleCodeImpact(args as any);
        
      case 'code_stats':
        return await this.handleCodeStats(args as any);
        
      case 'smart_search':
        return await this.handleSmartSearch(args as any);
        
      case 'get_recommendations':
        return await this.handleRecommendations(args as any);
        
      case 'project_insights':
        return await this.handleProjectInsights(args as any);
        
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
                  enum: ['code', 'decision', 'error', 'discussion', 'planning', 'completion', 'milestone'],
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
                  enum: ['code', 'decision', 'error', 'discussion', 'planning', 'completion'],
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
            name: 'agent_register',
            description: 'Register an AI agent for multi-agent coordination',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Unique agent name'
                },
                type: {
                  type: 'string',
                  description: 'Agent type (ai_assistant, code_reviewer, tester, etc.)',
                  default: 'ai_assistant'
                },
                capabilities: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Agent capabilities (coding, testing, review, etc.)',
                  default: ['coding']
                },
                metadata: {
                  type: 'object',
                  description: 'Additional agent metadata'
                }
              },
              required: ['name']
            },
          },
          {
            name: 'agent_list',
            description: 'List all registered agents, optionally filtered by project',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: {
                  type: 'string',
                  description: 'Optional project ID to filter agents (uses current if not specified)'
                }
              }
            },
          },
          {
            name: 'agent_status',
            description: 'Update agent status (active, busy, offline, error)',
            inputSchema: {
              type: 'object',
              properties: {
                agentId: {
                  type: 'string',
                  description: 'Agent ID'
                },
                status: {
                  type: 'string',
                  enum: ['active', 'busy', 'offline', 'error'],
                  description: 'New agent status'
                },
                metadata: {
                  type: 'object',
                  description: 'Additional status metadata'
                }
              },
              required: ['agentId', 'status']
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
                  description: 'Filter by task status'
                },
                type: {
                  type: 'string',
                  description: 'Filter by task type'
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
            name: 'agent_message',
            description: 'Send a message between agents',
            inputSchema: {
              type: 'object',
              properties: {
                fromAgentId: {
                  type: 'string',
                  description: 'Sending agent ID'
                },
                content: {
                  type: 'string',
                  description: 'Message content'
                },
                toAgentId: {
                  type: 'string',
                  description: 'Receiving agent ID (omit for broadcast)'
                },
                messageType: {
                  type: 'string',
                  description: 'Message type (info, request, response, alert, coordination)',
                  default: 'info'
                },
                title: {
                  type: 'string',
                  description: 'Message title'
                },
                contextRefs: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'References to relevant context IDs'
                },
                taskRefs: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'References to relevant task IDs'
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                },
                metadata: {
                  type: 'object',
                  description: 'Additional message metadata'
                }
              },
              required: ['fromAgentId', 'content']
            },
          },
          {
            name: 'agent_messages',
            description: 'Get messages for an agent or project',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                },
                agentId: {
                  type: 'string',
                  description: 'Filter messages for specific agent'
                },
                messageType: {
                  type: 'string',
                  description: 'Filter by message type'
                },
                unreadOnly: {
                  type: 'boolean',
                  description: 'Only return unread messages',
                  default: false
                }
              }
            },
          },
          {
            name: 'agent_join',
            description: 'Join an agent to a project session',
            inputSchema: {
              type: 'object',
              properties: {
                agentId: {
                  type: 'string',
                  description: 'Agent ID or name to join'
                },
                sessionId: {
                  type: 'string',
                  description: 'Session identifier',
                  default: 'default-session'
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                }
              },
              required: ['agentId']
            },
          },
          {
            name: 'agent_leave',
            description: 'Remove an agent from a project session',
            inputSchema: {
              type: 'object',
              properties: {
                agentId: {
                  type: 'string',
                  description: 'Agent ID or name to remove'
                },
                sessionId: {
                  type: 'string',
                  description: 'Session identifier',
                  default: 'default-session'
                },
                projectId: {
                  type: 'string',
                  description: 'Optional project ID (uses current if not specified)'
                }
              },
              required: ['agentId']
            },
          },
          {
            name: 'agent_sessions',
            description: 'List active agent sessions for a project',
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
        ],
      };
    });

    // Handle tool execution requests - actually runs the tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Use shared tool execution logic
        return await this.executeMcpTool(name, args || {});
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
                `Started: ${status.startTime}`,
        },
      ],
    };
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
             `   📝 "${result.content.length > 80 ? result.content.substring(0, 80) + '...' : result.content}"\n` +
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
   * Handle project switching requests
   */
  private async handleProjectSwitch(args: any) {
    console.log(`🔄 Project switch request: "${args.project}"`);
    
    const project = await projectHandler.switchProject(args.project);

    return {
      content: [
        {
          type: 'text',
          text: `✅ Switched to project: **${project.name}** 🟢\n\n` +
                `📄 Description: ${project.description || 'No description'}\n` +
                `📊 Status: ${project.status}\n` +
                `📈 Contexts: ${project.contextCount || 0}\n` +
                `⏰ Last Updated: ${project.updatedAt.toISOString().split('T')[0]}\n\n` +
                `🎯 All context operations will now use this project by default`
        },
      ],
    };
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
                suggestions.map((name, i) => `${i + 1}. ${name}`).join('\n') + '\n\n' +
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
        host: process.env.DATABASE_HOST || 'localhost',
        port: process.env.DATABASE_PORT || '5432',
        database: process.env.DATABASE_NAME || 'aidis_development',
      },
      memory: {
        used: memoryUsage.rss,
        heap: memoryUsage.heapUsed,
        external: memoryUsage.external,
      },
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
    const projectId = args.projectId || await projectHandler.getCurrentProjectId('default-session');
    
    const task = await agentsHandler.createTask(
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
    const tasks = await agentsHandler.listTasks(projectId, args.assignedTo, args.status, args.type);

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
                `💡 Update tasks with: task_update\n` +
                `🤖 Assign to agents with: task_update`
        },
      ],
    };
  }

  /**
   * Handle task update requests
   */
  private async handleTaskUpdate(args: any) {
    await agentsHandler.updateTaskStatus(args.taskId, args.status, args.assignedTo, args.metadata);

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
   * Handle agent message requests
   */
  private async handleAgentMessage(args: any) {
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
  console.log('🚀 Starting AIDIS MCP Server (Enterprise Hardened)...');

  // ORACLE FIX #1: Enforce process singleton (CRITICAL)
  try {
  processLock.acquire();
  } catch (error) {
    console.error('❌ Cannot start: Another AIDIS instance is already running');
      console.error(error);
      process.exit(1);
    }
    
    try {
      // ORACLE FIX #2: Initialize database with retry and circuit breaker
      console.log('🔌 Initializing database connection with retry logic...');
      
      await RetryHandler.executeWithRetry(async () => {
        await this.circuitBreaker.execute(async () => {
          await initializeDatabase();
          this.dbHealthy = true;
          console.log('✅ Database connection established');
        });
      });
      
      // ORACLE FIX #3: Start health check server
      console.log(`🏥 Starting health check server on port ${HEALTH_PORT}...`);
      this.healthServer?.listen(HEALTH_PORT, () => {
        console.log(`✅ Health endpoints available:`);
        console.log(`   🏥 Liveness:  http://localhost:${HEALTH_PORT}/healthz`);
        console.log(`   🎯 Readiness: http://localhost:${HEALTH_PORT}/readyz`);
      });
      
      // ORACLE FIX #4: Create transport with MCP debug logging
      console.log('🔗 Creating MCP transport with debug logging...');
      const transport = new StdioServerTransport();
      
      // Enhanced connection logging
      console.log('🤝 Connecting to MCP transport...');
      await this.server.connect(transport);
      
      console.log('✅ AIDIS MCP Server is running and ready for connections!');
      console.log('🔒 Enterprise Security Features:');
      console.log(`   🔒 Process Singleton: ACTIVE (PID: ${process.pid})`);
      console.log(`   🏥 Health Endpoints: http://localhost:${HEALTH_PORT}/healthz,readyz`);
      console.log(`   🔄 Retry Logic: ${MAX_RETRIES} attempts with exponential backoff`);
      console.log(`   ⚡ Circuit Breaker: ${this.circuitBreaker.getState().toUpperCase()}`);
      console.log(`   🐛 MCP Debug: ${process.env.MCP_DEBUG || 'DISABLED'}`);
      
      console.log('🎯 Available tools:');
      console.log('   📊 System: aidis_ping, aidis_status');
      console.log('   📝 Context: context_store, context_search, context_stats');
      console.log('   📋 Projects: project_list, project_create, project_switch, project_current, project_info');
      console.log('   🏷️  Naming: naming_register, naming_check, naming_suggest, naming_stats');
      console.log('   📋 Decisions: decision_record, decision_search, decision_update, decision_stats');
      console.log('   🤖 Agents: agent_register, agent_list, agent_status, agent_join, agent_leave, agent_sessions');
      console.log('   📋 Tasks: task_create, task_list, task_update, agent_message, agent_messages');
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
      
    } catch (error) {
      console.error('❌ Failed to start AIDIS MCP Server:', error);
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
      // Close health check server
      if (this.healthServer) {
        console.log('🏥 Closing health check server...');
        await new Promise<void>((resolve) => {
          this.healthServer!.close(() => {
            console.log('✅ Health check server closed');
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
  
  // DUAL MODE OPERATION: Check if SystemD service is already running
  isSystemDServiceRunning().then(async (serviceRunning) => {
    try {
      if (serviceRunning) {
        // SystemD service is running - start MCP Proxy Mode
        console.log('🔄 SystemD service detected - starting MCP Proxy Mode');
        console.log('🎯 This will allow MCP clients to connect to the SystemD service');
        
        const proxy = new AIDISMCPProxy();
        await proxy.start();
        
        // Setup proxy shutdown handling
        const shutdownProxy = async (signal: string) => {
          console.log(`\n📴 Received ${signal}, shutting down MCP proxy...`);
          await proxy.shutdown();
          process.exit(0);
        };
        
        process.on('SIGINT', () => shutdownProxy('SIGINT'));
        process.on('SIGTERM', () => shutdownProxy('SIGTERM'));
        
      } else {
        // No SystemD service - start Full Server Mode
        console.log('🚀 No SystemD service detected - starting Full Server Mode');
        
        serverInstance = new AIDISServer();
        
        // Start with enhanced error handling
        serverInstance.start().catch((error) => {
          console.error('❌ Unhandled startup error:', error);
          
          // Attempt graceful cleanup even on startup failure
          if (serverInstance) {
            serverInstance.gracefulShutdown('STARTUP_ERROR').finally(() => {
              process.exit(1);
            });
          } else {
            process.exit(1);
          }
        });
      }
    } catch (error) {
      console.error('❌ Failed to determine startup mode:', error);
      process.exit(1);
    }
  });
}

export { AIDISServer };
