#!/usr/bin/env npx tsx

/**
 * Comprehensive test for aidis_explain tool
 */

import { navigationHandler } from './mcp-server/src/handlers/navigation.js';

async function testComprehensive() {
  console.log('🎯 Comprehensive test for aidis_explain\n');

  const testTools = [
    'aidis_ping',
    'aidis_status', 
    'context_store',
    'context_search',
    'context_get_recent',
    'context_stats',
    'project_list',
    'project_create',
    'project_current',
    'invalid_tool_name'
  ];

  for (const toolName of testTools) {
    console.log(`\n📝 Testing: ${toolName}`);
    console.log('='.repeat(50));
    
    try {
      const result = await navigationHandler.explainTool({ toolName });
      const text = result.content[0].text;
      
      // Show first few lines
      const lines = text.split('\n').slice(0, 10);
      console.log(lines.join('\n'));
      
      if (lines.length < text.split('\n').length) {
        console.log('... (output truncated)');
      }
    } catch (error) {
      console.log('❌ Error:', error);
    }
  }

  console.log('\n🎯 Comprehensive testing complete!');
}

testComprehensive().catch(console.error);
