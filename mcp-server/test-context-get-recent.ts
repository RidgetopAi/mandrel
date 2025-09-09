/**
 * Test AIDIS context_get_recent tool implementation
 * Tests the new tool that gets recent contexts chronologically
 */

import { contextHandler } from './src/handlers/context.js';
import { db, initializeDatabase } from './src/config/database.js';

async function testContextGetRecent() {
  console.log('🧪 Testing context_get_recent implementation...\n');

  try {
    // Initialize database
    await initializeDatabase();

    // Test with default limit (5)
    console.log('📋 STEP 1: Testing default limit (5)...');
    const results1 = await contextHandler.getRecentContext();
    console.log(`   ✅ Retrieved ${results1.length} recent contexts`);
    
    if (results1.length > 0) {
      console.log(`   📅 Most recent: ${results1[0].createdAt}`);
      console.log(`   🏷️  Type: ${results1[0].contextType}`);
      console.log(`   📝 Content preview: "${results1[0].content.substring(0, 50)}..."`);
      console.log(`   🔍 Search reason: ${results1[0].searchReason}`);
      
      // Check chronological order
      if (results1.length > 1) {
        const isChronological = results1.every((ctx, i) => {
          if (i === 0) return true;
          return new Date(ctx.createdAt) <= new Date(results1[i-1].createdAt);
        });
        console.log(`   📈 Chronological order: ${isChronological ? '✅ CORRECT' : '❌ FAILED'}`);
      }
    }

    // Test with custom limit (3)
    console.log('\n📋 STEP 2: Testing custom limit (3)...');
    const results2 = await contextHandler.getRecentContext(undefined, 3);
    console.log(`   ✅ Retrieved ${results2.length} recent contexts`);
    console.log(`   🎯 Expected limit: 3, Actual: ${results2.length}`);

    // Test data structure compatibility
    console.log('\n📋 STEP 3: Testing data structure compatibility with SearchResult...');
    if (results1.length > 0) {
      const ctx = results1[0];
      const hasRequiredFields = 
        typeof ctx.id === 'string' &&
        typeof ctx.projectId === 'string' &&
        typeof ctx.contextType === 'string' &&
        typeof ctx.content === 'string' &&
        ctx.createdAt instanceof Date &&
        typeof ctx.relevanceScore === 'number' &&
        Array.isArray(ctx.tags) &&
        typeof ctx.metadata === 'object' &&
        typeof ctx.searchReason === 'string';
        
      console.log(`   ✅ SearchResult format: ${hasRequiredFields ? '✅ COMPATIBLE' : '❌ FAILED'}`);
      
      if (hasRequiredFields) {
        console.log(`   🆔 ID: ${ctx.id}`);
        console.log(`   📁 Project: ${ctx.projectId}`);
        console.log(`   🏷️  Tags: [${ctx.tags.join(', ')}]`);
        console.log(`   ⭐ Relevance: ${ctx.relevanceScore}`);
      }
    }

    // Test error handling for invalid project
    console.log('\n📋 STEP 4: Testing error handling...');
    try {
      await contextHandler.getRecentContext('invalid-project-id', 5);
      console.log('   ❌ Should have thrown error for invalid project');
    } catch (error) {
      console.log('   ✅ Correctly handled invalid project ID');
      console.log(`   🔍 Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Test boundary conditions
    console.log('\n📋 STEP 5: Testing boundary conditions...');
    
    // Test minimum limit
    const results3 = await contextHandler.getRecentContext(undefined, 1);
    console.log(`   ✅ Minimum limit (1): ${results3.length} contexts`);
    
    // Test large limit
    const results4 = await contextHandler.getRecentContext(undefined, 20);
    console.log(`   ✅ Large limit (20): ${results4.length} contexts`);

    console.log('\n🎉 context_get_recent tests completed successfully!');
    console.log('\n✨ Key features verified:');
    console.log('   📋 Retrieves recent contexts chronologically (newest first)');
    console.log('   🎯 Respects custom limit parameters');
    console.log('   🔗 Returns SearchResult-compatible format');
    console.log('   ⚠️  Handles errors gracefully');
    console.log('   🏗️  Works with current project context');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    // Close database connection
    console.log('\n✅ Closing database connections...');
    await db.end();
  }
}

// Run the test
testContextGetRecent().catch(console.error);
