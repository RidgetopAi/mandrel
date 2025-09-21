#!/usr/bin/env node

/**
 * Test the new AIDIS Navigation Enhancement tools
 * Tests: aidis_help, aidis_explain, aidis_examples
 */

import { spawn } from 'child_process';

interface MCPRequest {
  jsonrpc: string;
  id: string;
  method: string;
  params: any;
}

interface MCPResponse {
  jsonrpc: string;
  id: string;
  result?: any;
  error?: any;
}

async function sendMCPRequest(request: MCPRequest): Promise<MCPResponse> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', 'src/server.ts'], {
      cwd: '/home/ridgetop/aidis/mcp-server',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdoutData = '';
    let stderrData = '';
    
    child.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    child.on('close', (code) => {
      try {
        // Look for JSON response in stdout
        const lines = stdoutData.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('{')) {
            const response = JSON.parse(line.trim());
            if (response.jsonrpc === '2.0' && response.id === request.id) {
              resolve(response);
              return;
            }
          }
        }
        
        // If no valid response found, create error response
        resolve({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -1,
            message: `No response found. Code: ${code}, Stderr: ${stderrData}`,
            data: { stdout: stdoutData, stderr: stderrData }
          }
        });
      } catch (error) {
        reject(error);
      }
    });

    // Send request
    child.stdin.write(JSON.stringify(request) + '\n');
    child.stdin.end();
    
    // Timeout after 10 seconds
    setTimeout(() => {
      child.kill();
      reject(new Error('Request timeout'));
    }, 10000);
  });
}

async function testNavigationTools() {
  console.log('🧪 Testing AIDIS Navigation Enhancement Tools...\n');

  // Test 1: aidis_help - should show all tools categorized
  console.log('🔧 Testing aidis_help...');
  try {
    const helpRequest: MCPRequest = {
      jsonrpc: '2.0',
      id: 'test-help',
      method: 'tools/call',
      params: {
        name: 'aidis_help',
        arguments: {}
      }
    };

    const helpResponse = await sendMCPRequest(helpRequest);
    if (helpResponse.error) {
      console.log('❌ aidis_help failed:', helpResponse.error.message);
    } else {
      console.log('✅ aidis_help success!');
      console.log('Response preview:', helpResponse.result?.content?.[0]?.text?.substring(0, 200) + '...');
    }
  } catch (error) {
    console.log('❌ aidis_help test error:', error);
  }

  // Test 2: aidis_explain - should explain a specific tool
  console.log('\n🔧 Testing aidis_explain...');
  try {
    const explainRequest: MCPRequest = {
      jsonrpc: '2.0',
      id: 'test-explain',
      method: 'tools/call',
      params: {
        name: 'aidis_explain',
        arguments: {
          toolName: 'context_search'
        }
      }
    };

    const explainResponse = await sendMCPRequest(explainRequest);
    if (explainResponse.error) {
      console.log('❌ aidis_explain failed:', explainResponse.error.message);
    } else {
      console.log('✅ aidis_explain success!');
      console.log('Response preview:', explainResponse.result?.content?.[0]?.text?.substring(0, 200) + '...');
    }
  } catch (error) {
    console.log('❌ aidis_explain test error:', error);
  }

  // Test 3: aidis_examples - should show examples for a tool
  console.log('\n🔧 Testing aidis_examples...');
  try {
    const examplesRequest: MCPRequest = {
      jsonrpc: '2.0',
      id: 'test-examples',
      method: 'tools/call',
      params: {
        name: 'aidis_examples',
        arguments: {
          toolName: 'context_store'
        }
      }
    };

    const examplesResponse = await sendMCPRequest(examplesRequest);
    if (examplesResponse.error) {
      console.log('❌ aidis_examples failed:', examplesResponse.error.message);
    } else {
      console.log('✅ aidis_examples success!');
      console.log('Response preview:', examplesResponse.result?.content?.[0]?.text?.substring(0, 200) + '...');
    }
  } catch (error) {
    console.log('❌ aidis_examples test error:', error);
  }

  console.log('\n🎯 Navigation Enhancement Testing Complete!');
}

// Run the tests
testNavigationTools().catch(console.error);
