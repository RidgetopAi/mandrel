#!/usr/bin/env npx tsx

/**
 * Direct test for the aidis_explain functionality
 */

import { navigationHandler } from './mcp-server/src/handlers/navigation.js';

async function testExplainTool() {
  console.log('🔧 Testing NavigationHandler.explainTool() directly...\n');

  // Test 1: Valid tool
  console.log('📝 Test 1: Valid tool (context_search)');
  try {
    const result1 = await navigationHandler.explainTool({ toolName: 'context_search' });
    console.log('✅ Success:', result1.content[0].text.substring(0, 200) + '...\n');
  } catch (error) {
    console.log('❌ Error:', error);
  }

  // Test 2: Invalid tool
  console.log('📝 Test 2: Invalid tool (invalid_tool)');
  try {
    const result2 = await navigationHandler.explainTool({ toolName: 'invalid_tool' });
    console.log('✅ Success:', result2.content[0].text + '\n');
  } catch (error) {
    console.log('❌ Error:', error);
  }

  // Test 3: Another valid tool
  console.log('📝 Test 3: Valid tool (aidis_ping)');
  try {
    const result3 = await navigationHandler.explainTool({ toolName: 'aidis_ping' });
    console.log('✅ Success:', result3.content[0].text.substring(0, 200) + '...\n');
  } catch (error) {
    console.log('❌ Error:', error);
  }

  // Test 4: Test case sensitivity
  console.log('📝 Test 4: Case sensitivity (CONTEXT_SEARCH)');
  try {
    const result4 = await navigationHandler.explainTool({ toolName: 'CONTEXT_SEARCH' });
    console.log('✅ Success:', result4.content[0].text.substring(0, 200) + '...\n');
  } catch (error) {
    console.log('❌ Error:', error);
  }

  console.log('🎯 Direct testing complete!');
}

testExplainTool().catch(console.error);
