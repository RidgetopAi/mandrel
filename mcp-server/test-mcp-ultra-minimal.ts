#!/usr/bin/env node

// Ultra minimal MCP server for debugging
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

// Redirect console to stderr in stdio mode
if (process.env.AMP_CONNECTING === 'true') {
  console.log = (...args: any[]) => process.stderr.write(args.join(' ') + '\n');
}

const server = new Server(
  { name: 'ultra-minimal-test', version: '1.0.0' },
  { capabilities: { tools: { listChanged: false } } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{ name: 'test', description: 'Test', inputSchema: { type: 'object' } }]
}));

server.setRequestHandler(CallToolRequestSchema, async () => ({
  content: [{ type: 'text' as const, text: 'Test successful' }]
}));

const transport = new StdioServerTransport();
server.connect(transport);

process.stderr.write('Ultra minimal test server ready\n');
