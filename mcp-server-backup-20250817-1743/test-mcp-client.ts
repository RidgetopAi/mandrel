/**
 * AIDIS MCP Client Test
 * 
 * This simulates how an AI agent would connect to our AIDIS server
 * and use its tools for context management.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function testAIDISConnection() {
  console.log('🧪 Testing AIDIS MCP Server connection...\n');

  try {
    // Spawn our MCP server process
    const serverProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'inherit'], // stdin/stdout for MCP, stderr for logs
    });

    // Create MCP client transport
    const transport = new StdioClientTransport({
      stdin: serverProcess.stdout!, // Server's stdout -> Client's stdin
      stdout: serverProcess.stdin!,  // Client's stdout -> Server's stdin
    });

    // Create MCP client
    const client = new Client(
      {
        name: 'aidis-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    // Connect to server
    console.log('🔌 Connecting to AIDIS server...');
    await client.connect(transport);
    console.log('✅ Connected successfully!\n');

    // Test 1: List available tools
    console.log('📋 Listing available tools...');
    const tools = await client.listTools();
    console.log('Available tools:');
    tools.tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
    console.log();

    // Test 2: Ping the server
    console.log('🏓 Testing ping tool...');
    const pingResult = await client.callTool({
      name: 'aidis_ping',
      arguments: { message: 'Hello from test client!' }
    });
    console.log('Ping response:');
    pingResult.content.forEach(item => {
      if (item.type === 'text') {
        console.log(`  ${item.text}`);
      }
    });
    console.log();

    // Test 3: Get server status
    console.log('📊 Getting server status...');
    const statusResult = await client.callTool({
      name: 'aidis_status',
      arguments: {}
    });
    console.log('Status response:');
    statusResult.content.forEach(item => {
      if (item.type === 'text') {
        console.log(`  ${item.text.split('\n').join('\n  ')}`);
      }
    });
    console.log();

    // Test 4: List and read resources
    console.log('📚 Listing available resources...');
    const resources = await client.listResources();
    console.log('Available resources:');
    resources.resources.forEach(resource => {
      console.log(`  - ${resource.name} (${resource.uri}): ${resource.description}`);
    });

    if (resources.resources.length > 0) {
      const firstResource = resources.resources[0];
      console.log(`\n📖 Reading resource: ${firstResource.uri}`);
      const resourceData = await client.readResource({ uri: firstResource.uri });
      console.log('Resource content:');
      resourceData.contents.forEach(content => {
        if ('text' in content) {
          const jsonData = JSON.parse(content.text);
          console.log(`  ${JSON.stringify(jsonData, null, 4).split('\n').join('\n  ')}`);
        }
      });
    }

    console.log('\n🎉 All tests completed successfully!');
    console.log('🚀 AIDIS MCP Server is fully operational!');

    // Cleanup
    await client.close();
    serverProcess.kill();
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testAIDISConnection().catch(console.error);
