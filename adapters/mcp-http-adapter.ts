#!/usr/bin/env node

/**
 * Mandrel MCP HTTP Adapter - Production Ready
 *
 * HTTP protocol adapter that bridges Claude Code to Mandrel Core Service.
 *
 * ARCHITECTURE:
 * Claude Code (MCP) → mcp-http-adapter (STDIO↔HTTP) → Mandrel Core Service (HTTP API)
 *
 * FEATURES:
 * ✅ Dynamic tool discovery from core service
 * ✅ Environment-based configuration (MANDREL_URL)
 * ✅ Robust error handling and retry logic
 * ✅ Connection management with health checks
 * ✅ TypeScript with proper validation
 * ✅ No hardcoded tools - fully dynamic
 * ✅ Compatible with existing Claude Code MCP configuration
 *
 * ENVIRONMENT VARIABLES:
 * - MANDREL_URL: Core service URL (default: http://localhost:8080)
 * - MANDREL_TIMEOUT: Request timeout in ms (default: 30000)
 * - MANDREL_RETRIES: Max retry attempts (default: 3)
 * - MANDREL_DEBUG: Enable debug logging (default: false)
 *
 * DEPRECATED (still supported with warnings):
 * - AIDIS_URL, AIDIS_TIMEOUT, AIDIS_RETRIES, AIDIS_DEBUG
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
  CallToolResult,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

// Configuration with environment support
interface AdapterConfig {
  mandrelUrl: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  debug: boolean;
  healthCheckInterval: number;
}

// Helper to get env var with MANDREL_ preferred, AIDIS_ fallback
function getEnvWithFallback(mandrelKey: string, aidisKey: string, defaultValue: string): string {
  if (process.env[mandrelKey]) {
    return process.env[mandrelKey]!;
  }
  if (process.env[aidisKey]) {
    console.error(`⚠️  ${aidisKey} is deprecated. Use ${mandrelKey} instead.`);
    return process.env[aidisKey]!;
  }
  return defaultValue;
}

const CONFIG: AdapterConfig = {
  mandrelUrl: getEnvWithFallback('MANDREL_URL', 'AIDIS_URL', 'http://localhost:8080'),
  timeout: parseInt(getEnvWithFallback('MANDREL_TIMEOUT', 'AIDIS_TIMEOUT', '30000')),
  maxRetries: parseInt(getEnvWithFallback('MANDREL_RETRIES', 'AIDIS_RETRIES', '3')),
  retryDelay: 1000,
  debug: getEnvWithFallback('MANDREL_DEBUG', 'AIDIS_DEBUG', 'false') === 'true',
  healthCheckInterval: 60000 // 1 minute
};

// Tool definition from core service
interface MandrelTool {
  name: string;
  description: string;
  endpoint: string;
  inputSchema?: any; // pass-through from Mandrel tool definitions
}

// HTTP response interfaces
interface ToolListResponse {
  tools: MandrelTool[];
}

interface ToolCallResponse {
  success: boolean;
  result?: CallToolResult;
  error?: string;
  type?: string;
}

/**
 * HTTP Client with retry logic and error handling
 */
class HttpClient {
  private readonly config: AdapterConfig;

  constructor(config: AdapterConfig) {
    this.config = config;
  }

