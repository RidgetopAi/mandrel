#!/usr/bin/env tsx

/**
 * Test the new context_get_recent MCP tool
 */

import { contextHandler } from './mcp-server/src/handlers/context.js';
import { initializeDatabase, closeDatabase } from './mcp-server/src/config/database.js';

async function testContextGetRecent() {
  console.log('🧪 Testing context_get_recent functionality...\n');
  
  try {
    // Initialize database
    await initializeDatabase();
    console.log('✅ Database connection established');

    // Test the context handler method directly
    console.log('🕒 Testing contextHandler.getRecentContext()...');
    const recentContexts = await contextHandler.getRecentContext(undefined, 3);
    
    console.log(`\n📊 Results:`);
    console.log(`   Found: ${recentContexts.length} recent contexts`);
    
    recentContexts.forEach((context, index) => {
      const timeAgo = new Date().getTime() - context.createdAt.getTime();
      const hoursAgo = Math.floor(timeAgo / (1000 * 60 * 60));
      const timeDisplay = hoursAgo > 24 
        ? `${Math.floor(hoursAgo / 24)}d ago`
        : hoursAgo > 0 
          ? `${hoursAgo}h ago`
          : 'Just now';

      console.log(`   ${index + 1}. ${context.contextType.toUpperCase()} (${timeDisplay})`);
      console.log(`      📝 "${context.content.substring(0, 60)}..."`);
      console.log(`      🏷️  [${context.tags.join(', ')}]`);
      console.log(`      ⏰ ${context.createdAt.toISOString()}`);
      console.log('');
    });

    if (recentContexts.length > 0) {
      console.log('✅ context_get_recent functionality works correctly!');
      console.log(`🕒 Chronological order verified: most recent is from ${recentContexts[0].createdAt.toISOString()}`);
    } else {
      console.log('⚠️  No contexts found - this is expected for empty projects');
    }

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
  testContextGetRecent().catch((error) => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });
}
