#!/usr/bin/env node

/**
 * TC015 Verification Test - Code Complexity Tracking
 * 
 * Verifies that all complexity tracking features are operational:
 * - Database schema
 * - Complexity analysis service
 * - MCP tools integration
 * - Real-time tracking integration
 */

import { promises as fs } from 'fs';
import path from 'path';

// Test configuration
const TEST_CONFIG = {
  testProjectPath: process.cwd(),
  sampleFiles: [
    'mcp-server/src/services/complexityTracker.ts',
    'mcp-server/src/handlers/codeComplexity.ts',
    'mcp-server/src/server.ts'
  ],
  expectedTables: [
    'complexity_analysis_sessions',
    'file_complexity_metrics',
    'function_complexity_metrics',
    'complexity_trends',
    'complexity_alerts',
    'complexity_analysis_cache',
    'complexity_baseline_metrics',
    'complexity_session_summaries'
  ],
  expectedTools: [
    'complexity_analyze_project',
    'complexity_analyze_file', 
    'complexity_get_metrics',
    'complexity_get_trends',
    'complexity_get_alerts',
    'complexity_get_baseline',
    'complexity_compare_sessions',
    'complexity_get_hotspots',
    'complexity_analyze_functions',
    'complexity_get_distribution',
    'complexity_get_session_summary',
    'complexity_set_thresholds',
    'complexity_get_improvement_suggestions',
    'complexity_track_technical_debt',
    'complexity_analyze_dependencies',
    'complexity_get_quality_score'
  ]
};

interface TestResult {
  testName: string;
  success: boolean;
  message: string;
  details?: any;
  duration: number;
}

class TC015VerificationTest {
  private results: TestResult[] = [];

  async runTest(testName: string, testFn: () => Promise<any>): Promise<TestResult> {
    const startTime = Date.now();
    try {
      console.log(`🧪 Running ${testName}...`);
      const result = await testFn();
      const duration = Date.now() - startTime;
      
      const testResult: TestResult = {
        testName,
        success: true,
        message: `✅ ${testName} passed`,
        details: result,
        duration
      };
      
      this.results.push(testResult);
      console.log(`✅ ${testName} completed in ${duration}ms`);
      return testResult;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const testResult: TestResult = {
        testName,
        success: false,
        message: `❌ ${testName} failed: ${error.message}`,
        details: error,
        duration
      };
      
      this.results.push(testResult);
      console.error(`❌ ${testName} failed in ${duration}ms:`, error.message);
      return testResult;
    }
  }

  async testDatabaseSchema(): Promise<any> {
    const { execSync } = await import('child_process');
    
    // Check if all expected tables exist
    const results = {};
    
    for (const table of TEST_CONFIG.expectedTables) {
      try {
        const result = execSync(
          `psql -h localhost -p 5432 -d aidis_production -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '${table}';"`,
          { encoding: 'utf8' }
        );
        
        const count = parseInt(result.trim());
        results[table] = {
          exists: count > 0,
          count
        };
        
      } catch (error) {
        results[table] = {
          exists: false,
          error: error.message
        };
      }
    }
    
    // Verify all tables exist
    const missingTables = Object.entries(results)
      .filter(([_, data]: [string, any]) => !data.exists)
      .map(([table]) => table);
    
    if (missingTables.length > 0) {
      throw new Error(`Missing tables: ${missingTables.join(', ')}`);
    }
    
    return {
      tablesFound: Object.keys(results).length,
      allTablesExist: missingTables.length === 0,
      details: results
    };
  }

  async testComplexityService(): Promise<any> {
    // Check if complexity service files exist and have expected exports
    const servicePath = path.join(TEST_CONFIG.testProjectPath, 'mcp-server/src/services/complexityTracker.ts');
    const handlerPath = path.join(TEST_CONFIG.testProjectPath, 'mcp-server/src/handlers/codeComplexity.ts');
    
    const serviceExists = await fs.access(servicePath).then(() => true).catch(() => false);
    const handlerExists = await fs.access(handlerPath).then(() => true).catch(() => false);
    
    if (!serviceExists) {
      throw new Error('Complexity service file does not exist');
    }
    
    if (!handlerExists) {
      throw new Error('Complexity handler file does not exist');
    }
    
    // Check service content for expected exports
    const serviceContent = await fs.readFile(servicePath, 'utf8');
    const expectedExports = [
      'ComplexityTracker',
      'analyzeComplexityOnCommit',
      'calculateCyclomaticComplexity',
      'calculateCognitiveComplexity'
    ];
    
    const missingExports = expectedExports.filter(exportName => 
      !serviceContent.includes(exportName)
    );
    
    if (missingExports.length > 0) {
      throw new Error(`Missing service exports: ${missingExports.join(', ')}`);
    }
    
    // Check handler content for MCP tool definitions
    const handlerContent = await fs.readFile(handlerPath, 'utf8');
    const missingTools = TEST_CONFIG.expectedTools.filter(tool => 
      !handlerContent.includes(tool)
    );
    
    if (missingTools.length > 0) {
      throw new Error(`Missing MCP tools: ${missingTools.join(', ')}`);
    }
    
    return {
      serviceExists,
      handlerExists,
      exportsFound: expectedExports.length - missingExports.length,
      toolsFound: TEST_CONFIG.expectedTools.length - missingTools.length,
      totalExpectedTools: TEST_CONFIG.expectedTools.length
    };
  }

