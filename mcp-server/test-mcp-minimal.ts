#!/usr/bin/env node

// Minimal MCP server test to debug the connection issue
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

// Create minimal server
const server = new Server(
  {
    name: 'test-aidis',
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

// Add one simple tool
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'test_ping',
        description: 'Simple test tool',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Test message' }
          }
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'test_ping') {
    return {
      content: [
        {
          type: 'text',
          text: `Test ping successful: ${request.params.arguments?.message || 'no message'}`
        }
      ]
    };
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

// Connect to stdio transport
const transport = new StdioServerTransport();
server.connect(transport);

process.stderr.write('Minimal MCP test server started\n');
