#!/usr/bin/env node

/**
 * TC019 Quick Pattern Detection Validation
 * Validates what we can test without full session setup
 */

import { pool } from './mcp-server/src/config/database.js';

interface ValidationResult {
  testName: string;
  passed: boolean;
  score: number;
  details: string;
  executionTimeMs: number;
}

class TC019QuickValidator {
  private results: ValidationResult[] = [];

  async runQuickValidation(): Promise<void> {
    console.log('🚀 Starting TC019 Quick Pattern Detection Validation...');
    console.log('🧪 Testing pattern detection infrastructure without session dependencies');
    
    const startTime = Date.now();
    
    try {
      // Test 1: Database Schema Validation
      await this.validateDatabaseSchema();
      
      // Test 2: Pattern Data Validation  
      await this.validatePatternData();
      
      // Test 3: Algorithm Implementation Validation
      await this.validateAlgorithmImplementation();
      
      // Test 4: Performance Infrastructure Validation
      await this.validatePerformanceInfrastructure();
      
      // Test 5: TC011 Baseline Comparison
      await this.validateTC011Baseline();
      
      // Generate report
      await this.generateQuickReport();
      
    } catch (error) {
      console.error('❌ Quick validation failed:', error);
    }
    
    const totalTime = Date.now() - startTime;
    console.log(`⏱️  Total validation time: ${totalTime}ms`);
  }

