#!/usr/bin/env npx tsx

/**
 * Test AIDIS Examples Tool Implementation
 * 
 * This tests the new aidis_examples tool directly via MCP
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testExamplesTool() {
  console.log('🧪 Testing AIDIS Examples Tool...\n');

  const transport = new StdioClientTransport({
    command: '/home/ridgetop/.nvm/versions/node/v22.18.0/bin/node',
    args: ['mcp-server/node_modules/.bin/tsx', 'mcp-server/src/server.ts'],
    cwd: '/home/ridgetop/aidis',
    env: {
      PATH: '/home/ridgetop/.nvm/versions/node/v22.18.0/bin:/usr/local/bin:/usr/bin:/bin'
    }
  });

  const client = new Client({
    name: 'aidis-examples-test',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  try {
    await client.connect(transport);
    console.log('✅ Connected to AIDIS server\n');

    // Test 1: Check if aidis_examples tool is available
    console.log('📋 Test 1: List available tools...');
    const tools = await client.listTools();
    const examplesTool = tools.tools.find(t => t.name === 'aidis_examples');
    
    if (examplesTool) {
      console.log('✅ aidis_examples tool found:', examplesTool.name);
      console.log('   Description:', examplesTool.description);
    } else {
      console.log('❌ aidis_examples tool not found');
      console.log('Available tools:', tools.tools.map(t => t.name).join(', '));
      return;
    }

    // Test 2: Get examples for context_search (should have examples)
    console.log('\n📋 Test 2: Get examples for context_search...');
    try {
      const result = await client.callTool({
        name: 'aidis_examples',
        arguments: { toolName: 'context_search' }
      });
      console.log('✅ context_search examples retrieved successfully');
      console.log(result.content[0].text);
    } catch (error) {
      console.log('❌ Failed to get context_search examples:', error);
    }

    // Test 3: Get examples for project_create (should have examples)
    console.log('\n📋 Test 3: Get examples for project_create...');
    try {
      const result = await client.callTool({
        name: 'aidis_examples',
        arguments: { toolName: 'project_create' }
      });
      console.log('✅ project_create examples retrieved successfully');
      console.log(result.content[0].text);
    } catch (error) {
      console.log('❌ Failed to get project_create examples:', error);
    }

    // Test 4: Test with invalid tool name
    console.log('\n📋 Test 4: Test with invalid tool name...');
    try {
      const result = await client.callTool({
        name: 'aidis_examples',
        arguments: { toolName: 'nonexistent_tool' }
      });
      console.log('✅ Invalid tool handled gracefully');
      console.log(result.content[0].text);
    } catch (error) {
      console.log('❌ Failed to handle invalid tool:', error);
    }

    // Test 5: Test with tool that has no examples
    console.log('\n📋 Test 5: Test tool with no examples...');
    try {
      const result = await client.callTool({
        name: 'aidis_examples',
        arguments: { toolName: 'code_stats' }
      });
      console.log('✅ No examples case handled gracefully');
      console.log(result.content[0].text);
    } catch (error) {
      console.log('❌ Failed to handle no examples:', error);
    }

    console.log('\n🎯 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Connection failed:', error);
  } finally {
    await client.close();
  }
}

testExamplesTool();
