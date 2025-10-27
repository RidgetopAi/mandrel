#!/usr/bin/env node

/**
 * Debug test for smart_search vs context_search to compare behavior
 */

import { spawn } from 'child_process';

async function testTool(toolName: string, params: any): Promise<void> {
  console.log(`\n🧪 Testing ${toolName} with params:`, JSON.stringify(params, null, 2));
  
  return new Promise((resolve, reject) => {
    const child = spawn('node', [
      '-e', 
      `
      const { spawn } = require('child_process');
      
      const mcpProcess = spawn('node', ['mcp-server/dist/server.js'], {
        stdio: ['pipe', 'inherit', 'inherit']
      });
      
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: '${toolName}',
          arguments: ${JSON.stringify(params)}
        }
      };
      
      mcpProcess.stdin.write(JSON.stringify(request) + '\\n');
      
      let responseData = '';
      mcpProcess.stdout.on('data', (data) => {
        responseData += data.toString();
      });
      
      mcpProcess.on('close', () => {
        try {
          const lines = responseData.split('\\n').filter(line => line.trim());
          const response = lines.find(line => line.includes('"id":1'));
          if (response) {
            const parsed = JSON.parse(response);
            console.log('📊 Response:', JSON.stringify(parsed, null, 2));
          }
        } catch (e) {
          console.error('❌ Parse error:', e.message);
        }
        process.exit(0);
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        mcpProcess.kill();
        process.exit(1);
      }, 10000);
      `
    ], { 
      stdio: 'inherit',
      cwd: '/home/ridgetop/aidis'
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}

async function main() {
  console.log('🔍 Testing context_search vs smart_search debug comparison');
  
  // First test context_search (known working)
  await testTool('context_search', {
    query: 'phase',
    limit: 5
  });
  
  // Then test smart_search with context included
  await testTool('smart_search', {
    query: 'phase', 
    includeTypes: ['context'],
    limit: 5
  });
  
  console.log('\n✅ Debug test complete - check server logs for detailed output');
}

main().catch(console.error);