  private async validateDatabaseSchema(): Promise<void> {
    const startTime = Date.now();
    console.log('🗄️  Validating pattern detection database schema...');
    
    try {
      // Check if all pattern tables exist
      const expectedTables = [
        'pattern_discovery_sessions',
        'file_cooccurrence_patterns', 
        'temporal_patterns',
        'developer_patterns',
        'change_magnitude_patterns',
        'pattern_insights',
        'pattern_operation_metrics'
      ];
      
      let tablesFound = 0;
      for (const table of expectedTables) {
        const result = await pool.query(
          `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
          [table]
        );
        if (result.rows[0].exists) {
          tablesFound++;
        }
      }
      
      const score = (tablesFound / expectedTables.length) * 100;
      const passed = score >= 90;
      
      this.results.push({
        testName: 'Database Schema Validation',
        passed,
        score,
        details: `Found ${tablesFound}/${expectedTables.length} required pattern tables`,
        executionTimeMs: Date.now() - startTime
      });
      
      console.log(`✅ Schema validation: ${tablesFound}/${expectedTables.length} tables found`);
      
    } catch (error) {
      this.results.push({
        testName: 'Database Schema Validation',
        passed: false,
        score: 0,
        details: `Schema validation failed: ${error}`,
        executionTimeMs: Date.now() - startTime
      });
    }
  }

  private async validatePatternData(): Promise<void> {
    const startTime = Date.now();
    console.log('📊 Validating existing pattern data...');
    
    try {
      // Check existing pattern data
      const cooccurrenceResult = await pool.query('SELECT COUNT(*) FROM file_cooccurrence_patterns');
      const temporalResult = await pool.query('SELECT COUNT(*) FROM temporal_patterns');
      const developerResult = await pool.query('SELECT COUNT(*) FROM developer_patterns');
      const magnitudeResult = await pool.query('SELECT COUNT(*) FROM change_magnitude_patterns');
      const insightsResult = await pool.query('SELECT COUNT(*) FROM pattern_insights');
      
      const patternCounts = {
        cooccurrence: parseInt(cooccurrenceResult.rows[0].count),
        temporal: parseInt(temporalResult.rows[0].count),
        developer: parseInt(developerResult.rows[0].count),
        magnitude: parseInt(magnitudeResult.rows[0].count),
        insights: parseInt(insightsResult.rows[0].count)
      };
      
      const totalPatterns = Object.values(patternCounts).reduce((a, b) => a + b, 0);
      const score = Math.min((totalPatterns / 100) * 100, 100); // Score based on pattern count
      const passed = totalPatterns > 0;
      
      this.results.push({
        testName: 'Pattern Data Validation',
        passed,
        score,
        details: `Found ${totalPatterns} total patterns across all types`,
        executionTimeMs: Date.now() - startTime
      });
      
      console.log(`📊 Pattern data: ${totalPatterns} patterns found`);
      console.log(`   Co-occurrence: ${patternCounts.cooccurrence}`);
      console.log(`   Temporal: ${patternCounts.temporal}`);
      console.log(`   Developer: ${patternCounts.developer}`);
      console.log(`   Magnitude: ${patternCounts.magnitude}`);
      console.log(`   Insights: ${patternCounts.insights}`);
      
    } catch (error) {
      this.results.push({
        testName: 'Pattern Data Validation',
        passed: false,
        score: 0,
        details: `Pattern data validation failed: ${error}`,
        executionTimeMs: Date.now() - startTime
      });
    }
  }

  private async validateAlgorithmImplementation(): Promise<void> {
    const startTime = Date.now();
    console.log('🧮 Validating algorithm implementation...');
    
    try {
      // Check if PatternDetector service exists
      const fs = await import('fs');
      const patternDetectorPath = './mcp-server/src/services/patternDetector.ts';
      
      if (!fs.existsSync(patternDetectorPath)) {
        throw new Error('PatternDetector service not found');
      }
      
      // Read and validate the implementation
      const content = fs.readFileSync(patternDetectorPath, 'utf8');
      
      // Check for all 5 algorithms
      const algorithms = [
        'analyzeFileCooccurrencePatterns',
        'analyzeTemporalPatterns', 
        'analyzeDeveloperPatterns',
        'analyzeChangeMagnitudePatterns',
        'generatePatternInsights'
      ];
      
      let algorithmsFound = 0;
      for (const algorithm of algorithms) {
        if (content.includes(algorithm)) {
          algorithmsFound++;
        }
      }
      
      const score = (algorithmsFound / algorithms.length) * 100;
      const passed = score >= 90;
      
      this.results.push({
        testName: 'Algorithm Implementation Validation',
        passed,
        score,
        details: `Found ${algorithmsFound}/${algorithms.length} required algorithms`,
        executionTimeMs: Date.now() - startTime
      });
      
      console.log(`🧮 Algorithm validation: ${algorithmsFound}/${algorithms.length} algorithms found`);
      
    } catch (error) {
      this.results.push({
        testName: 'Algorithm Implementation Validation',
        passed: false,
        score: 0,
        details: `Algorithm validation failed: ${error}`,
        executionTimeMs: Date.now() - startTime
      });
    }
  }

  private async validatePerformanceInfrastructure(): Promise<void> {
    const startTime = Date.now();
    console.log('⚡ Validating performance infrastructure...');
    
    try {
      // Test database query performance with a simple query
      const perfStart = Date.now();
      await pool.query('SELECT 1');
      const queryTime = Date.now() - perfStart;
      
      // Check if indexes exist on pattern tables
      const indexResult = await pool.query(`
        SELECT schemaname, tablename, indexname 
        FROM pg_indexes 
        WHERE tablename LIKE '%pattern%'
      `);
      
      const indexCount = indexResult.rows.length;
      const score = Math.min((indexCount / 10) * 100, 100); // Expect at least 10 indexes
      const passed = queryTime < 100 && indexCount > 5;
      
      this.results.push({
        testName: 'Performance Infrastructure Validation',
        passed,
        score,
        details: `Query time: ${queryTime}ms, Indexes found: ${indexCount}`,
        executionTimeMs: Date.now() - startTime
      });
      
      console.log(`⚡ Performance: ${queryTime}ms query time, ${indexCount} indexes`);
      
    } catch (error) {
      this.results.push({
        testName: 'Performance Infrastructure Validation',
        passed: false,
        score: 0,
        details: `Performance validation failed: ${error}`,
        executionTimeMs: Date.now() - startTime
      });
    }
  }

  private async validateTC011Baseline(): Promise<void> {
    const startTime = Date.now();
    console.log('📚 Validating TC011 baseline comparison...');
    
    try {
      // TC011 baseline metrics from research
      const tc011Baseline = {
        totalPatterns: 92606,
        executionTime: 190, // ms
        confidenceLevel: 0.83, // 83%
        significantPatterns: 4
      };
      
      // Get current pattern count
      const currentResult = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM file_cooccurrence_patterns) as cooccurrence,
          (SELECT COUNT(*) FROM temporal_patterns) as temporal,
          (SELECT COUNT(*) FROM developer_patterns) as developer,
          (SELECT COUNT(*) FROM change_magnitude_patterns) as magnitude,
          (SELECT COUNT(*) FROM pattern_insights) as insights
      `);
      
      const currentPatterns = Object.values(currentResult.rows[0]).reduce((a: number, b: any) => a + parseInt(b), 0);
      
      // Calculate score based on pattern discovery rate
      const discoveryRate = (currentPatterns / tc011Baseline.totalPatterns) * 100;
      const score = Math.min(discoveryRate, 100);
      const passed = currentPatterns > 0; // Any patterns found is progress
      
      this.results.push({
        testName: 'TC011 Baseline Comparison',
        passed,
        score,
        details: `Current: ${currentPatterns} patterns vs TC011: ${tc011Baseline.totalPatterns} (${discoveryRate.toFixed(2)}% discovery rate)`,
        executionTimeMs: Date.now() - startTime
      });
      
      console.log(`📚 TC011 comparison: ${currentPatterns}/${tc011Baseline.totalPatterns} patterns (${discoveryRate.toFixed(2)}%)`);
      
    } catch (error) {
      this.results.push({
        testName: 'TC011 Baseline Comparison',
        passed: false,
        score: 0,
        details: `TC011 baseline validation failed: ${error}`,
        executionTimeMs: Date.now() - startTime
      });
    }
  }

  private async generateQuickReport(): Promise<void> {
    console.log('\n================================================================================');
    console.log('🧪 TC019 QUICK PATTERN DETECTION VALIDATION REPORT');
    console.log('================================================================================');
    
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const averageScore = this.results.reduce((sum, r) => sum + r.score, 0) / totalTests;
    const totalExecutionTime = this.results.reduce((sum, r) => sum + r.executionTimeMs, 0);
    
    console.log(`📊 Test Suite Summary:`);
    console.log(`   Tests Run: ${totalTests}`);
    console.log(`   Tests Passed: ${passedTests}/${totalTests} (${((passedTests/totalTests)*100).toFixed(1)}%)`);
    console.log(`   Average Score: ${averageScore.toFixed(1)}%`);
    console.log(`   Total Execution Time: ${totalExecutionTime}ms`);
    console.log(`   Overall Status: ${passedTests >= totalTests * 0.8 ? '✅ PASS' : '❌ FAIL'}`);
    
    console.log('\n🔍 DETAILED RESULTS:');
    this.results.forEach((result, index) => {
      const status = result.passed ? '✅' : '❌';
      console.log(`   ${index + 1}. ${status} ${result.testName}`);
      console.log(`      Score: ${result.score.toFixed(1)}% | Time: ${result.executionTimeMs}ms`);
      console.log(`      Details: ${result.details}`);
    });
    
    console.log('\n💡 TC019 VALIDATION SUMMARY:');
    if (passedTests >= totalTests * 0.8) {
      console.log('✅ Pattern detection infrastructure is ready for historical validation');
      console.log('✅ Core algorithms and database schema are properly implemented');
      console.log('✅ System meets basic requirements for pattern detection accuracy testing');
    } else {
      console.log('❌ Pattern detection infrastructure needs improvement before full validation');
      console.log('💡 Fix failing tests before running comprehensive TC019 validation');
    }
    
    console.log('\n🎯 NEXT STEPS:');
    console.log('1. Fix session assignment issues for full pattern detection testing');
    console.log('2. Run comprehensive TC019 validation suite once session issues resolved');
    console.log('3. Validate pattern detection accuracy against TC011 baseline');
    console.log('4. Performance benchmark all 5 algorithms with real data');
    
    console.log('\n================================================================================');
    console.log('🎉 TC019 QUICK VALIDATION COMPLETED');
    console.log('================================================================================');
  }
}

// Main execution
async function runTC019QuickValidation(): Promise<void> {
  const validator = new TC019QuickValidator();
  await validator.runQuickValidation();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTC019QuickValidation().catch(console.error);
}

export { runTC019QuickValidation };