#!/usr/bin/env node

// Manual MCP client test to verify our server works
const { spawn } = require('child_process');

console.log('Testing MCP server manually...');

const server = spawn('/home/ridgetop/aidis/mcp-server/node_modules/.bin/tsx', 
  ['/home/ridgetop/aidis/mcp-server/test-mcp-ultra-minimal.ts'], 
  {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { 
      ...process.env, 
      NODE_ENV: 'development',
      AMP_CONNECTING: 'true',
      AIDIS_FORCE_STDIO: 'true'
    },
    cwd: '/home/ridgetop/aidis/mcp-server'
  }
);

server.stderr.on('data', (data) => {
  console.log('SERVER STDERR:', data.toString());
});

server.stdout.on('data', (data) => {
  console.log('SERVER STDOUT:', data.toString());
});

// Send MCP initialize request
const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  }
};

setTimeout(() => {
  console.log('Sending initialize request...');
  // MCP stdio uses newline-delimited JSON, not HTTP headers
  server.stdin.write(JSON.stringify(initRequest) + '\n');
}, 1000);

setTimeout(() => {
  console.log('Terminating test...');
  server.kill();
}, 5000);
