import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testProxyConnection() {
  const client = new Client({
    name: 'proxy-test',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  try {
    console.log('🔗 Testing MCP Proxy Connection...');
    
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', 'src/server.ts'],
      env: process.env
    });

    await client.connect(transport);
    console.log('✅ Connected to AIDIS MCP Proxy!');
    
    // Test aidis_ping
    console.log('\n🏓 Testing aidis_ping...');
    const pingResult = await client.request({
      method: 'tools/call',
      params: {
        name: 'aidis_ping',
        arguments: { message: 'Proxy test!' }
      }
    });
    console.log('Ping Result:', pingResult.content[0].text);
    
    // Test aidis_status
    console.log('\n📊 Testing aidis_status...');
    const statusResult = await client.request({
      method: 'tools/call',
      params: {
        name: 'aidis_status',
        arguments: {}
      }
    });
    console.log('Status Result:', statusResult.content[0].text);
    
    console.log('\n🎉 MCP Proxy is working perfectly!');
    
    await client.close();
  } catch (error) {
    console.error('❌ Proxy test failed:', error);
    process.exit(1);
  }
}

testProxyConnection();
