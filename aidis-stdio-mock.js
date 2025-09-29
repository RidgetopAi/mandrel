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
      
      try {
        // Wrap parameters in "arguments" object for HTTP bridge
        const bridgeParams = { arguments: args || {} };
        const httpResponse = await this.makeHttpCall(name, bridgeParams);
        
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
      // Return list of available tools with proper inputSchema
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: [
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
              name: "project_current", 
              description: "Get current project",
              inputSchema: { type: "object", properties: {}, required: [] }
            }
          ]
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
            version: "1.0.0"
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
