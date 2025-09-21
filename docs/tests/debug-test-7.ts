#!/usr/bin/env npx tsx

import { navigationHandler } from './mcp-server/src/handlers/navigation.js';

async function debugTest7() {
  console.log('🔧 Debug Test 7: aidis_status handling\n');
  
  const result = await navigationHandler.explainTool({ toolName: 'aidis_status' });
  const text = result.content[0].text;
  
  console.log('Full output:');
  console.log('='.repeat(60));
  console.log(text);
  console.log('='.repeat(60));
  
  console.log('\nChecks:');
  console.log('- Contains aidis_status:', text.includes('aidis_status'));
  console.log('- Contains "Parameters: None":', text.includes('Parameters: None'));
  console.log('- Contains "**Parameters:** None":', text.includes('**Parameters:** None'));
}

debugTest7().catch(console.error);
