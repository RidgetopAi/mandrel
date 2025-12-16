/**
 * Test the context_get_recent tool via MCP protocol
 * This verifies the tool is properly registered and accessible
 */

const { spawn } = require('child_process');
const { JSONRPCClient } = require('json-rpc-2.0');

async function testMCPTool() {
  console.log('🔧 Testing context_get_recent via MCP protocol...\n');

  // Spawn the MCP server
  const serverProcess = spawn('npx', ['tsx', 'src/server.ts'], {
    cwd: '/home/ridgetop/aidis/mcp-server',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let client;
  
  try {
    // Create JSON-RPC client
    client = new JSONRPCClient(async (request) => {
      serverProcess.stdin.write(JSON.stringify(request) + '\n');
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Request timeout'));
        }, 10000);

        const onData = (data) => {
          try {
            const response = JSON.parse(data.toString().trim());
            clearTimeout(timeout);
            serverProcess.stdout.removeListener('data', onData);
            resolve(response);
          } catch (e) {
            // Ignore parse errors, might be partial data
          }
        };

        serverProcess.stdout.on('data', onData);
      });
    });

    // Wait a bit for server startup
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('📋 STEP 1: Testing tool availability...');

    // Test if tools are listed
    try {
      const toolsResponse = await client.request('tools/list', {});
      console.log('✅ Tools list retrieved successfully');
      
      const hasContextGetRecent = toolsResponse.tools?.some(tool => 
        tool.name === 'context_get_recent'
      );
      
      console.log(`🔍 context_get_recent tool found: ${hasContextGetRecent ? '✅ YES' : '❌ NO'}`);
      
      if (hasContextGetRecent) {
        const tool = toolsResponse.tools.find(t => t.name === 'context_get_recent');
        console.log(`📄 Description: ${tool.description}`);
        console.log(`🎛️  Input schema: ${JSON.stringify(tool.inputSchema, null, 2)}`);
      }
    } catch (error) {
      console.log(`❌ Failed to list tools: ${error.message}`);
    }

    console.log('\n📋 STEP 2: Testing tool execution...');

    // Test tool execution
    try {
      const result = await client.request('tools/call', {
        name: 'context_get_recent',
        arguments: {
          limit: 3
        }
      });
      
      console.log('✅ Tool executed successfully');
      console.log(`📊 Response type: ${result.content?.[0]?.type}`);
      console.log(`📝 Response preview: ${result.content?.[0]?.text?.substring(0, 100)}...`);
      
    } catch (error) {
      console.log(`❌ Tool execution failed: ${error.message}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('\n🔄 Cleaning up...');
    serverProcess.kill('SIGTERM');
    
    // Wait for process to terminate
    await new Promise(resolve => {
      serverProcess.on('exit', resolve);
      setTimeout(() => {
        serverProcess.kill('SIGKILL');
        resolve();
      }, 5000);
    });
    
    console.log('✅ Test complete');
  }
}

testMCPTool().catch(console.error);
