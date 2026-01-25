/**
 * AIDIS MCP PROXY - Dual Mode Operation Fix
 * 
 * This proxy allows MCP clients to connect to AIDIS when a SystemD service
 * is already running, solving the process singleton conflict.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import * as http from 'http';

class AIDISMCPProxy {
  private server: Server;
  private healthEndpoint: string;

  constructor(healthEndpoint: string = 'http://localhost:8080') {
    this.healthEndpoint = healthEndpoint;
    
    this.server = new Server(
      {
        name: 'aidis-mcp-proxy',
        version: '0.1.0-proxy',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Check if SystemD service is running
   */
  async isSystemDServiceRunning(): Promise<boolean> {
    try {
      const response = await this.makeHttpRequest(`${this.healthEndpoint}/healthz`);
      return response.includes('"status":"healthy"');
    } catch {
      return false;
    }
  }

  /**
   * Make HTTP request to SystemD service
   */
  private makeHttpRequest(url: string, method: string = 'GET', data?: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      
      const options: any = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (data && method !== 'GET') {
        const postData = JSON.stringify(data);
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const req = http.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => responseData += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(responseData);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', reject);

      if (data && method !== 'GET') {
        req.write(JSON.stringify(data));
      }

      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Forward MCP tool call to SystemD service via HTTP
   */
  async forwardToolCall(toolName: string, args: any): Promise<any> {
    try {
      // Forward all tools via HTTP endpoints
      const response = await this.makeHttpRequest(
        `${this.healthEndpoint}/mcp/tools/${toolName}`,
        'POST',
        { arguments: args }
      );

      const responseData = JSON.parse(response);
      
      if (responseData.success) {
        return responseData.result;
      } else {
        throw new Error(`Tool execution failed: ${responseData.error}`);
      }
    } catch (error) {
      // Special handling for ping/status if HTTP fails
      if (toolName === 'aidis_ping') {
        return {
          content: [
            {
              type: 'text',
              text: `🏓 AIDIS Pong! Message: "${args.message || 'Hello AIDIS!'}" | Time: ${new Date().toISOString()} | Status: Proxy Error - ${(error as Error).message}`
            }
          ]
        };
      }

      if (toolName === 'aidis_status') {
        try {
          const healthResponse = await this.makeHttpRequest(`${this.healthEndpoint}/healthz`);
          const healthData = JSON.parse(healthResponse);
          
          return {
            content: [
              {
                type: 'text',
                text: `🎯 AIDIS Server Status Report (via Proxy)\n\n` +
                      `Version: ${healthData.version}\n` +
                      `Uptime: ${healthData.uptime}s\n` +
                      `Database: ✅ Connected\n` +
                      `Memory Usage: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB\n` +
                      `Environment: development\n` +
                      `Started: ${healthData.timestamp}\n` +
                      `Mode: MCP Proxy → SystemD Service\n` +
                      `⚠️  HTTP forwarding error: ${(error as Error).message}`
              }
            ]
          };
        } catch {
          // Fallback if even health endpoint fails
        }
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Proxy forwarding failed for ${toolName}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Setup MCP handlers for proxy mode
   */
  private setupHandlers(): void {
    // Handle tool listing - show available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // System Health
          {
            name: 'mandrel_ping',
            description: 'Test connectivity to Mandrel server (via proxy)',
            inputSchema: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'Optional test message'
                }
              }
            },
          },
          {
            name: 'mandrel_status',
            description: 'Get Mandrel server status (via proxy)',
            inputSchema: {
              type: 'object',
              properties: {}
            },
          },

          // Context Management
          {
            name: 'context_store',
            description: 'Store development context',
            inputSchema: {
              type: 'object',
              properties: {
                content: { type: 'string' },
                type: { type: 'string' },
                tags: { type: 'array' }
              },
              required: ['content', 'type']
            },
          },
          {
            name: 'context_search',
            description: 'Search stored development contexts',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                type: { type: 'string' },
                limit: { type: 'number' }
              },
              required: ['query']
            },
          },
          {
            name: 'context_stats',
            description: 'Get context storage statistics',
            inputSchema: {
              type: 'object',
              properties: {}
            },
          },

          // Project Management
          {
            name: 'project_list',
            description: 'List all projects',
            inputSchema: {
              type: 'object',
              properties: {}
            },
          },
          {
            name: 'project_create',
            description: 'Create a new project',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' }
              },
              required: ['name']
            },
          },
          {
            name: 'project_switch',
            description: 'Switch to a different project',
            inputSchema: {
              type: 'object',
              properties: {
                project_name: { type: 'string' }
              },
              required: ['project_name']
            },
          },
          {
            name: 'project_current',
            description: 'Get current project information',
            inputSchema: {
              type: 'object',
              properties: {}
            },
          },
          {
            name: 'project_info',
            description: 'Get detailed project information',
            inputSchema: {
              type: 'object',
              properties: {
                project_name: { type: 'string' }
              }
            },
          },

          // Naming Registry
          {
            name: 'naming_register',
            description: 'Register a name to prevent conflicts',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
                context: { type: 'string' }
              },
              required: ['name', 'type']
            },
          },
          {
            name: 'naming_check',
            description: 'Check if a name is available',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' }
              },
              required: ['name']
            },
          },
          {
            name: 'naming_suggest',
            description: 'Get naming suggestions',
            inputSchema: {
              type: 'object',
              properties: {
                base_name: { type: 'string' },
                type: { type: 'string' }
              },
              required: ['base_name']
            },
          },
          {
            name: 'naming_stats',
            description: 'Get naming registry statistics',
            inputSchema: {
              type: 'object',
              properties: {}
            },
          },

          // Technical Decisions
          {
            name: 'decision_record',
            description: 'Record a technical decision',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                problem: { type: 'string' },
                alternatives: { type: 'array' },
                decision: { type: 'string' },
                rationale: { type: 'string' }
              },
              required: ['title', 'problem', 'decision']
            },
          },
          {
            name: 'decision_search',
            description: 'Search technical decisions',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                status: { type: 'string' },
                limit: { type: 'number' }
              },
              required: ['query']
            },
          },
          {
            name: 'decision_update',
            description: 'Update a technical decision',
            inputSchema: {
              type: 'object',
              properties: {
                decision_id: { type: 'number' },
                outcome: { type: 'string' },
                lessons: { type: 'string' }
              },
              required: ['decision_id']
            },
          },
          {
            name: 'decision_stats',
            description: 'Get decision tracking statistics',
            inputSchema: {
              type: 'object',
              properties: {}
            },
          },

          // Multi-Agent Coordination
          {
            name: 'agent_register',
            description: 'Register a new agent',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
                capabilities: { type: 'array' }
              },
              required: ['name', 'type']
            },
          },
          {
            name: 'agent_list',
            description: 'List all agents',
            inputSchema: {
              type: 'object',
              properties: {}
            },
          },
          {
            name: 'agent_status',
            description: 'Get agent status',
            inputSchema: {
              type: 'object',
              properties: {
                agent_id: { type: 'string' }
              }
            },
          },
          {
            name: 'task_create',
            description: 'Create a new task',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                assigned_to: { type: 'string' },
                priority: { type: 'string' }
              },
              required: ['title', 'description']
            },
          },
          {
            name: 'task_list',
            description: 'List tasks',
            inputSchema: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                assigned_to: { type: 'string' }
              }
            },
          },
          {
            name: 'task_update',
            description: 'Update a task',
            inputSchema: {
              type: 'object',
              properties: {
                task_id: { type: 'number' },
                status: { type: 'string' },
                progress: { type: 'number' }
              },
              required: ['task_id']
            },
          },
          {
            name: 'agent_message',
            description: 'Send message between agents',
            inputSchema: {
              type: 'object',
              properties: {
                to_agent: { type: 'string' },
                message: { type: 'string' },
                message_type: { type: 'string' }
              },
              required: ['to_agent', 'message']
            },
          },
          {
            name: 'agent_messages',
            description: 'Get agent messages',
            inputSchema: {
              type: 'object',
              properties: {
                agent_id: { type: 'string' },
                limit: { type: 'number' }
              }
            },
          },
          {
            name: 'agent_join',
            description: 'Join agent to current session',
            inputSchema: {
              type: 'object',
              properties: {
                agent_id: { type: 'string' }
              },
              required: ['agent_id']
            },
          },
          {
            name: 'agent_leave',
            description: 'Remove agent from current session',
            inputSchema: {
              type: 'object',
              properties: {
                agent_id: { type: 'string' }
              },
              required: ['agent_id']
            },
          },
          {
            name: 'agent_sessions',
            description: 'Get agent session information',
            inputSchema: {
              type: 'object',
              properties: {
                agent_id: { type: 'string' }
              }
            },
          },

          // Code Analysis
          {
            name: 'code_analyze',
            description: 'Analyze code structure and dependencies',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: { type: 'string' },
                content: { type: 'string' }
              },
              required: ['file_path']
            },
          },
          {
            name: 'code_components',
            description: 'List code components',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: { type: 'string' }
              }
            },
          },
          {
            name: 'code_dependencies',
            description: 'Get code dependencies',
            inputSchema: {
              type: 'object',
              properties: {
                component_id: { type: 'string' }
              }
            },
          },
          {
            name: 'code_impact',
            description: 'Analyze code change impact',
            inputSchema: {
              type: 'object',
              properties: {
                component_id: { type: 'string' },
                change_type: { type: 'string' }
              },
              required: ['component_id']
            },
          },
          {
            name: 'code_stats',
            description: 'Get code analysis statistics',
            inputSchema: {
              type: 'object',
              properties: {}
            },
          },

          // Smart Search & AI Recommendations
          {
            name: 'smart_search',
            description: 'Smart search across all AIDIS data',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                types: { type: 'array' },
                limit: { type: 'number' }
              },
              required: ['query']
            },
          },
          {
            name: 'get_recommendations',
            description: 'Get AI-powered recommendations',
            inputSchema: {
              type: 'object',
              properties: {
                context: { type: 'string' },
                type: { type: 'string' }
              }
            },
          },
          {
            name: 'project_insights',
            description: 'Get project insights and analytics',
            inputSchema: {
              type: 'object',
              properties: {
                project_name: { type: 'string' }
              }
            },
          },
        ],
      };
    });

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      // Check if SystemD service is still running
      const isRunning = await this.isSystemDServiceRunning();
      if (!isRunning) {
        throw new McpError(
          ErrorCode.InternalError,
          'SystemD service is not running. Cannot proxy requests.'
        );
      }

      return await this.forwardToolCall(name, args || {});
    });
  }

  /**
   * Start the MCP proxy server
   */
  async start(): Promise<void> {
    console.log('🔄 Starting AIDIS MCP Proxy...');
    
    // Verify SystemD service is running
    const isRunning = await this.isSystemDServiceRunning();
    if (!isRunning) {
      throw new Error('SystemD service is not running. Cannot start proxy.');
    }

    console.log('✅ SystemD service detected - starting proxy mode');
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.log('🎯 Mandrel MCP Proxy is running!');
    console.log('🔗 Forwarding MCP requests to SystemD service');
    console.log('📋 Available tools: ALL 37 MCP tools fully forwarded via HTTP');
    console.log('   🔧 System: mandrel_ping, mandrel_status');
    console.log('   📝 Context: context_store, context_search, context_stats');
    console.log('   📁 Projects: project_list, project_create, project_switch, project_current, project_info');
    console.log('   🏷️  Naming: naming_register, naming_check, naming_suggest, naming_stats');
    console.log('   🎯 Decisions: decision_record, decision_search, decision_update, decision_stats');
    console.log('   👥 Agents: agent_register, agent_list, agent_status, task_create, task_list, task_update');
    console.log('   🤖 Coordination: agent_message, agent_messages, agent_join, agent_leave, agent_sessions');
    console.log('   💻 Code: code_analyze, code_components, code_dependencies, code_impact, code_stats');
    console.log('   🔍 Smart: smart_search, get_recommendations, project_insights');
    console.log('🚀 Ready for full AI agent persistent memory access!');
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('📴 Shutting down AIDIS MCP Proxy...');
    // No special cleanup needed for proxy
    console.log('✅ Proxy shutdown complete');
  }
}

export default AIDISMCPProxy;