#!/usr/bin/env npx tsx

/**
 * Quick smoke test for the MCP Fuzz Tester
 */

import { McpFuzzTester } from './mcp-server/src/tests/fuzz/mcpFuzzTester.js';

async function runSmokeTest() {
  console.log('🚀 Testing MCP Fuzz Tester implementation...');

  try {
    const passed = await McpFuzzTester.runSmokeTest();

    if (passed) {
      console.log('✅ Fuzz Tester smoke test PASSED');
      console.log('🔥 Fuzz testing infrastructure is operational');
      process.exit(0);
    } else {
      console.log('❌ Fuzz Tester smoke test FAILED');
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Fuzz Tester smoke test CRASHED:', error.message);
    process.exit(1);
  }
}

runSmokeTest();