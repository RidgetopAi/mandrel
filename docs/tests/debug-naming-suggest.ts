#!/usr/bin/env npx tsx

import { namingHandler } from './mcp-server/src/handlers/naming.js';

async function testNamingSuggest() {
  console.log('🔧 Testing naming_suggest implementation...');
  
  try {
    // Test the problematic case from the user
    const testInput = {
      entityType: 'function',
      description: 'authenticate user login'
    };
    
    console.log('\n📝 Input:', testInput);
    
    const suggestions = await namingHandler.suggestNames(testInput);
    
    console.log('\n📤 Current Output:', suggestions);
    
    // Let's also debug the extractKeywords method
    console.log('\n🔍 Debugging extractKeywords for:', testInput.description);
    const keywords = (namingHandler as any).extractKeywords(testInput.description);
    console.log('📋 Keywords extracted:', keywords);
    
    // Test the applyNamingPattern method
    console.log('\n🎨 Testing applyNamingPattern:');
    keywords.forEach(keyword => {
      const camelCase = (namingHandler as any).applyNamingPattern(keyword, 'camelCase');
      console.log(`  "${keyword}" -> camelCase: "${camelCase}"`);
    });
    
    // Expected good suggestions for comparison
    console.log('\n✅ Expected Quality Suggestions:');
    console.log('  - authenticateUser');
    console.log('  - validateLogin');
    console.log('  - verifyUserCredentials');
    console.log('  - loginUser');
    console.log('  - authenticateUserLogin');
    
  } catch (error) {
    console.error('❌ Error testing naming suggest:', error);
  }
}

testNamingSuggest();
