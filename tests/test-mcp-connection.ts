#!/usr/bin/env npx tsx

/**
 * Test MCP Connection to AIDIS via STDIO
 * This mimics how Amp connects to AIDIS 
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testMCPConnection() {
  console.log('🧪 Testing MCP connection to AIDIS via STDIO...\n');

  // Stop the running HTTP server first to avoid conflicts
  console.log('🛑 Stopping HTTP server to test STDIO mode...');
  
  const transport = new StdioClientTransport({
    command: '/home/ridgetop/.nvm/versions/node/v22.18.0/bin/node',
    args: ['mcp-server/node_modules/.bin/tsx', 'mcp-server/src/server.ts'],
    cwd: '/home/ridgetop/aidis',
    env: {
      ...process.env,
      AIDIS_MODE: 'stdio', // Force STDIO mode
      PORT: undefined // Disable HTTP server
    }
  });

  const client = new Client({
    name: 'aidis-connection-test',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  try {
    console.log('🔌 Connecting to AIDIS via STDIO...');
    await client.connect(transport);
    console.log('✅ Connected successfully!\n');

    // Test 1: List all tools
    console.log('📋 Test 1: Listing all available tools...');
    const tools = await client.listTools();
    console.log(`✅ Found ${tools.tools.length} tools`);
    
    // Check if aidis_examples is in the list
    const examplesTool = tools.tools.find(t => t.name === 'aidis_examples');
    console.log(`${examplesTool ? '✅' : '❌'} aidis_examples tool ${examplesTool ? 'found' : 'not found'}`);
    
    if (examplesTool) {
      console.log(`   Description: ${examplesTool.description}`);
    }
    
    // List first 10 tools to verify
    console.log('\n📋 First 10 tools:');
    tools.tools.slice(0, 10).forEach(tool => {
      console.log(`   • ${tool.name} - ${tool.description}`);
    });

    // Test 2: Try calling aidis_help
    console.log('\n📋 Test 2: Calling aidis_help...');
    try {
      const helpResult = await client.callTool({
        name: 'aidis_help',
        arguments: {}
      });
      console.log('✅ aidis_help call successful');
    } catch (error) {
      console.log('❌ aidis_help call failed:', error.message);
    }

    // Test 3: Try calling aidis_examples
    console.log('\n📋 Test 3: Calling aidis_examples...');
    try {
      const examplesResult = await client.callTool({
        name: 'aidis_examples',
        arguments: { toolName: 'context_search' }
      });
      console.log('✅ aidis_examples call successful');
      console.log('📄 Sample output:', examplesResult.content[0].text.substring(0, 200) + '...');
    } catch (error) {
      console.log('❌ aidis_examples call failed:', error.message);
    }

    console.log('\n🎯 MCP connection test completed!');

  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  } finally {
    await client.close();
  }
}

testMCPConnection();