  /**
   * Make HTTP request with retry logic
   */
  async request(
    url: string,
    options: http.RequestOptions & { body?: string }
  ): Promise<string> {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const requestOptions: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'mandrel-mcp-http-adapter/1.0.0',
        ...options.headers
      },
      timeout: this.config.timeout
    };

    if (options.body) {
      (requestOptions.headers as any)['Content-Length'] = Buffer.byteLength(options.body);
    }

    let lastError: Error;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.makeRequest(httpModule, requestOptions, options.body);
      } catch (error) {
        lastError = error as Error;

        if (this.config.debug) {
          console.error(`🔄 Attempt ${attempt + 1}/${this.config.maxRetries + 1} failed:`, lastError.message);
        }

        if (attempt === this.config.maxRetries) {
          break;
        }

        // Exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, attempt);
        await this.delay(delay);
      }
    }

    throw new Error(`HTTP request failed after ${this.config.maxRetries + 1} attempts: ${lastError!.message}`);
  }

  /**
   * Make single HTTP request
   */
  private makeRequest(
    httpModule: typeof http | typeof https,
    options: http.RequestOptions,
    body?: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = httpModule.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data || res.statusMessage}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${this.config.timeout}ms`));
      });

      if (body) {
        req.write(body);
      }

      req.end();
    });
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Connection Manager - Health checks and service discovery
 */
class ConnectionManager {
  private httpClient: HttpClient;
  private isHealthy: boolean = false;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private cachedTools: Tool[] | null = null;
  private lastToolsUpdate: number = 0;
  private readonly toolsCacheDuration = 5 * 60 * 1000; // 5 minutes

  constructor(private config: AdapterConfig) {
    this.httpClient = new HttpClient(config);
  }

  /**
   * Initialize connection and start health monitoring
   */
  async initialize(): Promise<void> {
    if (this.config.debug) {
      console.error('🔌 Initializing connection to Mandrel Core Service...');
    }

    await this.checkHealth();

    if (!this.isHealthy) {
      throw new Error('Mandrel Core Service is not healthy');
    }

    // Start periodic health checks
    this.startHealthMonitoring();

    if (this.config.debug) {
      console.error('✅ Connection initialized successfully');
    }
  }

  /**
   * Check service health
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.httpClient.request(
        `${this.config.mandrelUrl}/healthz`,
        { method: 'GET' }
      );

      const health = JSON.parse(response);
      this.isHealthy = health.status === 'healthy';

      if (this.config.debug) {
        console.error(`💓 Health check: ${this.isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
      }

      return this.isHealthy;
    } catch (error) {
      this.isHealthy = false;
      if (this.config.debug) {
        console.error('❌ Health check failed:', (error as Error).message);
      }
      return false;
    }
  }

  /**
   * Get available tools from core service
   */
  async getTools(): Promise<Tool[]> {
    // Use cached tools if available and fresh
    const now = Date.now();
    if (this.cachedTools && (now - this.lastToolsUpdate) < this.toolsCacheDuration) {
      if (this.config.debug) {
        console.error('📋 Using cached tools');
      }
      return this.cachedTools;
    }

    try {
      const response = await this.httpClient.request(
        `${this.config.mandrelUrl}/mcp/tools`,
        { method: 'GET' }
      );

      const toolsResponse: ToolListResponse = JSON.parse(response);

      // Convert Mandrel tools to MCP tool format, preserving inputSchema from server
      this.cachedTools = toolsResponse.tools.map((tool: MandrelTool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema || {
          type: 'object' as const,
          properties: {},
          additionalProperties: true
        }
      }));

      this.lastToolsUpdate = now;

      if (this.config.debug) {
        console.error(`📋 Discovered ${this.cachedTools.length} tools from core service`);
      }

      return this.cachedTools;
    } catch (error) {
      if (this.cachedTools) {
        console.error('⚠️  Failed to refresh tools, using cached version:', (error as Error).message);
        return this.cachedTools;
      }
      throw new Error(`Failed to discover tools: ${(error as Error).message}`);
    }
  }

  /**
   * Call tool on core service
   */
  async callTool(toolName: string, args: any): Promise<CallToolResult> {
    if (!this.isHealthy) {
      await this.checkHealth();
      if (!this.isHealthy) {
        throw new McpError(ErrorCode.InternalError, 'Mandrel Core Service is unavailable');
      }
    }

    try {
      const body = JSON.stringify({
        arguments: args || {}
      });

      const response = await this.httpClient.request(
        `${this.config.mandrelUrl}/mcp/tools/${toolName}`,
        {
          method: 'POST',
          body
        }
      );

      const result: ToolCallResponse = JSON.parse(response);

      if (result.success && result.result) {
        return result.result;
      } else {
        throw new McpError(
          ErrorCode.InternalError,
          result.error || 'Tool execution failed'
        );
      }
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }

      // Convert HTTP errors to MCP errors
      const message = (error as Error).message;
      if (message.includes('timeout')) {
        throw new McpError(ErrorCode.InternalError, 'Tool execution timeout');
      } else if (message.includes('404')) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
      } else {
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${message}`);
      }
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.checkHealth();
    }, this.config.healthCheckInterval);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }
}

/**
 * Mandrel MCP HTTP Adapter - Main class
 */
class MandrelMcpHttpAdapter {
  private server: Server;
  private connectionManager: ConnectionManager;

  constructor(config: AdapterConfig) {
    this.connectionManager = new ConnectionManager(config);

    // Create MCP server
    this.server = new Server(
      {
        name: 'mandrel-mcp-http-adapter',
        version: '1.0.0',
        description: 'HTTP adapter for Mandrel Core Service'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers();
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // Handle tools list requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const tools = await this.connectionManager.getTools();
        return { tools };
      } catch (error) {
        if (CONFIG.debug) {
          console.error('❌ Failed to list tools:', (error as Error).message);
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to list tools: ${(error as Error).message}`
        );
      }
    });

    // Handle tool call requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (CONFIG.debug) {
        console.error(`🔧 Tool call: ${name}`);
      }

      try {
        return await this.connectionManager.callTool(name, args);
      } catch (error) {
        if (CONFIG.debug) {
          console.error(`❌ Tool call failed: ${name} - ${(error as Error).message}`);
        }

        if (error instanceof McpError) {
          throw error;
        }

        // Return error response in MCP format
        return {
          content: [
            {
              type: 'text',
              text: `❌ Error calling ${name}: ${(error as Error).message}`
            }
          ]
        };
      }
    });
  }

  /**
   * Start the adapter
   */
  async start(): Promise<void> {
    try {
      // Initialize connection to core service
      await this.connectionManager.initialize();

      // Connect MCP server to STDIO transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      if (CONFIG.debug) {
        console.error('🚀 Mandrel MCP HTTP Adapter started successfully');
        console.error(`🌐 Core Service URL: ${CONFIG.mandrelUrl}`);
        console.error(`⏱️  Timeout: ${CONFIG.timeout}ms`);
        console.error(`🔄 Max Retries: ${CONFIG.maxRetries}`);
      }

    } catch (error) {
      console.error('❌ Failed to start adapter:', (error as Error).message);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (CONFIG.debug) {
      console.error('📴 Shutting down Mandrel MCP HTTP Adapter...');
    }

    this.connectionManager.destroy();

    if (CONFIG.debug) {
      console.error('✅ Shutdown complete');
    }
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const adapter = new MandrelMcpHttpAdapter(CONFIG);

  // Handle shutdown signals
  process.on('SIGINT', async () => {
    await adapter.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await adapter.shutdown();
    process.exit(0);
  });

  // Start the adapter
  await adapter.start();
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

export { MandrelMcpHttpAdapter, CONFIG };
