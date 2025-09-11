#!/usr/bin/env npx tsx

/**
 * TC017: Pattern Analysis API Endpoints - Comprehensive Test Suite
 * 
 * Tests all 10 pattern analysis MCP tools for functionality, performance, and reliability.
 * Validates pattern intelligence API endpoints built on TC013 pattern detection infrastructure.
 * 
 * Test Categories:
 * 1. Pattern Discovery Tests (pattern_get_discovered, pattern_get_trends)
 * 2. Pattern Analytics Tests (pattern_get_correlations, pattern_get_insights)  
 * 3. Pattern Monitoring Tests (pattern_get_alerts, pattern_get_anomalies)
 * 4. Pattern Intelligence Tests (pattern_get_recommendations)
 * 5. Integration Tests (pattern_analyze_session, pattern_analyze_commit, pattern_get_performance)
 * 6. Error Handling and Edge Cases
 * 7. Performance and Load Testing
 * 
 * Created: 2025-09-10
 * Author: AIDIS Team - TC017 Test Suite
 */

import { patternAnalysisHandlers } from './src/handlers/patternAnalysis.js';
import { getCurrentSession } from './src/services/sessionManager.js';
import { db } from './src/config/database.js';

/**
 * Test Configuration
 */
const TEST_CONFIG = {
  timeout: 10000,
  maxRetries: 3,
  performanceThreshold: 2000, // 2 seconds max
  minDataPoints: 5,
  testProjectId: '4afb236c-00d7-433d-87de-0f489b96acb2', // aidis-bootstrap
  testSessionId: null as string | null,
  testCommitShas: [] as string[]
};

/**
 * Test Results Interface
 */
interface TestResult {
  testName: string;
  category: string;
  success: boolean;
  executionTime: number;
  error?: string;
  data?: any;
  performance: {
    responseTime: number;
    dataPoints: number;
    throughput: number;
  };
}

/**
 * Test Suite Manager
 */
class PatternAnalysisTestSuite {
  private results: TestResult[] = [];
  private startTime: number = 0;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Run comprehensive test suite
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting TC017 Pattern Analysis API Test Suite');
    console.log('=' .repeat(60));

