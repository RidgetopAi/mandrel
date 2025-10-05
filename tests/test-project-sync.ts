#!/usr/bin/env tsx

import { spawn } from 'child_process';

console.log('🧪 Testing Project Synchronization...\n');

// Test MCP connection directly
const mcpServer = spawn('npx', ['tsx', 'mcp-server/src/server.ts'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: '/home/ridgetop/aidis'
});

mcpServer.stdout.on('data', (data: Buffer) => {
  const output = data.toString();
  if (output.includes('AIDIS MCP Server is running')) {
    console.log('✅ MCP Server started successfully');
    testMCPConnection();
  }
});

mcpServer.stderr.on('data', (data: Buffer) => {
  console.error('MCP Server error:', data.toString());
});

function testMCPConnection() {
  // Send MCP initialization message
  const initMessage = {
    jsonrpc: '2.0',
    id: 'init-1',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };

  mcpServer.stdin.write(JSON.stringify(initMessage) + '\n');
  console.log('📤 Sent initialization message');

  setTimeout(() => {
    // Test project_current tool
    const projectCurrentMessage = {
      jsonrpc: '2.0',
      id: 'project-current-1',
      method: 'tools/call',
      params: {
        name: 'project_current',
        arguments: {}
      }
    };

    mcpServer.stdin.write(JSON.stringify(projectCurrentMessage) + '\n');
    console.log('📤 Testing project_current tool');
  }, 1000);
}

// Handle responses
mcpServer.stdout.on('data', (data: Buffer) => {
  const lines = data.toString().trim().split('\n');
  for (const line of lines) {
    if (line.startsWith('{')) {
      try {
        const response = JSON.parse(line);
        console.log('📥 MCP Response:', JSON.stringify(response, null, 2));
      } catch (e) {
        // Not JSON, likely server output
        console.log('📝 Server output:', line);
      }
    }
  }
});

// Cleanup after 10 seconds
setTimeout(() => {
  console.log('\n🔄 Cleaning up...');
  mcpServer.kill();
  process.exit(0);
}, 10000);
