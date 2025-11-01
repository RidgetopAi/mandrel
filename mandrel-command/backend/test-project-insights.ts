/**
 * Test script to verify project_insights MCP tool response structure
 * Run with: npx tsx test-project-insights.ts
 */

import { McpService } from './src/services/mcp';

async function testProjectInsights() {
  console.log('🔍 Testing project_insights MCP tool...\n');

  try {
    // Test with ai-chat-assistant project
    const projectId = 'e2b7b046-4ce2-4599-9d52-33eddc50814e';
    
    console.log(`📊 Calling project_insights for project: ${projectId}\n`);
    
    const result = await McpService.callTool('project_insights', { 
      projectId 
    });

    console.log('✅ MCP Tool Response Structure:\n');
    console.log(JSON.stringify(result, null, 2));

    console.log('\n📝 Response Analysis:');
    console.log('─'.repeat(60));
    
    if (result && typeof result === 'object') {
      console.log('✅ Response is an object');
      console.log(`✅ Top-level keys: ${Object.keys(result).join(', ')}`);
      
      if (result.insights) {
        console.log(`✅ insights object exists with keys: ${Object.keys(result.insights).join(', ')}`);
      } else {
        console.log('❌ insights object missing');
      }
      
      if (result.codeStats) {
        console.log(`✅ codeStats object exists`);
      }
      
      if (result.contextStats) {
        console.log(`✅ contextStats object exists`);
      }
      
      if (result.decisionStats) {
        console.log(`✅ decisionStats object exists`);
      }
    } else {
      console.log('❌ Response is not an object');
    }

  } catch (error) {
    console.error('❌ Error calling MCP tool:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
  }
}

testProjectInsights();
