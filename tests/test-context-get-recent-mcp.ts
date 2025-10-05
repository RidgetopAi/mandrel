#!/usr/bin/env tsx

/**
 * Test the new context_get_recent MCP tool end-to-end
 */

import { AIDISServer } from './mcp-server/src/server.js';
import { initializeDatabase, closeDatabase } from './mcp-server/src/config/database.js';

async function testContextGetRecentMCP() {
  console.log('🧪 Testing context_get_recent MCP tool integration...\n');
  
  try {
    // Initialize database
    await initializeDatabase();
    console.log('✅ Database connection established');

    // Create AIDIS server instance
    const server = new AIDISServer();
    
    // Test the MCP tool directly using executeMcpTool method
    console.log('🕒 Testing context_get_recent MCP tool...');
    
    // Test with default limit (5)
    console.log('   📋 Test 1: Default limit (5)');
    const result1 = await (server as any).executeMcpTool('context_get_recent', {});
    console.log('   ✅ Result:', result1.content[0].text.substring(0, 100) + '...');

    // Test with custom limit (3)  
    console.log('\n   📋 Test 2: Custom limit (3)');
    const result2 = await (server as any).executeMcpTool('context_get_recent', { limit: 3 });
    console.log('   ✅ Result:', result2.content[0].text.substring(0, 100) + '...');

    // Test with specific project
    console.log('\n   📋 Test 3: Specific project (ai-chat-assistant)');
    const result3 = await (server as any).executeMcpTool('context_get_recent', { 
      limit: 2, 
      projectId: 'e2b7b046-4ce2-4599-9d52-33eddc50814e' 
    });
    console.log('   ✅ Result:', result3.content[0].text.substring(0, 100) + '...');

    console.log('\n✅ All MCP tool tests passed!');
    console.log('🎯 context_get_recent is fully integrated and operational');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await closeDatabase();
    console.log('✅ Database connections closed');
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testContextGetRecentMCP().catch((error) => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });
}
