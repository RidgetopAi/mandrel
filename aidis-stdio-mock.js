#!/usr/bin/env node

/**
 * AIDIS STDIO Mock Server
 * 
 * Acts as MCP STDIO server that translates calls to HTTP bridge
 * Provides stable testing interface without session restart issues
 */

const http = require('http');

const BRIDGE_URL = 'http://localhost:8080/mcp/tools';

class AidisStdioMock {
  constructor() {
    this.messageId = 1;
    this.cachedTools = null; // Cache for discovered tools
    this.toolsFetchAttempted = false; // Track if we've tried to fetch
  }

  /**
   * Fetch available tools from aidis_help endpoint
   * Returns array of tool definitions with proper MCP schema
   */
  async fetchAvailableTools() {
    try {
      console.error("🔍 Fetching tool schemas from HTTP bridge...");
      const schemaResponse = await this.makeHttpSchemaCall();

      if (!schemaResponse.success || !schemaResponse.tools) {
        throw new Error('Schema endpoint returned invalid response');
      }

      console.error(`✅ Loaded ${schemaResponse.tools.length} tools with full schemas from /mcp/tools/schemas`);
      return schemaResponse.tools;
    } catch (error) {
      console.error(`⚠️  Failed to fetch schemas: ${error.message}`);
      console.error("📋 Falling back to essential tools with proper schemas");
      return this.getEssentialTools();
    }
  }

