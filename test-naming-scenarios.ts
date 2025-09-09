#!/usr/bin/env npx tsx

import { namingHandler } from './mcp-server/src/handlers/naming.js';

async function testMultipleScenarios() {
  console.log('🔧 Testing multiple naming scenarios...');
  
  const testCases = [
    {
      entityType: 'function',
      description: 'authenticate user login',
      expectedPattern: /^[a-z][A-Za-z]*$/  // camelCase
    },
    {
      entityType: 'class',
      description: 'user authentication service',
      expectedPattern: /^[A-Z][A-Za-z]*$/  // PascalCase
    },
    {
      entityType: 'variable',
      description: 'current user data',
      expectedPattern: /^[a-z][A-Za-z]*$/  // camelCase
    },
    {
      entityType: 'function',
      description: 'validate email address',
      expectedPattern: /^[a-z][A-Za-z]*$/  // camelCase
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n📝 Testing: ${testCase.entityType} - "${testCase.description}"`);
    
    try {
      const suggestions = await namingHandler.suggestNames({
        entityType: testCase.entityType,
        description: testCase.description
      });
      
      console.log(`📤 Suggestions: ${suggestions}`);
      
      // Check if suggestions follow expected pattern
      const validSuggestions = suggestions.filter(s => testCase.expectedPattern.test(s));
      console.log(`✅ Valid pattern count: ${validSuggestions.length}/${suggestions.length}`);
      
      // Check for quality indicators
      const hasProperCamelCase = suggestions.some(s => /[A-Z]/.test(s.slice(1)));
      const noLowerCaseWords = !suggestions.some(s => /\s/.test(s));
      const noGenericPrefixes = !suggestions.some(s => s.startsWith('generate') || s.startsWith('create'));
      
      console.log(`🎯 Quality checks:`);
      console.log(`   - Proper camelCase: ${hasProperCamelCase ? '✅' : '❌'}`);
      console.log(`   - No spaces: ${noLowerCaseWords ? '✅' : '❌'}`);
      console.log(`   - No generic prefixes: ${noGenericPrefixes ? '✅' : '❌'}`);
      
    } catch (error) {
      console.error(`❌ Error: ${error}`);
    }
  }
}

testMultipleScenarios();
