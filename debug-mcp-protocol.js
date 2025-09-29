#!/usr/bin/env node

/**
 * MCP Protocol Debugger
 * 
 * Logs all MCP STDIO messages to help trace protocol issues
 * Usage: node debug-mcp-protocol.js
 * Monitor: tail -f logs/mcp-debug.log
 */

const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

const logFile = path.join(logsDir, 'mcp-debug.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  
  // Write to file
  fs.appendFileSync(logFile, logEntry);
  
  // Also write to stderr so it doesn't interfere with STDIO protocol
  process.stderr.write(logEntry);
}

function logBuffer(direction, buffer) {
  const hex = buffer.toString('hex');
  const text = buffer.toString('utf8');
  log(`${direction} BUFFER (${buffer.length} bytes):`);
  log(`  HEX: ${hex.substring(0, 100)}${hex.length > 100 ? '...' : ''}`);
  log(`  TEXT: ${JSON.stringify(text.substring(0, 200))}${text.length > 200 ? '...' : ''}`);
}

class MCPProtocolDebugger {
  constructor() {
    this.messageId = 1;
    this.inputBuffer = Buffer.alloc(0);
    
    log('🔍 MCP Protocol Debugger started');
    log('📝 Monitor with: tail -f logs/mcp-debug.log');
  }

  writeMessage(obj) {
    const json = JSON.stringify(obj);
    const payload = Buffer.from(json, 'utf8');
    const header = Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, 'utf8');
    const full = Buffer.concat([header, payload]);
    
    log(`📤 SENDING MESSAGE:`);
    log(`  JSON: ${json}`);
    logBuffer('📤', full);
    
    process.stdout.write(full);
  }

  parseMessage(buffer) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return null;

    const headerStr = buffer.slice(0, headerEnd).toString('utf8');
    const match = headerStr.match(/Content-Length:\s*(\d+)/i);
    if (!match) return null;

    const contentLength = parseInt(match[1], 10);
    const total = headerEnd + 4 + contentLength;
    if (buffer.length < total) return null;

    const body = buffer.slice(headerEnd + 4, total).toString('utf8');
    return { message: body, consumed: total };
  }

  async handleMessage(request) {
    log(`📥 RECEIVED MESSAGE: ${JSON.stringify(request)}`);

    if (request.method === 'initialize') {
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
            resources: {}
          },
          serverInfo: {
            name: "mcp-debugger",
            version: "1.0.0"
          }
        }
      };
      
      log(`🤝 INITIALIZE handshake`);
      return response;
    }

    if (request.method === 'tools/list') {
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: [
            {
              name: "debug_ping",
              description: "Debug ping tool",
              inputSchema: { type: "object", properties: {}, required: [] }
            }
          ]
        }
      };
      
      log(`🔧 TOOLS LIST requested`);
      return response;
    }

    if (request.method === 'tools/call') {
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [{
            type: "text",
            text: `Debug response for tool: ${request.params?.name}`
          }],
          isError: false
        }
      };
      
      log(`⚡ TOOL CALL: ${request.params?.name}`);
      return response;
    }

    if (request.method === 'notifications/initialized') {
      log(`🔔 NOTIFICATION: initialized`);
      // Notifications don't require a response
      return null;
    }

    log(`❓ UNKNOWN METHOD: ${request.method}`);
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32601,
        message: `Method not found: ${request.method}`
      }
    };
  }

  start() {
    log('🚀 Starting MCP protocol listener...');
    
    process.stdin.on('data', async (chunk) => {
      logBuffer('📥', chunk);
      
      this.inputBuffer = Buffer.concat([this.inputBuffer, chunk]);
      
      // Try both protocols: MCP STDIO framing OR raw JSON lines
      let foundMessage = false;
      
      // Try MCP STDIO framing first
      while (true) {
        const parsed = this.parseMessage(this.inputBuffer);
        if (!parsed) break;
        
        this.inputBuffer = this.inputBuffer.slice(parsed.consumed);
        foundMessage = true;
        
        try {
          const request = JSON.parse(parsed.message);
          const response = await this.handleMessage(request);
          this.writeMessage(response);
        } catch (error) {
          log(`❌ ERROR parsing framed message: ${error.message}`);
          log(`   Raw message: ${parsed.message}`);
        }
      }
      
      // If no framed messages, try raw JSON (newline delimited)
      if (!foundMessage) {
        const text = this.inputBuffer.toString('utf8');
        const lines = text.split('\n');
        
        // Process complete lines, keep incomplete last line in buffer
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line) {
            log(`📥 RAW JSON LINE: ${line}`);
            try {
              const request = JSON.parse(line);
              const response = await this.handleMessage(request);
              // For raw JSON, respond with raw JSON (no framing)
              if (response !== null) {
                const responseJson = JSON.stringify(response);
                log(`📤 RAW JSON RESPONSE: ${responseJson}`);
                process.stdout.write(responseJson + '\n');
              }
            } catch (error) {
              log(`❌ ERROR parsing JSON line: ${error.message}`);
              log(`   Raw line: ${line}`);
            }
          }
        }
        
        // Keep incomplete line in buffer
        const remainder = lines[lines.length - 1];
        this.inputBuffer = Buffer.from(remainder, 'utf8');
      }
    });
    
    process.stdin.on('end', () => {
      log('🔚 STDIN closed');
    });
    
    log('✅ MCP debugger ready for protocol messages (framed + raw JSON)');
  }
}

// Clear log file on start
fs.writeFileSync(logFile, '');

const mcpDebugger = new MCPProtocolDebugger();
mcpDebugger.start();
