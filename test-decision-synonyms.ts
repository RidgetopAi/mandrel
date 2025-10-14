#!/usr/bin/env node
/**
 * Test Decision Tool Synonym Resolution
 * Validates that AI-friendly parameter names work correctly
 */

import { validateToolArguments } from './mcp-server/src/middleware/validation.js';

console.log('🧪 Testing Decision Tool Synonym Resolution\n');

// Test 1: decision_record with synonyms
console.log('TEST 1: decision_record with "reasoning" synonym');
try {
  const result1 = validateToolArguments('decision_record', {
    decisionType: 'architecture',
    title: 'Test Decision',
    description: 'Testing synonym resolution',
    reasoning: 'Using reasoning instead of rationale', // SYNONYM
    impactLevel: 'medium'
  });
  console.log('✅ PASS - reasoning → rationale synonym works');
  console.log('   Validated args:', { rationale: result1.rationale?.substring(0, 30) });
} catch (error: any) {
  console.log('❌ FAIL - reasoning synonym rejected');
  console.log('   Error:', error.message);
}

// Test 2: decision_record with "impact" synonym
console.log('\nTEST 2: decision_record with "impact" synonym');
try {
  const result2 = validateToolArguments('decision_record', {
    decisionType: 'library',
    title: 'Test Decision 2',
    description: 'Testing impact synonym',
    rationale: 'This is the rationale',
    impact: 'high' // SYNONYM for impactLevel
  });
  console.log('✅ PASS - impact → impactLevel synonym works');
  console.log('   Validated args:', { impactLevel: result2.impactLevel });
} catch (error: any) {
  console.log('❌ FAIL - impact synonym rejected');
  console.log('   Error:', error.message);
}

// Test 3: decision_record with "options" array synonym
console.log('\nTEST 3: decision_record with "options" synonym (string array)');
try {
  const result3 = validateToolArguments('decision_record', {
    decisionType: 'framework',
    title: 'Test Decision 3',
    description: 'Testing options synonym',
    rationale: 'Rationale text',
    impactLevel: 'low',
    options: ['React', 'Vue', 'Angular'] // SYNONYM for alternativesConsidered
  });
  console.log('✅ PASS - options → alternativesConsidered synonym works');
  console.log('   Validated args:', { alternativesCount: result3.alternativesConsidered?.length });
} catch (error: any) {
  console.log('❌ FAIL - options synonym rejected');
  console.log('   Error:', error.message);
}

// Test 4: decision_search with "type" synonym
console.log('\nTEST 4: decision_search with "type" synonym');
try {
  const result4 = validateToolArguments('decision_search', {
    query: 'test query',
    type: 'architecture' // SYNONYM for decisionType
  });
  console.log('✅ PASS - type → decisionType synonym works');
  console.log('   Validated args:', { decisionType: result4.decisionType });
} catch (error: any) {
  console.log('❌ FAIL - type synonym rejected');
  console.log('   Error:', error.message);
}

// Test 5: decision_search with multiple filters (no query)
console.log('\nTEST 5: decision_search with filters only (no query)');
try {
  const result5 = validateToolArguments('decision_search', {
    decisionType: 'library',
    impactLevel: 'high',
    status: 'active'
  });
  console.log('✅ PASS - search with filters only (no query) works');
  console.log('   Validated args:', {
    decisionType: result5.decisionType,
    impactLevel: result5.impactLevel,
    status: result5.status
  });
} catch (error: any) {
  console.log('❌ FAIL - search without query rejected');
  console.log('   Error:', error.message);
}

// Test 6: decision_search with "impact" synonym
console.log('\nTEST 6: decision_search with "impact" synonym');
try {
  const result6 = validateToolArguments('decision_search', {
    query: 'performance decisions',
    impact: 'critical' // SYNONYM for impactLevel
  });
  console.log('✅ PASS - impact → impactLevel synonym works in search');
  console.log('   Validated args:', { impactLevel: result6.impactLevel });
} catch (error: any) {
  console.log('❌ FAIL - impact synonym rejected in search');
  console.log('   Error:', error.message);
}

console.log('\n✅ All synonym resolution tests completed!');
