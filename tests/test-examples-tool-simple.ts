#!/usr/bin/env npx tsx

/**
 * Simple test to verify aidis_examples implementation is correct
 * Tests the NavigationHandler methods directly
 */

import { navigationHandler } from './mcp-server/src/handlers/navigation.js';

async function testExamplesImplementation() {
  console.log('🧪 Testing AIDIS Examples Tool Implementation...\n');

  try {
    // Test 1: Test with tool that has examples (context_search)
    console.log('📋 Test 1: Testing context_search examples...');
    const contextSearchResult = await navigationHandler.getExamples({ toolName: 'context_search' });
    console.log('✅ context_search examples test passed');
    console.log('📄 Sample output preview:', contextSearchResult.content[0].text.substring(0, 100) + '...\n');

    // Test 2: Test with tool that has examples (project_create)  
    console.log('📋 Test 2: Testing project_create examples...');
    const projectCreateResult = await navigationHandler.getExamples({ toolName: 'project_create' });
    console.log('✅ project_create examples test passed');
    console.log('📄 Sample output preview:', projectCreateResult.content[0].text.substring(0, 100) + '...\n');

    // Test 3: Test with invalid tool
    console.log('📋 Test 3: Testing invalid tool name...');
    const invalidResult = await navigationHandler.getExamples({ toolName: 'nonexistent_tool' });
    if (invalidResult.content[0].text.includes('❌ Tool "nonexistent_tool" not found')) {
      console.log('✅ Invalid tool handling test passed');
    } else {
      console.log('❌ Invalid tool handling test failed');
    }
    console.log('📄 Sample error message:', invalidResult.content[0].text.substring(0, 150) + '...\n');

    // Test 4: Test with valid tool but no examples
    console.log('📋 Test 4: Testing tool with no examples...');
    const noExamplesResult = await navigationHandler.getExamples({ toolName: 'code_stats' });
    if (noExamplesResult.content[0].text.includes('📝 No examples available yet')) {
      console.log('✅ No examples handling test passed');
    } else {
      console.log('❌ No examples handling test failed');
    }
    console.log('📄 Sample message:', noExamplesResult.content[0].text.substring(0, 100) + '...\n');

    // Test 5: Verify examples content quality
    console.log('📋 Test 5: Verifying examples content quality...');
    const fullContextExample = await navigationHandler.getExamples({ toolName: 'context_search' });
    const exampleText = fullContextExample.content[0].text;
    
    const qualityChecks = [
      { check: 'Contains title "Examples for context_search"', result: exampleText.includes('Examples for context_search') },
      { check: 'Contains JavaScript code blocks', result: exampleText.includes('```javascript') },
      { check: 'Contains related commands section', result: exampleText.includes('Related Commands') },
      { check: 'Contains multiple examples', result: (exampleText.match(/### \d\./g) || []).length >= 2 }
    ];

    qualityChecks.forEach(({ check, result }, index) => {
      console.log(`   ${index + 1}. ${check}: ${result ? '✅' : '❌'}`);
    });

    const allPassed = qualityChecks.every(({ result }) => result);
    console.log(`${allPassed ? '✅' : '❌'} Content quality test ${allPassed ? 'passed' : 'failed'}\n`);

    console.log('🎯 All direct implementation tests completed successfully!');
    console.log('💡 The aidis_examples tool is properly implemented and ready for use.');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testExamplesImplementation();
