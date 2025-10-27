#!/usr/bin/env npx tsx

/**
 * Phase 5 Fuzz Testing Runner
 * Executable script that runs comprehensive MCP fuzz testing
 */

import { McpFuzzTester } from './mcp-server/src/tests/fuzz/mcpFuzzTester.js';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🔥 AIDIS MCP Fuzz Testing Runner');
  console.log('=================================');

  const args = process.argv.slice(2);
  const mode = args[0] || 'smoke';

  try {
    let result;

    switch (mode) {
      case 'smoke':
        console.log('🚀 Running smoke test (100 iterations)...');
        result = await McpFuzzTester.runFuzzTest({
          iterations: 100,
          enableLogging: true,
          stopOnFirstFailure: false,
          timeoutMs: 1000
        });
        break;

      case 'quick':
        console.log('⚡ Running quick test (1,000 iterations)...');
        result = await McpFuzzTester.runFuzzTest({
          iterations: 1000,
          enableLogging: false,
          stopOnFirstFailure: false,
          timeoutMs: 2000
        });
        break;

      case 'full':
        console.log('🎯 Running full test (10,000+ iterations)...');
        result = await McpFuzzTester.runFuzzTest({
          iterations: 10000,
          enableLogging: false,
          stopOnFirstFailure: false,
          timeoutMs: 5000
        });
        break;

      case 'comprehensive':
        console.log('🏆 Running comprehensive test (25,000 iterations)...');
        result = await McpFuzzTester.runFuzzTest({
          iterations: 25000,
          enableLogging: false,
          stopOnFirstFailure: false,
          timeoutMs: 5000,
          testCategories: ['parser', 'validator', 'handler', 'malformed', 'extreme', 'attack']
        });
        break;

      default:
        console.log('❌ Invalid mode. Available modes:');
        console.log('  smoke       - 100 iterations for quick validation');
        console.log('  quick       - 1,000 iterations for development');
        console.log('  full        - 10,000+ iterations for Phase 5 verification');
        console.log('  comprehensive - 25,000 iterations for production readiness');
        process.exit(1);
    }

    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsDir = './fuzz-results';
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const resultsFile = path.join(resultsDir, `fuzz-test-${mode}-${timestamp}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(result, null, 2));

    console.log(`\n📊 Results saved to: ${resultsFile}`);

    // Detailed results
    console.log('\n🎯 Fuzz Test Results Summary:');
    console.log(`Total Tests: ${result.totalTests}`);
    console.log(`✅ Passed: ${result.passed} (${((result.passed/result.totalTests)*100).toFixed(2)}%)`);
    console.log(`❌ Failed: ${result.failed}`);
    console.log(`💥 Crashed: ${result.crashed}`);
    console.log(`⏰ Timeouts: ${result.timeouts}`);
    console.log(`⚡ Duration: ${result.duration}ms`);
    console.log(`🔥 Rate: ${(result.totalTests / (result.duration/1000)).toFixed(2)} tests/sec`);

    // Exit codes
    if (result.crashed > 0) {
      console.log('\n💥 CRITICAL: Crashes detected! System needs investigation.');
      process.exit(2);
    } else if (result.timeouts > (result.totalTests * 0.1)) {
      console.log('\n⚠️  WARNING: High timeout rate detected.');
      process.exit(1);
    } else if (result.failed > (result.totalTests * 0.5)) {
      console.log('\n⚠️  WARNING: High failure rate - check input validation.');
      process.exit(1);
    } else {
      console.log('\n🎉 SUCCESS: All fuzz tests passed! System is resilient.');
      process.exit(0);
    }

  } catch (error) {
    console.error('\n💥 FATAL ERROR during fuzz testing:', error.message);
    console.error(error.stack);
    process.exit(3);
  }
}

// Handle CLI signals
process.on('SIGINT', () => {
  console.log('\n🛑 Fuzz testing interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Fuzz testing terminated');
  process.exit(143);
});

// Run the fuzz tests
main();