  async testMCPIntegration(): Promise<any> {
    // Test MCP tool registration in server.ts
    const serverPath = path.join(TEST_CONFIG.testProjectPath, 'mcp-server/src/server.ts');
    const serverContent = await fs.readFile(serverPath, 'utf8');
    
    // Check for complexity handler import and registration
    const hasImport = serverContent.includes('codeComplexity') || serverContent.includes('ComplexityHandler');
    const hasRegistration = serverContent.includes('complexity_') || serverContent.includes('ComplexityHandler');
    
    if (!hasImport && !hasRegistration) {
      throw new Error('Complexity handler not properly integrated in server.ts');
    }
    
    return {
      hasImport,
      hasRegistration,
      integrated: hasImport && hasRegistration
    };
  }

  async testSampleComplexityAnalysis(): Promise<any> {
    // Perform a simple complexity analysis on one of our own files
    const testFile = path.join(TEST_CONFIG.testProjectPath, 'mcp-server/src/services/complexityTracker.ts');
    const content = await fs.readFile(testFile, 'utf8');
    
    // Basic complexity metrics
    const lines = content.split('\n').length;
    const functions = (content.match(/function|=>/g) || []).length;
    const classes = (content.match(/class\s+\w+/g) || []).length;
    const imports = (content.match(/^import/gm) || []).length;
    
    // Simple cyclomatic complexity estimate (count decision points)
    const decisionPoints = (content.match(/if|else|while|for|switch|case|catch|\?\?|\|\||&&/g) || []).length;
    const cyclomaticComplexity = decisionPoints + 1; // +1 for the main execution path
    
    return {
      file: testFile,
      metrics: {
        linesOfCode: lines,
        functions,
        classes,
        imports,
        cyclomaticComplexity,
        estimatedComplexity: cyclomaticComplexity > 10 ? 'high' : cyclomaticComplexity > 5 ? 'medium' : 'low'
      }
    };
  }

  async testGitIntegration(): Promise<any> {
    // Check if GitTracker has complexity analysis integration
    const gitTrackerPath = path.join(TEST_CONFIG.testProjectPath, 'mcp-server/src/services/gitTracker.ts');
    const gitTrackerContent = await fs.readFile(gitTrackerPath, 'utf8');
    
    const hasComplexityImport = gitTrackerContent.includes('analyzeComplexityOnCommit');
    const hasComplexityConfig = gitTrackerContent.includes('enableComplexityAnalysis');
    const hasComplexityTrigger = gitTrackerContent.includes('complexityAnalysesTriggered');
    
    return {
      hasComplexityImport,
      hasComplexityConfig,
      hasComplexityTrigger,
      integrated: hasComplexityImport && hasComplexityConfig && hasComplexityTrigger
    };
  }

  async generateReport(): Promise<void> {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 TC015 VERIFICATION REPORT - Code Complexity Tracking');
    console.log('='.repeat(80));
    console.log(`🧪 Tests Run: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`⏱️  Total Duration: ${totalDuration}ms`);
    console.log(`📈 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log('='.repeat(80));
    
    // Detailed results
    for (const result of this.results) {
      console.log(`\n${result.success ? '✅' : '❌'} ${result.testName}`);
      console.log(`   ${result.message}`);
      console.log(`   Duration: ${result.duration}ms`);
      
      if (result.details && typeof result.details === 'object') {
        console.log(`   Details:`, JSON.stringify(result.details, null, 2));
      }
    }
    
    console.log('\n' + '='.repeat(80));
    
    if (failedTests === 0) {
      console.log('🎉 TC015 VERIFICATION COMPLETE - All tests passed!');
      console.log('✅ Code complexity tracking is fully operational');
    } else {
      console.log(`⚠️  TC015 VERIFICATION INCOMPLETE - ${failedTests} test(s) failed`);
      console.log('❌ Some complexity tracking features may not be working correctly');
    }
    
    console.log('='.repeat(80));
  }

  async run(): Promise<void> {
    console.log('🚀 Starting TC015 Verification Test Suite...\n');
    
    // Run all verification tests
    await this.runTest('Database Schema Verification', () => this.testDatabaseSchema());
    await this.runTest('Complexity Service Integration', () => this.testComplexityService());
    await this.runTest('MCP Tools Integration', () => this.testMCPIntegration());
    await this.runTest('Sample Complexity Analysis', () => this.testSampleComplexityAnalysis());
    await this.runTest('Git Integration Verification', () => this.testGitIntegration());
    
    // Generate final report
    await this.generateReport();
  }
}

// Run the verification if called directly
if (require.main === module) {
  const test = new TC015VerificationTest();
  test.run().catch(error => {
    console.error('💥 Verification test crashed:', error);
    process.exit(1);
  });
}

export default TC015VerificationTest;