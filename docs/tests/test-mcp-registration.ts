#!/usr/bin/env npx tsx

/**
 * Test MCP tool registration for aidis_explain
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn } from 'child_process';
import { Readable, Writable } from 'stream';

async function testMCPRegistration() {
  console.log('🔧 Testing MCP tool registration...\n');

  // Simulate stdio streams
  const mockStdin = new Readable({ read() {} });
  const mockStdout = new Writable({ write(chunk, encoding, callback) { callback(); } });

  try {
    // Import the server directly to check tool registration
    const serverModule = await import('./mcp-server/src/server.js');
    
    console.log('✅ Server module loaded successfully');
    
    // Try to start a server process to check if aidis_explain is listed
    const server = spawn('node', ['/home/ridgetop/aidis/mcp-server/node_modules/.bin/tsx', 'src/server.ts'], {
      cwd: '/home/ridgetop/aidis/mcp-server',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    
    server.stdout.on('data', (data) => {
      output += data.toString();
    });

    // Send list_tools request
    const listToolsRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {}
    };

    server.stdin.write(JSON.stringify(listToolsRequest) + '\n');

    // Wait for response
    setTimeout(() => {
      server.kill();
      
      console.log('📋 Server startup output:');
      console.log(output.substring(0, 500) + '...\n');
      
      if (output.includes('aidis_explain')) {
        console.log('✅ aidis_explain appears to be registered');
      } else {
        console.log('⚠️  aidis_explain not found in output');
      }
      
      console.log('🎯 MCP registration test complete');
    }, 3000);
    
  } catch (error) {
    console.log('❌ Error testing MCP registration:', error);
  }
}

testMCPRegistration().catch(console.error);
