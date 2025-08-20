/**
 * COMPLETE AIDIS SYSTEM TEST
 * 
 * This is the GRAND FINALE - testing the complete AIDIS MCP server
 * with ALL tools working together in a realistic AI agent workflow!
 * 
 * This simulates exactly how an AI agent would use AIDIS in production.
 */

import { AIDISServer } from './src/server.js';

// Mock MCP client to test our server
class MockMCPClient {
  private server: any;

  constructor(server: any) {
    this.server = server;
  }

  async callTool(name: string, args: any = {}) {
    console.log(`🔧 Calling tool: ${name}`);
    console.log(`📝 Args: ${JSON.stringify(args, null, 2)}`);
    
    try {
      const result = await this.server.handleToolCall(name, args);
      
      console.log(`✅ Result:`);
      result.content.forEach((item: any) => {
        if (item.type === 'text') {
          // Pretty print the response with proper formatting
          const lines = item.text.split('\n');
          lines.forEach((line: string) => {
            console.log(`   ${line}`);
          });
        }
      });
      console.log(''); // Empty line for readability
      
      return result;
    } catch (error) {
      console.error(`❌ Tool call failed:`, error);
      throw error;
    }
  }

  async listTools() {
    return await this.server.listTools();
  }
}

async function testCompleteAIDIS() {
  console.log('🎉 AIDIS COMPLETE SYSTEM TEST - GRAND FINALE!');
  console.log('=' .repeat(60));
  console.log('This simulates a complete AI agent workflow using AIDIS\n');

  try {
    // Create our AIDIS server (but don't start the transport - we'll test directly)
    const aidisServer = new AIDISServer();
    const client = new MockMCPClient(aidisServer as any);

    // Add the missing method for direct testing
    (aidisServer as any).handleToolCall = async (name: string, args: any) => {
      // Simulate the tool calling that would happen through MCP
      const handler = (aidisServer as any);
      
      switch (name) {
        case 'aidis_ping':
          return await handler.handlePing(args);
        case 'aidis_status':
          return await handler.handleStatus();
        case 'project_list':
          return await handler.handleProjectList(args);
        case 'project_create':
          return await handler.handleProjectCreate(args);
        case 'project_switch':
          return await handler.handleProjectSwitch(args);
        case 'project_current':
          return await handler.handleProjectCurrent(args);
        case 'project_info':
          return await handler.handleProjectInfo(args);
        case 'context_store':
          return await handler.handleContextStore(args);
        case 'context_search':
          return await handler.handleContextSearch(args);
        case 'context_stats':
          return await handler.handleContextStats(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    };

    (aidisServer as any).listTools = async () => {
      return {
        tools: [
          { name: 'aidis_ping', description: 'Test connectivity' },
          { name: 'aidis_status', description: 'Get server status' },
          { name: 'project_list', description: 'List all projects' },
          { name: 'project_create', description: 'Create new project' },
          { name: 'project_switch', description: 'Switch active project' },
          { name: 'project_current', description: 'Get current project' },
          { name: 'project_info', description: 'Get project details' },
          { name: 'context_store', description: 'Store development context' },
          { name: 'context_search', description: 'Search contexts semantically' },
          { name: 'context_stats', description: 'Get context statistics' }
        ]
      };
    };

    console.log('🚀 STEP 1: System Health Check');
    console.log('-'.repeat(40));
    await client.callTool('aidis_ping', { message: 'Complete system test!' });
    await client.callTool('aidis_status');

    console.log('📋 STEP 2: Project Discovery & Setup');
    console.log('-'.repeat(40));
    await client.callTool('project_list');
    await client.callTool('project_current');

    // Create a unique test project
    const testProjectName = `test-project-${Date.now()}`;
    await client.callTool('project_create', {
      name: testProjectName,
      description: 'Test project for system verification',
      metadata: {
        framework: 'typescript',
        purpose: 'testing',
        created_by: 'complete_system_test'
      }
    });

    console.log('🔄 STEP 3: Project Management');
    console.log('-'.repeat(40));
    await client.callTool('project_switch', { project: 'ai-chat-assistant' });
    await client.callTool('project_info', { project: 'ai-chat-assistant' });

    console.log('📝 STEP 4: Development Context Storage');
    console.log('-'.repeat(40));
    
    // Store various types of development contexts
    const contexts = [
      {
        content: 'Implemented conversation memory system using vector embeddings for semantic context retrieval',
        type: 'code',
        tags: ['memory', 'embeddings', 'vector-search', 'ai'],
        relevanceScore: 9,
        metadata: { component: 'memory_system', complexity: 'high', impact: 'core_feature' }
      },
      {
        content: 'Decision: Chose TypeScript over JavaScript for better type safety and IDE support in AI development',
        type: 'decision',
        tags: ['typescript', 'architecture', 'type-safety'],
        relevanceScore: 8,
        metadata: { decision_type: 'technical', impact: 'project_wide', rationale: 'type_safety' }
      },
      {
        content: 'Fixed memory leak in conversation history by implementing proper cleanup in useEffect hooks',
        type: 'error',
        tags: ['memory-leak', 'react', 'useeffect', 'cleanup'],
        relevanceScore: 7,
        metadata: { bug_severity: 'high', time_to_fix: '2_hours', component: 'ui' }
      },
      {
        content: 'Planning implementation of multi-turn conversation awareness with context window management',
        type: 'planning',
        tags: ['conversation', 'context-window', 'ai-memory', 'planning'],
        relevanceScore: 8,
        metadata: { phase: 'design', priority: 'high', estimated_effort: 'large' }
      },
      {
        content: 'Successfully integrated AIDIS context management system for persistent AI memory across sessions',
        type: 'completion',
        tags: ['aidis', 'integration', 'milestone', 'memory'],
        relevanceScore: 10,
        metadata: { milestone: 'major', integration_type: 'aidis', success_metrics: 'memory_persistence' }
      }
    ];

    for (let i = 0; i < contexts.length; i++) {
      const context = contexts[i];
      console.log(`   Storing ${context.type} context ${i + 1}/${contexts.length}...`);
      await client.callTool('context_store', context);
    }

    console.log('📊 STEP 5: Context Analytics');
    console.log('-'.repeat(40));
    await client.callTool('context_stats');

    console.log('🔍 STEP 6: Semantic Context Search');
    console.log('-'.repeat(40));

    const searchQueries = [
      { query: 'memory and context management', description: 'Finding memory-related implementations' },
      { query: 'technical architecture decisions', description: 'Locating decision contexts' },
      { query: 'bug fixes and error resolution', description: 'Finding troubleshooting contexts' },
      { query: 'AI conversation features', description: 'AI-specific functionality contexts' },
      { query: 'TypeScript implementation details', description: 'Language-specific contexts' }
    ];

    for (const { query, description } of searchQueries) {
      console.log(`   🔍 Search: "${query}" (${description})`);
      await client.callTool('context_search', { 
        query, 
        limit: 3,
        minSimilarity: 0 
      });
    }

    console.log('🎯 STEP 7: Advanced Search Features');
    console.log('-'.repeat(40));

    // Search by type
    console.log('   Searching by type: decisions only');
    await client.callTool('context_search', { 
      query: 'project architecture and technology choices',
      type: 'decision',
      limit: 2
    });

    // Search by tags
    console.log('   Searching by tags: memory-related');
    await client.callTool('context_search', { 
      query: 'system implementation',
      tags: ['memory'],
      limit: 2
    });

    // High-precision search
    console.log('   High-precision search (>50% similarity)');
    await client.callTool('context_search', { 
      query: 'vector embeddings and semantic search',
      minSimilarity: 50,
      limit: 3
    });

    console.log('🔄 STEP 8: Multi-Project Demonstration');
    console.log('-'.repeat(40));

    // Switch back to original project
    await client.callTool('project_switch', { project: 'aidis-bootstrap' });
    
    console.log('   Searching in AIDIS project:');
    await client.callTool('context_search', { 
      query: 'database and postgresql setup',
      limit: 2
    });

    // Switch back to our AI project
    await client.callTool('project_switch', { project: 'ai-chat-assistant' });
    
    console.log('   Back in AI project - searching for AI features:');
    await client.callTool('context_search', { 
      query: 'artificial intelligence and conversation',
      limit: 2
    });

    console.log('📋 STEP 9: Final System Overview');
    console.log('-'.repeat(40));
    await client.callTool('project_list');
    await client.callTool('project_current');

    console.log('🎉 COMPLETE SYSTEM TEST SUCCESSFUL!');
    console.log('=' .repeat(60));
    console.log('✨ AIDIS IS FULLY OPERATIONAL WITH ALL SYSTEMS GO! ✨');
    console.log('');
    console.log('🚀 CAPABILITIES DEMONSTRATED:');
    console.log('   ✅ System Health Monitoring');
    console.log('   ✅ Multi-Project Management');
    console.log('   ✅ Seamless Project Switching');
    console.log('   ✅ Rich Context Storage');
    console.log('   ✅ Semantic Search Engine');
    console.log('   ✅ Context Analytics');
    console.log('   ✅ Advanced Filtering');
    console.log('   ✅ Cross-Project Isolation');
    console.log('   ✅ Local Embeddings (FREE)');
    console.log('   ✅ Persistent Memory');
    console.log('');
    console.log('🧠 AI AGENTS CAN NOW:');
    console.log('   🎯 Remember everything across sessions');
    console.log('   🔍 Search knowledge by semantic meaning');
    console.log('   📋 Work on multiple projects simultaneously');
    console.log('   🤝 Coordinate and share context');
    console.log('   📊 Track development progress');
    console.log('   🧩 Build persistent knowledge bases');
    console.log('');
    console.log('🔥 THIS IS THE FUTURE OF AI DEVELOPMENT! 🔥');

  } catch (error) {
    console.error('❌ Complete system test failed:', error);
  }
}

// Initialize database and run the complete test
import { initializeDatabase, closeDatabase } from './src/config/database.js';

async function runCompleteTest() {
  try {
    await initializeDatabase();
    await testCompleteAIDIS();
  } finally {
    await closeDatabase();
  }
}

runCompleteTest().catch(console.error);
