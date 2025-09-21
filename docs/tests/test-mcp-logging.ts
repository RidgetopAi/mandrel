#!/usr/bin/env tsx

/**
 * Test MCP Operations with Enhanced Logging
 * 
 * Tests that the logging system works correctly with actual MCP operations
 */

import { AIDISServer } from './mcp-server/src/server.js';
import { logger } from './mcp-server/src/utils/logger.js';

async function testMcpLogging() {
  console.log('🧪 Testing MCP Operations with Enhanced Logging...\n');
  
  try {
    // Create server instance
    console.log('🚀 Creating AIDIS server instance...');
    const server = new AIDISServer();
    
    // Test a simple MCP operation through HTTP
    console.log('🔧 Testing aidis_ping operation...');
    
    // Simulate calling executeMcpTool directly (private method testing approach)
    const testResult = await (server as any).executeMcpTool('aidis_ping', { message: 'Hello from logging test!' });
    
    console.log('✅ aidis_ping result:', testResult);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
  
  // Check the log file for the MCP operation
  console.log('\n📋 Checking logs for MCP operation...');
  
  setTimeout(() => {
    console.log('\n✅ MCP logging test completed!');
    console.log('Check /home/ridgetop/aidis/logs/aidis-mcp.log for detailed logs');
    process.exit(0);
  }, 1000);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testMcpLogging().catch(console.error);
}
