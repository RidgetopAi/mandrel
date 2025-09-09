#!/usr/bin/env node

/**
 * MCP HTTP Wrapper for AIDIS
 * 
 * This creates an MCP server that forwards tool calls to our HTTP bridge.
 * This works around the Claude Code stdio MCP bugs.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} = require('@modelcontextprotocol/sdk/types.js');
const http = require('http');

// Create MCP server
const server = new Server(
  {
    name: 'aidis-http-wrapper',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Make HTTP request helper
function makeHttpRequest(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ success: false, error: 'Invalid JSON response' });
        }
      });
    }).on('error', reject);
  });
}

// Register tools/list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'aidis_ping',
        description: 'Test AIDIS connection and list available tools',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'aidis_status',
        description: 'Get AIDIS system status',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  
  if (name === 'aidis_ping') {
    try {
      const result = await makeHttpRequest('http://localhost:8082/ping');
      return {
        content: [
          {
            type: 'text',
            text: `AIDIS Connection Status: ${result.success ? '✅ CONNECTED' : '❌ FAILED'}\n` +
                  `Message: ${result.message}\n` +
                  `Service: ${result.service}\n` +
                  `Timestamp: ${result.timestamp}\n` +
                  `Available Tools: ${result.tools ? result.tools.join(', ') : 'none'}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ AIDIS Connection Failed: ${error.message}`
          }
        ]
      };
    }
  }

  if (name === 'aidis_status') {
    try {
      const result = await makeHttpRequest('http://localhost:8082/health');
      return {
        content: [
          {
            type: 'text',
            text: `AIDIS Health Status: ${result.status}\n` +
                  `Service: ${result.service}\n` +
                  `Port: ${result.port}\n` +
                  `Timestamp: ${result.timestamp}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ AIDIS Health Check Failed: ${error.message}`
          }
        ]
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🔗 AIDIS HTTP-MCP Wrapper started and connected');
}

main().catch((error) => {
  console.error('❌ Failed to start AIDIS HTTP-MCP wrapper:', error);
  process.exit(1);
});