  /**
   * Fetch tool schemas from HTTP bridge /mcp/tools/schemas endpoint
   * Returns complete MCP tool definitions with full inputSchema objects
   */
  async makeHttpSchemaCall() {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 8080,
        path: '/mcp/tools/schemas',
        method: 'GET'
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Invalid JSON from schemas endpoint: ${data.substring(0, 100)}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Schema fetch timeout'));
      });
      req.end();
    });
  }

  /**
   * Parse tool definitions from aidis_help text output
   * Extracts tool names and descriptions using regex
   */
  parseToolsFromHelpText(helpText) {
    const tools = [];
    // Match pattern: • **tool_name** - Description
    const toolRegex = /•\s+\*\*([a-z_]+)\*\*\s+-\s+(.+?)(?=\n|$)/g;

    let match;
    while ((match = toolRegex.exec(helpText)) !== null) {
      const [, name, description] = match;

      // Create MCP-compliant tool definition with generic schema
      // All tools accept optional parameters as we can't determine exact schema from help text
      tools.push({
        name: name.trim(),
        description: description.trim(),
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true // Allow any parameters
        }
      });
    }

    return tools;
  }

  /**
   * Get essential fallback tools if dynamic discovery fails
   * These 10 tools cover critical AIDIS functionality
   */
  getEssentialTools() {
    return [
      {
        name: "aidis_help",
        description: "List all AIDIS tools",
        inputSchema: { type: "object", properties: {}, required: [] }
      },
      {
        name: "aidis_ping",
        description: "Test AIDIS connection",
        inputSchema: { type: "object", properties: {}, required: [] }
      },
      {
        name: "aidis_status",
        description: "Get server status",
        inputSchema: { type: "object", properties: {}, required: [] }
      },
      {
        name: "context_store",
        description: "Store context",
        inputSchema: {
          type: "object",
          properties: {
            content: { type: "string" },
            type: { type: "string" },
            tags: { type: "array", items: { type: "string" } }
          },
          required: ["content", "type"]
        }
      },
      {
        name: "context_search",
        description: "Search contexts",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            limit: { type: "number" }
          },
          required: ["query"]
        }
      },
      {
        name: "context_get_recent",
        description: "Get recent contexts",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number" }
          },
          required: []
        }
      },
      {
        name: "project_current",
        description: "Get current project",
        inputSchema: { type: "object", properties: {}, required: [] }
      },
      {
        name: "project_list",
        description: "List all projects",
        inputSchema: { type: "object", properties: {}, required: [] }
      },
      {
        name: "project_switch",
        description: "Switch to a project",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string" }
          },
          required: ["project"]
        }
      },
      {
        name: "session_status",
        description: "Get session status",
        inputSchema: { type: "object", properties: {}, required: [] }
      }
    ];
  }

  writeMessage(obj) {
    const payload = Buffer.from(JSON.stringify(obj), 'utf8');
    const header = Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, 'utf8');
    process.stdout.write(header);
    process.stdout.write(payload);
  }

  async makeHttpCall(toolName, params = {}) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(params);
      
      const options = {
        hostname: 'localhost',
        port: 8080,
        path: `/mcp/tools/${toolName}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.write(postData);
      req.end();
    });
  }

  async handleToolCall(request) {
    const { method, params } = request;

    if (method === 'tools/call') {
      const { name, arguments: args } = params;

      // DEBUG: Track tool calls to detect duplicates
      const callTimestamp = Date.now();
      console.error(`🔍 STDIO TOOL CALL: ${name} at ${callTimestamp} - Request ID: ${request.id}`);

      try {
        // Wrap parameters in "arguments" object for HTTP bridge
        const bridgeParams = { arguments: args || {} };
        console.error(`🌉 HTTP CALL TO: http://localhost:8080/mcp/tools/${name}`);
        const httpResponse = await this.makeHttpCall(name, bridgeParams);
        console.error(`✅ HTTP RESPONSE from ${name}: success=${httpResponse.success}`);
        
        if (httpResponse.success) {
          return {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              content: httpResponse.result?.content || [{ 
                type: "text", 
                text: JSON.stringify(httpResponse.result || httpResponse, null, 2)
              }],
              isError: false
            }
          };
        } else {
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: -32603,
              message: httpResponse.error || "Tool execution failed"
            }
          };
        }
      } catch (error) {
        return {
          jsonrpc: "2.0", 
          id: request.id,
          error: {
            code: -32603,
            message: `HTTP bridge error: ${error.message}`
          }
        };
      }
    }

    if (method === 'tools/list') {
      // Dynamically fetch and cache tool list from aidis_help
      if (!this.cachedTools && !this.toolsFetchAttempted) {
        this.toolsFetchAttempted = true;
        this.cachedTools = await this.fetchAvailableTools();
      }

      // Use cached tools or fallback to essential if fetch failed
      const tools = this.cachedTools || this.getEssentialTools();

      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: tools
        }
      };
    }

    if (method === 'initialize') {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
            resources: {}
          },
          serverInfo: {
            name: "aidis-stdio-mock",
            version: "2.0.0" // v2.0.0: Dynamic tool discovery
          }
        }
      };
    }

    if (method === 'notifications/initialized') {
      // Notifications don't require a response
      return null;
    }

    if (method === 'resources/list') {
      // Return empty resources list since we're focusing on tools
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          resources: []
        }
      };
    }

    if (method === 'resources/read') {
      const { uri } = params;
      // Treat resource URI as tool name for compatibility
      try {
        const httpResponse = await this.makeHttpCall(uri, {});
        
        if (httpResponse.success) {
          return {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              contents: [{
                uri: uri,
                mimeType: "text/plain",
                text: httpResponse.result?.content?.[0]?.text || JSON.stringify(httpResponse.result || httpResponse, null, 2)
              }]
            }
          };
        } else {
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: -32603,
              message: httpResponse.error || "Resource read failed"
            }
          };
        }
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32603,
            message: `Resource read error: ${error.message}`
          }
        };
      }
    }

    return {
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`
      }
    };
  }

  start() {
    console.error("🚀 AIDIS STDIO Mock Server starting...");
    console.error("📡 Bridging STDIO ↔ HTTP on port 8080");
    
    let buffer = Buffer.alloc(0);

    process.stdin.on('data', async (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      
      // Process raw JSON lines (Amp format)
      const text = buffer.toString('utf8');
      const lines = text.split('\n');
      
      // Process complete lines, keep incomplete last line in buffer
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          console.error(`📥 RECEIVED: ${line}`);
          
          try {
            const request = JSON.parse(line);
            const response = await this.handleToolCall(request);
            
            if (response !== null) {
              const responseJson = JSON.stringify(response);
              console.error(`📤 SENDING: ${responseJson}`);
              process.stdout.write(responseJson + '\n');
            }
          } catch (error) {
            console.error(`❌ ERROR: ${error.message}`);
            const errorResponse = {
              jsonrpc: "2.0",
              id: null,
              error: { code: -32700, message: "Parse error" }
            };
            process.stdout.write(JSON.stringify(errorResponse) + '\n');
          }
        }
      }
      
      // Keep incomplete line in buffer
      const remainder = lines[lines.length - 1];
      buffer = Buffer.from(remainder, 'utf8');
    });

    console.error("✅ AIDIS STDIO Mock ready for MCP protocol (raw JSON)");
  }
}

const mock = new AidisStdioMock();
mock.start();
