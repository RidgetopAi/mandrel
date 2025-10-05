#!/usr/bin/env node

// Clone of Playwright MCP structure to test compatibility
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

// Same console redirection as our main server
if (process.env.AMP_CONNECTING === 'true') {
  const toStderr = (...args: any[]) => {
    try {
      const line = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
      process.stderr.write(line + '\n');
    } catch {}
  };
  console.log = toStderr as any;
  console.info = toStderr as any;
  console.warn = toStderr as any;
}

// Create server with same structure as we think Playwright uses
const server = new Server(
  {
    name: 'aidis-playwright-clone',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {
        listChanged: false
      },
    },
  }
);

// Add error handler like our main server
server.onerror = (error) => {
  console.log('❌ MCP SERVER ERROR:', error);
};

// Simple tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.log('[DEBUG] ListTools requested by MCP client');
  return {
    tools: [
      {
        name: 'aidis_test',
        description: 'Test AIDIS connectivity',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Test message'
            }
          }
        }
      }
    ]
  };
});

// Simple tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'aidis_test') {
    return {
      content: [
        {
          type: 'text' as const,
          text: `AIDIS Test: ${request.params.arguments?.message || 'Connection successful!'}`
        }
      ]
    };
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

// Connect transport - exactly like our main server
const transport = new StdioServerTransport();

transport.onclose = () => {
  console.log('❌ MCP transport closed');
};

server.connect(transport);

console.log('✅ AIDIS Playwright Clone ready for connections!');
