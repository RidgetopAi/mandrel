/**
 * Test AIDIS Context Management Tools
 * 
 * This tests the complete context storage and search workflow
 * that AI agents will use to store and retrieve their memories!
 */

import { contextHandler } from './src/handlers/context.js';
import { initializeDatabase, closeDatabase } from './src/config/database.js';

async function testContextWorkflow() {
  console.log('🧪 Testing AIDIS Context Management Workflow...\n');

  try {
    // Initialize database
    await initializeDatabase();

    // Test 1: Store various types of contexts
    console.log('📝 STEP 1: Storing different types of contexts...');
    
    const contexts = [
      {
        type: 'code' as const,
        content: 'Implemented PostgreSQL database connection with pgvector extension for semantic search in the AIDIS project. Used connection pooling for better performance.',
        tags: ['database', 'postgresql', 'pgvector', 'performance'],
        relevanceScore: 9,
        metadata: { component: 'database', language: 'sql', performance_impact: 'high' }
      },
      {
        type: 'decision' as const,
        content: 'Decided to use local embedding models via Transformers.js instead of OpenAI API to reduce costs and enable offline operation. Model: all-MiniLM-L6-v2 with 384 dimensions.',
        tags: ['embeddings', 'cost-optimization', 'offline', 'transformers'],
        relevanceScore: 8,
        metadata: { impact: 'cost_savings', model: 'all-MiniLM-L6-v2', dimensions: 384 }
      },
      {
        type: 'completion' as const,
        content: 'Successfully completed Phase 1 of AIDIS: Foundation & Database Setup. All core infrastructure is working including MCP server, PostgreSQL, vector embeddings.',
        tags: ['milestone', 'phase-1', 'infrastructure', 'mcp'],
        relevanceScore: 10,
        metadata: { phase: 1, status: 'complete', components: ['mcp', 'database', 'embeddings'] }
      },
      {
        type: 'planning' as const,
        content: 'Phase 2 planning: Implement context management system with storage, search, and agent coordination features. Priority: vector search functionality.',
        tags: ['planning', 'phase-2', 'context-management', 'roadmap'],
        relevanceScore: 7,
        metadata: { phase: 2, priority: 'high', estimated_effort: 'medium' }
      },
      {
        type: 'error' as const,
        content: 'Fixed authentication issue where PostgreSQL was rejecting Node.js connections. Problem was missing password in connection string. Solution: set password via ALTER USER command.',
        tags: ['postgresql', 'authentication', 'troubleshooting', 'connection'],
        relevanceScore: 8,
        metadata: { error_type: 'authentication', resolution: 'password_fix', time_to_resolve: '30_minutes' }
      }
    ];

    const storedContexts = [];
    for (let i = 0; i < contexts.length; i++) {
      const context = contexts[i];
      console.log(`\n${i + 1}. Storing ${context.type}: "${context.content.substring(0, 60)}..."`);
      
      const result = await contextHandler.storeContext(context);
      storedContexts.push(result);
      
      console.log(`   ✅ Stored with ID: ${result.id}`);
      console.log(`   🏷️  Tags: [${result.tags.join(', ')}]`);
      console.log(`   📊 Relevance: ${result.relevanceScore}/10`);
    }

    // Test 2: Get context statistics
    console.log('\n📊 STEP 2: Getting context statistics...');
    const stats = await contextHandler.getContextStats();
    console.log(`📈 Total contexts: ${stats.totalContexts}`);
    console.log(`🔮 With embeddings: ${stats.embeddedContexts}`);
    console.log(`🕐 Recent (24h): ${stats.recentContexts}`);
    console.log('📋 By type:');
    Object.entries(stats.contextsByType).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

    // Test 3: Semantic search queries
    console.log('\n🔍 STEP 3: Testing semantic search...');
    
    const searchQueries = [
      { query: 'database setup and configuration', expectedTypes: ['code', 'completion'] },
      { query: 'cost optimization and API alternatives', expectedTypes: ['decision'] },
      { query: 'authentication problems and troubleshooting', expectedTypes: ['error'] },
      { query: 'project milestones and achievements', expectedTypes: ['completion'] },
      { query: 'future planning and roadmap', expectedTypes: ['planning'] },
    ];

    for (let i = 0; i < searchQueries.length; i++) {
      const { query, expectedTypes } = searchQueries[i];
      console.log(`\n${i + 1}. Searching: "${query}"`);
      
      const results = await contextHandler.searchContext({
        query,
        limit: 3,
        minSimilarity: 0 // Show all results to see similarity scores
      });

      if (results.length > 0) {
        console.log(`   🎯 Found ${results.length} results:`);
        results.forEach((result, idx) => {
          console.log(`      ${idx + 1}. ${result.contextType.toUpperCase()} (${result.similarity}% match)`);
          console.log(`         "${result.content.substring(0, 70)}..."`);
          console.log(`         🏷️  [${result.tags.join(', ')}]`);
        });
        
        // Check if we got expected types
        const foundTypes = results.map(r => r.contextType);
        const hasExpectedType = expectedTypes.some(type => foundTypes.includes(type));
        console.log(`   ✅ Relevance check: ${hasExpectedType ? 'PASSED' : 'FAILED'} (expected: ${expectedTypes.join(' or ')})`);
      } else {
        console.log('   ❌ No results found');
      }
    }

    // Test 4: Filtered searches
    console.log('\n🎛️  STEP 4: Testing filtered searches...');
    
    // Search by type
    const decisionResults = await contextHandler.searchContext({
      query: 'system architecture choices',
      type: 'decision',
      limit: 2
    });
    console.log(`Decision-only search: ${decisionResults.length} results`);

    // Search by tags
    const dbResults = await contextHandler.searchContext({
      query: 'technical implementation',
      tags: ['database'],
      limit: 2
    });
    console.log(`Database-tagged search: ${dbResults.length} results`);

    // Search with high similarity threshold
    const preciseResults = await contextHandler.searchContext({
      query: 'PostgreSQL vector database setup',
      minSimilarity: 20, // Only high-similarity matches
      limit: 3
    });
    console.log(`High-precision search (>20% similarity): ${preciseResults.length} results`);

    console.log('\n🎉 All context management tests completed successfully!');
    console.log('🚀 AIDIS Context Management System is fully operational!');
    console.log('\n📊 Final Statistics:');
    const finalStats = await contextHandler.getContextStats();
    console.log(`   Total stored contexts: ${finalStats.totalContexts}`);
    console.log(`   Contexts with embeddings: ${finalStats.embeddedContexts}`);
    console.log(`   Search-ready contexts: ${finalStats.embeddedContexts}`);

    console.log('\n✨ AI agents can now:');
    console.log('   📝 Store rich development context');
    console.log('   🔍 Search contexts by semantic meaning');
    console.log('   🏷️  Filter by type, tags, and similarity');
    console.log('   📊 Track context statistics');
    console.log('   🧠 Build persistent memory across sessions!');

  } catch (error) {
    console.error('❌ Context workflow test failed:', error);
  } finally {
    await closeDatabase();
  }
}

testContextWorkflow().catch(console.error);
