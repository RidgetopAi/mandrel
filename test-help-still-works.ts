#!/usr/bin/env npx tsx

/**
 * Test that aidis_help still works after adding aidis_explain
 */

import { navigationHandler } from './mcp-server/src/handlers/navigation.js';

async function testHelpStillWorks() {
  console.log('🔧 Testing that aidis_help still works...\n');

  try {
    const result = await navigationHandler.getHelp();
    const text = result.content[0].text;
    
    // Show first 20 lines
    const lines = text.split('\n').slice(0, 20);
    console.log(lines.join('\n'));
    
    console.log('\n... (output truncated)\n');
    
    // Check if the quick start section mentions aidis_explain
    if (text.includes('aidis_explain')) {
      console.log('✅ aidis_help correctly mentions aidis_explain in quick start!');
    } else {
      console.log('⚠️  aidis_help does not mention aidis_explain in quick start');
    }
    
    // Check total tools count
    const toolCountMatch = text.match(/\*\*(\d+) Tools Available/);
    if (toolCountMatch) {
      console.log(`✅ Total tools listed: ${toolCountMatch[1]}`);
    }
    
  } catch (error) {
    console.log('❌ Error:', error);
  }

  console.log('\n🎯 Help test complete!');
}

testHelpStillWorks().catch(console.error);