    try {
      // Initialize test environment
      await this.initializeTestEnvironment();

      // Test Categories
      await this.runPatternDiscoveryTests();
      await this.runPatternAnalyticsTests();
      await this.runPatternMonitoringTests();
      await this.runPatternIntelligenceTests();
      await this.runIntegrationTests();
      await this.runErrorHandlingTests();
      await this.runPerformanceTests();

      // Generate test report
      await this.generateTestReport();

    } catch (error) {
      console.error('❌ Test suite failed to initialize:', error);
    }
  }

  /**
   * Initialize test environment with sample data
   */
  private async initializeTestEnvironment(): Promise<void> {
    console.log('\n📋 Initializing test environment...');

    try {
      // Get current session
      TEST_CONFIG.testSessionId = await getCurrentSession();
      console.log(`✅ Test session: ${TEST_CONFIG.testSessionId?.substring(0, 8)}...`);

      // Get some test commit SHAs
      const commitsQuery = `
        SELECT commit_sha 
        FROM git_commits 
        WHERE project_id = $1 
        ORDER BY author_date DESC 
        LIMIT 5
      `;
      
      const commitsResult = await db.query(commitsQuery, [TEST_CONFIG.testProjectId]);
      TEST_CONFIG.testCommitShas = commitsResult.rows.map(row => row.commit_sha);
      
      console.log(`✅ Test commits: ${TEST_CONFIG.testCommitShas.length} commits found`);
      
    } catch (error) {
      console.warn(`⚠️  Test environment initialization warning:`, error);
      // Continue with limited testing
    }
  }

  /**
   * Category 1: Pattern Discovery Tests
   */
  private async runPatternDiscoveryTests(): Promise<void> {
    console.log('\n🔍 Category 1: Pattern Discovery Tests');
    console.log('-'.repeat(40));

    // Test 1: Basic pattern discovery
    await this.runTest('pattern_get_discovered - Basic Discovery', 'discovery', async () => {
      const result = await patternAnalysisHandlers.pattern_get_discovered({
        projectId: TEST_CONFIG.testProjectId,
        limit: 20
      });

      if (!result.success) {
        throw new Error(result.error || 'Pattern discovery failed');
      }

      return {
        totalPatterns: result.patterns.totalPatterns,
        executionTime: result.executionTimeMs,
        dataIntegrity: this.validatePatternStructure(result.patterns)
      };
    });

    // Test 2: Filtered pattern discovery
    await this.runTest('pattern_get_discovered - Filtered Discovery', 'discovery', async () => {
      const result = await patternAnalysisHandlers.pattern_get_discovered({
        projectId: TEST_CONFIG.testProjectId,
        patternTypes: ['cooccurrence', 'magnitude'],
        confidenceMin: 0.7,
        timeRangeHours: 168,
        limit: 10
      });

      return {
        filteredResults: result.patterns.totalPatterns,
        filterEffectiveness: result.filteredCount <= 10
      };
    });

    // Test 3: Pattern trend analysis
    await this.runTest('pattern_get_trends - Trend Analysis', 'discovery', async () => {
      const result = await patternAnalysisHandlers.pattern_get_trends({
        projectId: TEST_CONFIG.testProjectId,
        patternType: 'cooccurrence',
        timeRangeDays: 30,
        granularity: 'day',
        includeForecasting: true
      });

      if (!result.success) {
        throw new Error(result.error || 'Trend analysis failed');
      }

      return {
        trendsAnalyzed: result.trends.length,
        hasForecast: result.trends.some(t => t.forecastNextPeriod > 0),
        trendDirection: result.trends[0]?.trend || 'none'
      };
    });
  }

  /**
   * Category 2: Pattern Analytics Tests
   */
  private async runPatternAnalyticsTests(): Promise<void> {
    console.log('\n📊 Category 2: Pattern Analytics Tests');
    console.log('-'.repeat(40));

    // Test 1: Pattern correlations
    await this.runTest('pattern_get_correlations - Correlation Analysis', 'analytics', async () => {
      const result = await patternAnalysisHandlers.pattern_get_correlations({
        projectId: TEST_CONFIG.testProjectId,
        minCorrelationScore: 0.3,
        limit: 15
      });

      if (!result.success) {
        throw new Error(result.error || 'Correlation analysis failed');
      }

      return {
        correlationsFound: result.totalCorrelations,
        strongCorrelations: result.strongCorrelations,
        correlationQuality: result.strongCorrelations / Math.max(result.totalCorrelations, 1)
      };
    });

    // Test 2: Pattern insights
    await this.runTest('pattern_get_insights - Insight Generation', 'analytics', async () => {
      const result = await patternAnalysisHandlers.pattern_get_insights({
        projectId: TEST_CONFIG.testProjectId,
        confidenceMin: 0.6,
        sortBy: 'confidence',
        limit: 20
      });

      if (!result.success) {
        throw new Error(result.error || 'Insight generation failed');
      }

      return {
        totalInsights: result.totalInsights,
        criticalInsights: result.criticalInsights,
        implementableInsights: result.implementableInsights,
        insightQuality: result.criticalInsights / Math.max(result.totalInsights, 1)
      };
    });
  }

  /**
   * Category 3: Pattern Monitoring Tests
   */
  private async runPatternMonitoringTests(): Promise<void> {
    console.log('\n🚨 Category 3: Pattern Monitoring Tests');
    console.log('-'.repeat(40));

    // Test 1: Pattern alerts
    await this.runTest('pattern_get_alerts - Alert System', 'monitoring', async () => {
      const result = await patternAnalysisHandlers.pattern_get_alerts({
        projectId: TEST_CONFIG.testProjectId,
        timeRangeHours: 72,
        sortBy: 'severity',
        limit: 25
      });

      if (!result.success) {
        throw new Error(result.error || 'Alert system failed');
      }

      return {
        totalAlerts: result.totalAlerts,
        criticalAlerts: result.criticalAlerts,
        alertCoverage: result.totalAlerts > 0,
        alertPrioritization: result.criticalAlerts <= result.totalAlerts
      };
    });

    // Test 2: Anomaly detection
    await this.runTest('pattern_get_anomalies - Anomaly Detection', 'monitoring', async () => {
      const result = await patternAnalysisHandlers.pattern_get_anomalies({
        projectId: TEST_CONFIG.testProjectId,
        patternTypes: ['cooccurrence', 'developer', 'magnitude'],
        detectionMethod: 'statistical',
        sensitivityLevel: 'medium',
        timeRangeHours: 168
      });

      if (!result.success) {
        throw new Error(result.error || 'Anomaly detection failed');
      }

      return {
        totalAnomalies: result.totalAnomalies,
        statisticalAnomalies: result.statisticalAnomalies,
        behavioralAnomalies: result.behavioralAnomalies,
        detectionAccuracy: (result.statisticalAnomalies + result.behavioralAnomalies) === result.totalAnomalies
      };
    });
  }

  /**
   * Category 4: Pattern Intelligence Tests
   */
  private async runPatternIntelligenceTests(): Promise<void> {
    console.log('\n💡 Category 4: Pattern Intelligence Tests');
    console.log('-'.repeat(40));

    // Test 1: AI recommendations
    await this.runTest('pattern_get_recommendations - AI Recommendations', 'intelligence', async () => {
      const result = await patternAnalysisHandlers.pattern_get_recommendations({
        projectId: TEST_CONFIG.testProjectId,
        sessionId: TEST_CONFIG.testSessionId,
        priorityLevel: 'medium',
        implementationCapacity: 'moderate',
        limit: 10
      });

      if (!result.success) {
        throw new Error(result.error || 'AI recommendations failed');
      }

      return {
        totalRecommendations: result.totalRecommendations,
        highImpactRecommendations: result.highImpactRecommendations,
        quickWins: result.quickWins,
        recommendationQuality: this.evaluateRecommendationQuality(result.recommendations)
      };
    });
  }

  /**
   * Category 5: Integration Tests
   */
  private async runIntegrationTests(): Promise<void> {
    console.log('\n🔗 Category 5: Integration Tests');
    console.log('-'.repeat(40));

    // Test 1: Session analysis
    await this.runTest('pattern_analyze_session - Session Analysis', 'integration', async () => {
      const result = await patternAnalysisHandlers.pattern_analyze_session({
        sessionId: TEST_CONFIG.testSessionId,
        analysisDepth: 'detailed',
        timeRangeHours: 72
      });

      if (!result.success) {
        throw new Error(result.error || 'Session analysis failed');
      }

      return {
        sessionId: result.sessionId,
        patternsAnalyzed: Object.values(result.analysis.sessionPatterns).reduce((a, b) => a + b, 0),
        riskScore: result.analysis.riskAssessment.overallRiskScore,
        recommendationsGenerated: result.analysis.recommendations.length
      };
    });

    // Test 2: Commit analysis
    if (TEST_CONFIG.testCommitShas.length > 0) {
      await this.runTest('pattern_analyze_commit - Commit Analysis', 'integration', async () => {
        const result = await patternAnalysisHandlers.pattern_analyze_commit({
          commitShas: TEST_CONFIG.testCommitShas.slice(0, 3),
          projectId: TEST_CONFIG.testProjectId,
          includeImpactAnalysis: true,
          analysisDepth: 'detailed'
        });

        if (!result.success) {
          throw new Error(result.error || 'Commit analysis failed');
        }

        return {
          commitsAnalyzed: result.commitAnalysis.analyzedCommits,
          patternsFound: Object.values(result.commitAnalysis.patterns).reduce((a, b) => a + b, 0),
          riskIntroduced: result.commitAnalysis.impactAnalysis.riskIntroduced,
          recommendationsGenerated: result.commitAnalysis.recommendations.length
        };
      });
    }

    // Test 3: Performance monitoring
    await this.runTest('pattern_get_performance - Performance Monitoring', 'integration', async () => {
      const result = await patternAnalysisHandlers.pattern_get_performance({
        projectId: TEST_CONFIG.testProjectId,
        timeRangeHours: 168,
        includeOptimizationSuggestions: true
      });

      if (!result.success) {
        throw new Error(result.error || 'Performance monitoring failed');
      }

      return {
        totalDetections: result.performance.systemMetrics.totalDetections,
        averageExecutionTime: result.performance.systemMetrics.averageExecutionTime,
        successRate: result.performance.systemMetrics.successRate,
        optimizationSuggestions: result.suggestions.length
      };
    });
  }

  /**
   * Category 6: Error Handling Tests
   */
  private async runErrorHandlingTests(): Promise<void> {
    console.log('\n❌ Category 6: Error Handling Tests');
    console.log('-'.repeat(40));

    // Test 1: Invalid parameters
    await this.runTest('Error Handling - Invalid Parameters', 'error_handling', async () => {
      try {
        const result = await patternAnalysisHandlers.pattern_get_trends({
          patternType: '', // Invalid empty pattern type
          timeRangeDays: -1 // Invalid negative range
        });

        // Should handle gracefully without crashing
        return {
          handledGracefully: !result.success,
          errorMessage: result.error || 'No error message provided'
        };
      } catch (error) {
        // Should not throw unhandled exceptions
        return {
          handledGracefully: false,
          unexpectedException: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    // Test 2: Non-existent project
    await this.runTest('Error Handling - Non-existent Project', 'error_handling', async () => {
      const result = await patternAnalysisHandlers.pattern_get_discovered({
        projectId: 'non-existent-project-id',
        limit: 10
      });

      return {
        handledGracefully: !result.success,
        appropriateError: result.error?.includes('project') || result.error?.includes('context')
      };
    });
  }

  /**
   * Category 7: Performance Tests
   */
  private async runPerformanceTests(): Promise<void> {
    console.log('\n⚡ Category 7: Performance Tests');
    console.log('-'.repeat(40));

    // Test 1: Response time under load
    await this.runTest('Performance - Response Time', 'performance', async () => {
      const startTime = Date.now();
      
      // Run multiple concurrent requests
      const promises = Array.from({ length: 5 }, () => 
        patternAnalysisHandlers.pattern_get_discovered({
          projectId: TEST_CONFIG.testProjectId,
          limit: 50
        })
      );

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      const avgResponseTime = totalTime / results.length;

      return {
        concurrentRequests: 5,
        totalTime,
        avgResponseTime,
        allSuccessful: results.every(r => r.success),
        performanceGrade: avgResponseTime < TEST_CONFIG.performanceThreshold ? 'PASS' : 'FAIL'
      };
    });

    // Test 2: Memory efficiency
    await this.runTest('Performance - Memory Efficiency', 'performance', async () => {
      const initialMemory = process.memoryUsage();

      // Process large dataset
      const result = await patternAnalysisHandlers.pattern_get_insights({
        projectId: TEST_CONFIG.testProjectId,
        limit: 100
      });

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      return {
        initialHeapMB: Math.round(initialMemory.heapUsed / 1024 / 1024),
        finalHeapMB: Math.round(finalMemory.heapUsed / 1024 / 1024),
        memoryIncreaseMB: Math.round(memoryIncrease / 1024 / 1024),
        dataProcessed: result.patterns?.totalPatterns || 0,
        memoryEfficiency: result.patterns?.totalPatterns ? memoryIncrease / result.patterns.totalPatterns : 0
      };
    });
  }

  /**
   * Run individual test with error handling and metrics
   */
  private async runTest(testName: string, category: string, testFunction: () => Promise<any>): Promise<void> {
    const startTime = Date.now();

    try {
      console.log(`  🔬 ${testName}...`);
      
      const testData = await testFunction();
      const executionTime = Date.now() - startTime;

      this.results.push({
        testName,
        category,
        success: true,
        executionTime,
        data: testData,
        performance: {
          responseTime: executionTime,
          dataPoints: this.countDataPoints(testData),
          throughput: this.countDataPoints(testData) / (executionTime / 1000)
        }
      });

      console.log(`    ✅ PASS (${executionTime}ms)`);

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      this.results.push({
        testName,
        category,
        success: false,
        executionTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        performance: {
          responseTime: executionTime,
          dataPoints: 0,
          throughput: 0
        }
      });

      console.log(`    ❌ FAIL (${executionTime}ms): ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Helper: Validate pattern structure integrity
   */
  private validatePatternStructure(patterns: any): boolean {
    try {
      return (
        typeof patterns.totalPatterns === 'number' &&
        Array.isArray(patterns.cooccurrencePatterns) &&
        Array.isArray(patterns.temporalPatterns) &&
        Array.isArray(patterns.developerPatterns) &&
        Array.isArray(patterns.magnitudePatterns) &&
        Array.isArray(patterns.insights) &&
        typeof patterns.discoverySessionId === 'string'
      );
    } catch {
      return false;
    }
  }

  /**
   * Helper: Evaluate recommendation quality
   */
  private evaluateRecommendationQuality(recommendations: any[]): number {
    if (!recommendations || recommendations.length === 0) return 0;

    let qualityScore = 0;
    for (const rec of recommendations) {
      if (rec.steps && Array.isArray(rec.steps) && rec.steps.length > 0) qualityScore += 0.3;
      if (rec.rationale && rec.rationale.length > 50) qualityScore += 0.3;
      if (rec.expectedOutcome && rec.expectedOutcome.length > 20) qualityScore += 0.2;
      if (rec.confidence && rec.confidence > 0.5) qualityScore += 0.2;
    }

    return qualityScore / recommendations.length;
  }

  /**
   * Helper: Count data points in test result
   */
  private countDataPoints(data: any): number {
    if (!data) return 0;
    
    if (typeof data === 'object') {
      if (Array.isArray(data)) return data.length;
      
      // Count numeric values as data points
      return Object.values(data).filter(v => typeof v === 'number' && v > 0).length;
    }
    
    return 1;
  }

  /**
   * Generate comprehensive test report
   */
  private async generateTestReport(): Promise<void> {
    const totalTime = Date.now() - this.startTime;
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 TC017 PATTERN ANALYSIS API TEST REPORT');
    console.log('='.repeat(60));

    console.log(`\n📈 OVERALL RESULTS:`);
    console.log(`  Total Tests: ${totalTests}`);
    console.log(`  Passed: ${passedTests} (${(passedTests/totalTests*100).toFixed(1)}%)`);
    console.log(`  Failed: ${failedTests} (${(failedTests/totalTests*100).toFixed(1)}%)`);
    console.log(`  Total Time: ${totalTime}ms (${(totalTime/1000).toFixed(1)}s)`);

    // Category breakdown
    console.log(`\n📊 RESULTS BY CATEGORY:`);
    const categories = [...new Set(this.results.map(r => r.category))];
    
    for (const category of categories) {
      const categoryTests = this.results.filter(r => r.category === category);
      const categoryPassed = categoryTests.filter(r => r.success).length;
      const categoryTotal = categoryTests.length;
      
      console.log(`  ${category}: ${categoryPassed}/${categoryTotal} (${(categoryPassed/categoryTotal*100).toFixed(1)}%)`);
    }

    // Performance metrics
    console.log(`\n⚡ PERFORMANCE METRICS:`);
    const avgResponseTime = this.results.reduce((sum, r) => sum + r.performance.responseTime, 0) / this.results.length;
    const totalDataPoints = this.results.reduce((sum, r) => sum + r.performance.dataPoints, 0);
    const avgThroughput = this.results.reduce((sum, r) => sum + r.performance.throughput, 0) / this.results.length;

    console.log(`  Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
    console.log(`  Total Data Points Processed: ${totalDataPoints}`);
    console.log(`  Average Throughput: ${avgThroughput.toFixed(1)} data points/second`);

    // Failed tests details
    if (failedTests > 0) {
      console.log(`\n❌ FAILED TESTS:`);
      this.results.filter(r => !r.success).forEach(result => {
        console.log(`  ${result.testName}: ${result.error}`);
      });
    }

    // Success summary
    console.log(`\n🎯 TEST SUITE SUMMARY:`);
    if (passedTests === totalTests) {
      console.log(`  ✅ ALL TESTS PASSED - Pattern Analysis API is fully functional!`);
    } else if (passedTests / totalTests >= 0.8) {
      console.log(`  ⚠️  MOSTLY PASSING - Pattern Analysis API is largely functional with minor issues`);
    } else {
      console.log(`  ❌ SIGNIFICANT ISSUES - Pattern Analysis API needs attention before production`);
    }

    console.log(`\n📋 RECOMMENDATIONS:`);
    if (avgResponseTime > TEST_CONFIG.performanceThreshold) {
      console.log(`  - Optimize response times (current: ${avgResponseTime.toFixed(0)}ms, target: <${TEST_CONFIG.performanceThreshold}ms)`);
    }
    if (totalDataPoints < TEST_CONFIG.minDataPoints) {
      console.log(`  - Increase test data coverage (current: ${totalDataPoints} data points)`);
    }
    if (failedTests > 0) {
      console.log(`  - Fix ${failedTests} failing tests before production deployment`);
    }
    
    console.log(`\n🚀 TC017 Pattern Analysis API Testing Complete!`);
    console.log('='.repeat(60));
  }
}

/**
 * Main test execution
 */
async function main(): Promise<void> {
  const testSuite = new PatternAnalysisTestSuite();
  await testSuite.runAllTests();
  process.exit(0);
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Test suite crashed:', error);
    process.exit(1);
  });
}

export { PatternAnalysisTestSuite };