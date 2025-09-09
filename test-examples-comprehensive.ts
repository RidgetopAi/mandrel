#!/usr/bin/env npx tsx

/**
 * Comprehensive Test Suite for AIDIS Examples Tool
 * 
 * Tests all scenarios and edge cases for the newly implemented aidis_examples tool
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function comprehensiveExamplesTest() {
  console.log('🧪 Comprehensive AIDIS Examples Tool Test Suite\n');

  const transport = new StdioClientTransport({
    command: '/home/ridgetop/.nvm/versions/node/v22.18.0/bin/node',
    args: ['mcp-server/node_modules/.bin/tsx', 'mcp-server/src/server.ts'],
    cwd: '/home/ridgetop/aidis',
    env: {
      ...process.env,
      AIDIS_MODE: 'stdio'
    }
  });

  const client = new Client({
    name: 'aidis-examples-comprehensive-test',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  const results = {
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    errors: []
  };

  const runTest = async (testName: string, testFn: () => Promise<boolean>) => {
    results.totalTests++;
    try {
      console.log(`\n📋 ${testName}...`);
      const success = await testFn();
      if (success) {
        results.passedTests++;
        console.log(`✅ ${testName} PASSED`);
      } else {
        results.failedTests++;
        console.log(`❌ ${testName} FAILED`);
      }
      return success;
    } catch (error) {
      results.failedTests++;
      results.errors.push(`${testName}: ${error.message}`);
      console.log(`❌ ${testName} ERROR: ${error.message}`);
      return false;
    }
  };

  try {
    await client.connect(transport);
    console.log('✅ Connected to AIDIS server\n');

    // Test 1: Verify tool is registered
    await runTest('Tool Registration Check', async () => {
      const tools = await client.listTools();
      const examplesTool = tools.tools.find(t => t.name === 'aidis_examples');
      return !!examplesTool && examplesTool.description.includes('usage examples');
    });

    // Test 2: Valid tool with examples (context_search)
    await runTest('Valid Tool With Examples (context_search)', async () => {
      const result = await client.callTool({
        name: 'aidis_examples',
        arguments: { toolName: 'context_search' }
      });
      const text = result.content[0].text;
      return text.includes('Examples for context_search') && 
             text.includes('```javascript') &&
             text.includes('Related Commands');
    });

    // Test 3: Valid tool with examples (project_create)
    await runTest('Valid Tool With Examples (project_create)', async () => {
      const result = await client.callTool({
        name: 'aidis_examples',
        arguments: { toolName: 'project_create' }
      });
      const text = result.content[0].text;
      return text.includes('Examples for project_create') && 
             text.includes('my-web-app') &&
             text.includes('React/Node.js');
    });

    // Test 4: Valid tool with examples (aidis_ping)
    await runTest('Valid Tool With Examples (aidis_ping)', async () => {
      const result = await client.callTool({
        name: 'aidis_examples',
        arguments: { toolName: 'aidis_ping' }
      });
      const text = result.content[0].text;
      return text.includes('Examples for aidis_ping') && 
             text.includes('Test basic connectivity');
    });

    // Test 5: Valid tool but no examples available
    await runTest('Valid Tool No Examples (code_stats)', async () => {
      const result = await client.callTool({
        name: 'aidis_examples',
        arguments: { toolName: 'code_stats' }
      });
      const text = result.content[0].text;
      return text.includes('No examples available yet for "code_stats"') &&
             text.includes('aidis_explain code_stats');
    });

    // Test 6: Invalid tool name
    await runTest('Invalid Tool Name Handling', async () => {
      const result = await client.callTool({
        name: 'aidis_examples',
        arguments: { toolName: 'nonexistent_tool' }
      });
      const text = result.content[0].text;
      return text.includes('Tool "nonexistent_tool" not found') &&
             text.includes('Available tools:') &&
             text.includes('aidis_help');
    });

    // Test 7: Case sensitivity (should work with lowercase)
    await runTest('Case Sensitivity (lowercase input)', async () => {
      const result = await client.callTool({
        name: 'aidis_examples',
        arguments: { toolName: 'CONTEXT_SEARCH' }
      });
      const text = result.content[0].text;
      // Should convert to lowercase and find examples
      return text.includes('Examples for context_search') || text.includes('No examples available');
    });

    // Test 8: Missing toolName parameter (should fail validation)
    await runTest('Missing Parameter Validation', async () => {
      try {
        await client.callTool({
          name: 'aidis_examples',
          arguments: {}
        });
        return false; // Should not reach here
      } catch (error) {
        return error.message.includes('required') || error.message.includes('toolName');
      }
    });

    // Test 9: Empty toolName parameter (should fail validation)
    await runTest('Empty Parameter Validation', async () => {
      try {
        await client.callTool({
          name: 'aidis_examples',
          arguments: { toolName: '' }
        });
        return false; // Should not reach here
      } catch (error) {
        return error.message.includes('String must contain at least 1 character');
      }
    });

    // Test 10: Multiple examples content quality
    await runTest('Multi-Example Content Quality', async () => {
      const result = await client.callTool({
        name: 'aidis_examples',
        arguments: { toolName: 'context_store' }
      });
      const text = result.content[0].text;
      const exampleCount = (text.match(/### \d\./g) || []).length;
      return exampleCount >= 2 && 
             text.includes('Store a code solution') &&
             text.includes('Record a technical decision');
    });

    // Test 11: Navigation integration (related commands)
    await runTest('Navigation Integration Check', async () => {
      const result = await client.callTool({
        name: 'aidis_examples',
        arguments: { toolName: 'naming_check' }
      });
      const text = result.content[0].text;
      return text.includes('aidis_explain naming_check') &&
             text.includes('aidis_help');
    });

    // Test 12: Complex tool with all features
    await runTest('Complex Tool Examples (agent_register)', async () => {
      const result = await client.callTool({
        name: 'aidis_examples',
        arguments: { toolName: 'agent_register' }
      });
      const text = result.content[0].text;
      return text.includes('Examples for agent_register') &&
             text.includes('CodeAgent') &&
             text.includes('capabilities');
    });

    console.log('\n' + '='.repeat(60));
    console.log('🎯 COMPREHENSIVE TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`📊 Total Tests: ${results.totalTests}`);
    console.log(`✅ Passed: ${results.passedTests}`);
    console.log(`❌ Failed: ${results.failedTests}`);
    console.log(`📈 Success Rate: ${Math.round((results.passedTests / results.totalTests) * 100)}%`);

    if (results.errors.length > 0) {
      console.log('\n❌ Error Details:');
      results.errors.forEach(error => console.log(`   • ${error}`));
    }

    const allPassed = results.failedTests === 0;
    console.log(`\n🎉 ${allPassed ? 'ALL TESTS PASSED!' : 'Some tests failed'}`);
    console.log(`💡 aidis_examples tool is ${allPassed ? 'fully operational' : 'needs attention'}`);

    return allPassed;

  } catch (error) {
    console.error('❌ Test suite failed:', error);
    return false;
  } finally {
    await client.close();
  }
}

comprehensiveExamplesTest().then(success => {
  process.exit(success ? 0 : 1);
});
