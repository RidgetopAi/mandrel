#!/usr/bin/env npx tsx
/**
 * TC019: Performance Benchmarking Test Suite
 * 
 * Comprehensive performance testing for pattern detection algorithms including
 * load testing with varying data sizes, memory usage monitoring, concurrent 
 * access testing, response time distribution analysis, and regression detection.
 * 
 * Features:
 * - Load testing with varying data sizes (100-10K+ commits)
 * - Memory usage monitoring and leak detection
 * - Concurrent access testing for multi-user scenarios
 * - Response time distribution analysis
 * - Performance regression detection against baselines
 * - Scalability factor calculation
 * - Resource utilization monitoring
 * 
 * Author: TC019 Performance Framework
 * Created: 2025-09-10
 */

import { performance } from 'perf_hooks';
import { db } from './mcp-server/src/config/database.js';
import PatternDetector, { 
  PatternDetectionResult, 
  PatternDetectorConfig
} from './mcp-server/src/services/patternDetector.js';

// ========================================================================================
// TYPE DEFINITIONS
// ========================================================================================

interface LoadTestConfig {
  minCommits: number;
  maxCommits: number;
  stepSize: number;
  iterations: number;
  concurrency: number;
  timeoutMs: number;
}

interface PerformanceMetrics {
  executionTime: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  cpuUsage: {
    user: number;
    system: number;
  };
  patternsPerSecond: number;
  throughput: number;
  responseTime: number;
}

interface LoadTestResult {
  commitCount: number;
  iteration: number;
  concurrentUsers: number;
  startTime: number;
  endTime: number;
  metrics: PerformanceMetrics;
  detectionResult: PatternDetectionResult;
  success: boolean;
  errors: string[];
}

interface ConcurrencyTestResult {
  concurrentUsers: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  throughputPerSecond: number;
  errorRate: number;
  resourceContention: boolean;
}

interface PerformanceBenchmarkReport {
  benchmarkId: string;
  projectId: string;
  benchmarkTimestamp: Date;
  testConfiguration: LoadTestConfig;
  
  // Load testing results
  loadTestResults: LoadTestResult[];
  
  // Scalability analysis
  scalabilityAnalysis: {
    linearScalingFactor: number;
    scalabilityBreakpoint: number;
    maxSupportedLoad: number;
    optimalBatchSize: number;
  };
  
  // Performance baselines
  performanceBaselines: {
    tc011Baseline: number;
    currentBaseline: number;
    regressionThreshold: number;
    performanceRegression: boolean;
  };
  
  // Memory analysis
  memoryAnalysis: {
    baselineMemory: number;
    peakMemory: number;
    memoryGrowthRate: number;
    memoryLeaksDetected: boolean;
    gcPressure: number;
  };
  
  // Concurrency testing
  concurrencyResults: ConcurrencyTestResult[];
  
  // Response time analysis
  responseTimeAnalysis: {
    percentiles: Record<string, number>; // P50, P90, P95, P99
    distribution: number[];
    outliers: number;
    variability: number;
  };
  
  // Algorithm-specific performance
  algorithmPerformance: {
    cooccurrence: PerformanceMetrics;
    temporal: PerformanceMetrics;
    developer: PerformanceMetrics;
    magnitude: PerformanceMetrics;
    insights: PerformanceMetrics;
  };
  
  // Performance recommendations
  performanceRecommendations: {
    priority: 'critical' | 'high' | 'medium' | 'low';
    issue: string;
    recommendation: string;
    estimatedImprovement: string;
  }[];
  
  benchmarkStatus: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'FAILED';
}

// ========================================================================================
// PERFORMANCE BENCHMARKING FRAMEWORK
// ========================================================================================

export class TC019PerformanceBenchmarks {
  private detector: PatternDetector;
  private projectId: string = '';
  private baselineMemory: number = 0;
  
  // Performance targets
  private readonly PERFORMANCE_TARGETS = {
    SUB_100MS_TARGET: 100,
    TC011_BASELINE: 190,
    MAX_MEMORY_MB: 512,
    MIN_THROUGHPUT: 100, // patterns per second
    MAX_ERROR_RATE: 0.05 // 5%
  };
  
  constructor() {
    this.detector = PatternDetector.getInstance({
      detectionTimeoutMs: 100,
      enableBatchProcessing: true,
      batchSizeLimit: 50
    });
  }

  /**
   * Run comprehensive performance benchmark suite
   */
  async runPerformanceBenchmarks(config?: Partial<LoadTestConfig>): Promise<PerformanceBenchmarkReport> {
    const startTime = performance.now();
    const benchmarkId = `tc019_perf_${Date.now()}`;
    
    console.log('⚡ Starting TC019 Performance Benchmarking Framework');
    
    try {
      // Initialize benchmarking
      this.projectId = await this.getValidationProject();
      this.baselineMemory = this.getCurrentMemoryUsage().heapUsed;
      
      const testConfiguration: LoadTestConfig = {
        minCommits: 100,
        maxCommits: 10000,
        stepSize: 500,
        iterations: 3,
        concurrency: 10,
        timeoutMs: 30000,
        ...config
      };
      
      console.log(`📊 Test Configuration: ${testConfiguration.minCommits}-${testConfiguration.maxCommits} commits, ${testConfiguration.iterations} iterations`);
      
      // Run load testing with varying data sizes
      const loadTestResults = await this.runLoadTesting(testConfiguration);
      
      // Analyze scalability
      const scalabilityAnalysis = await this.analyzeScalability(loadTestResults);
      
      // Check for performance regression
      const performanceBaselines = await this.checkPerformanceRegression(loadTestResults);
      
      // Analyze memory usage
      const memoryAnalysis = await this.analyzeMemoryUsage(loadTestResults);
      
      // Run concurrency testing
      const concurrencyResults = await this.runConcurrencyTesting(testConfiguration);
      
      // Analyze response time distribution
      const responseTimeAnalysis = await this.analyzeResponseTimeDistribution(loadTestResults);
      
      // Calculate algorithm-specific performance
      const algorithmPerformance = await this.calculateAlgorithmPerformance(loadTestResults);
      
      // Generate performance recommendations
      const performanceRecommendations = await this.generatePerformanceRecommendations(
        loadTestResults, scalabilityAnalysis, memoryAnalysis, concurrencyResults
      );
      
      // Determine benchmark status
      const benchmarkStatus = this.determineBenchmarkStatus(
        performanceBaselines, memoryAnalysis, concurrencyResults, responseTimeAnalysis
      );
      
      const report: PerformanceBenchmarkReport = {
        benchmarkId,
        projectId: this.projectId,
        benchmarkTimestamp: new Date(),
        testConfiguration,
        loadTestResults,
        scalabilityAnalysis,
        performanceBaselines,
        memoryAnalysis,
        concurrencyResults,
        responseTimeAnalysis,
        algorithmPerformance,
        performanceRecommendations,
        benchmarkStatus
      };
      
      await this.savePerformanceReport(report);
      await this.printPerformanceSummary(report);
      
      return report;
      
    } catch (error) {
      console.error('❌ Performance benchmarking failed:', error);
      throw error;
    }
  }

  /**
   * Run load testing with varying data sizes
   */
  private async runLoadTesting(config: LoadTestConfig): Promise<LoadTestResult[]> {
    console.log('📈 Running load testing with varying data sizes...');
    
    const results: LoadTestResult[] = [];
    
    // Test with increasing commit counts
    for (let commitCount = config.minCommits; commitCount <= config.maxCommits; commitCount += config.stepSize) {
      console.log(`📊 Testing with ${commitCount} commits...`);
      
      // Run multiple iterations for statistical accuracy
      for (let iteration = 0; iteration < config.iterations; iteration++) {
        try {
          const testResult = await this.runSingleLoadTest(commitCount, iteration, config);
          results.push(testResult);
          
          // Small delay between tests to prevent overwhelming the system
          await this.delay(100);
          
        } catch (error) {
          console.error(`❌ Load test failed for ${commitCount} commits, iteration ${iteration}:`, error);
          
          results.push({
            commitCount,
            iteration,
            concurrentUsers: 1,
            startTime: Date.now(),
            endTime: Date.now(),
            metrics: this.createEmptyMetrics(),
            detectionResult: this.createEmptyDetectionResult(),
            success: false,
            errors: [error instanceof Error ? error.message : 'Unknown error']
          });
        }
      }
      
      // Check if we've hit performance limits
      const recentResults = results.slice(-config.iterations);
      const averageTime = recentResults.reduce((sum, r) => sum + r.metrics.executionTime, 0) / recentResults.length;
      
      if (averageTime > config.timeoutMs) {
        console.log(`⚠️  Performance limit reached at ${commitCount} commits (${averageTime}ms > ${config.timeoutMs}ms)`);
        break;
      }
    }
    
    console.log(`✅ Load testing completed with ${results.length} test runs`);
    return results;
  }

  /**
   * Run single load test
   */
  private async runSingleLoadTest(
    commitCount: number, 
    iteration: number, 
    config: LoadTestConfig
  ): Promise<LoadTestResult> {
    
    const startTime = Date.now();
    const startMemory = this.getCurrentMemoryUsage();
    const startCPU = process.cpuUsage();
    
    try {
      // Get commits for testing
      const commitShas = await this.getTestCommits(commitCount);
      
      // Run pattern detection
      const detectionStart = performance.now();
      const detectionResult = await this.detector.detectPatternsForCommits(commitShas);
      const detectionEnd = performance.now();
      
      const endTime = Date.now();
      const endMemory = this.getCurrentMemoryUsage();
      const endCPU = process.cpuUsage(startCPU);
      
      const executionTime = detectionEnd - detectionStart;
      const patternsPerSecond = detectionResult.totalPatternsFound / (executionTime / 1000);
      const throughput = commitCount / (executionTime / 1000);
      
      const metrics: PerformanceMetrics = {
        executionTime,
        memoryUsage: {
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          heapTotal: endMemory.heapTotal,
          external: endMemory.external,
          rss: endMemory.rss
        },
        cpuUsage: {
          user: endCPU.user / 1000, // Convert to milliseconds
          system: endCPU.system / 1000
        },
        patternsPerSecond,
        throughput,
        responseTime: executionTime
      };
      
      return {
        commitCount,
        iteration,
        concurrentUsers: 1,
        startTime,
        endTime,
        metrics,
        detectionResult,
        success: true,
        errors: []
      };
      
    } catch (error) {
      const endTime = Date.now();
      
      return {
        commitCount,
        iteration,
        concurrentUsers: 1,
        startTime,
        endTime,
        metrics: this.createEmptyMetrics(),
        detectionResult: this.createEmptyDetectionResult(),
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Run concurrency testing
   */
  private async runConcurrencyTesting(config: LoadTestConfig): Promise<ConcurrencyTestResult[]> {
    console.log('🔄 Running concurrency testing...');
    
    const results: ConcurrencyTestResult[] = [];
    const testCommitCount = Math.min(1000, config.maxCommits / 2); // Use moderate load for concurrency testing
    
    // Test with increasing concurrent users
    for (let concurrentUsers = 1; concurrentUsers <= config.concurrency; concurrentUsers++) {
      console.log(`👥 Testing with ${concurrentUsers} concurrent users...`);
      
      try {
        const concurrencyResult = await this.runConcurrentTest(testCommitCount, concurrentUsers, config);
        results.push(concurrencyResult);
        
        // Check if error rate is too high
        if (concurrencyResult.errorRate > this.PERFORMANCE_TARGETS.MAX_ERROR_RATE) {
          console.log(`⚠️  High error rate detected: ${(concurrencyResult.errorRate * 100).toFixed(1)}%`);
        }
        
      } catch (error) {
        console.error(`❌ Concurrency test failed for ${concurrentUsers} users:`, error);
        
        results.push({
          concurrentUsers,
          totalRequests: concurrentUsers,
          successfulRequests: 0,
          failedRequests: concurrentUsers,
          averageResponseTime: 0,
          minResponseTime: 0,
          maxResponseTime: 0,
          throughputPerSecond: 0,
          errorRate: 1.0,
          resourceContention: true
        });
      }
    }
    
    console.log(`✅ Concurrency testing completed with ${results.length} concurrency levels`);
    return results;
  }

  /**
   * Run concurrent test with multiple users
   */
  private async runConcurrentTest(
    commitCount: number, 
    concurrentUsers: number, 
    config: LoadTestConfig
  ): Promise<ConcurrencyTestResult> {
    
    const startTime = Date.now();
    
    // Create promises for concurrent execution
    const testPromises = Array.from({ length: concurrentUsers }, (_, i) => 
      this.runConcurrentUserTest(commitCount, i, config.timeoutMs)
    );
    
    // Wait for all tests to complete
    const results = await Promise.allSettled(testPromises);
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    // Analyze results
    const successfulResults = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failedResults = results.filter(r => r.status === 'rejected');
    
    const responseTimes = successfulResults.map(r => r.executionTime);
    const averageResponseTime = responseTimes.length > 0 ? 
      responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0;
    
    const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
    const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
    
    const successfulRequests = successfulResults.length;
    const failedRequests = failedResults.length;
    const totalRequests = concurrentUsers;
    
    const throughputPerSecond = (successfulRequests * 1000) / totalTime;
    const errorRate = failedRequests / totalRequests;
    
    // Detect resource contention (degraded performance with more users)
    const resourceContention = concurrentUsers > 1 && 
      averageResponseTime > (responseTimes[0] || 0) * concurrentUsers * 0.5;
    
    return {
      concurrentUsers,
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      minResponseTime,
      maxResponseTime,
      throughputPerSecond,
      errorRate,
      resourceContention
    };
  }

  /**
   * Run test for single concurrent user
   */
  private async runConcurrentUserTest(
    commitCount: number, 
    userId: number, 
    timeoutMs: number
  ): Promise<{ executionTime: number; success: boolean }> {
    
    const startTime = performance.now();
    
    try {
      // Get commits for this user
      const commitShas = await this.getTestCommits(commitCount, userId * 10); // Offset to avoid overlap
      
      // Run pattern detection with timeout
      const detectionPromise = this.detector.detectPatternsForCommits(commitShas);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      );
      
      await Promise.race([detectionPromise, timeoutPromise]);
      
      const executionTime = performance.now() - startTime;
      
      return {
        executionTime,
        success: true
      };
      
    } catch (error) {
      const executionTime = performance.now() - startTime;
      
      return {
        executionTime,
        success: false
      };
    }
  }

  // ========================================================================================
  // ANALYSIS METHODS
  // ========================================================================================

  /**
   * Analyze scalability
   */
  private async analyzeScalability(loadTestResults: LoadTestResult[]): Promise<PerformanceBenchmarkReport['scalabilityAnalysis']> {
    console.log('📊 Analyzing scalability...');
    
    const successfulResults = loadTestResults.filter(r => r.success);
    
    if (successfulResults.length < 2) {
      return {
        linearScalingFactor: 0,
        scalabilityBreakpoint: 0,
        maxSupportedLoad: 0,
        optimalBatchSize: 100
      };
    }
    
    // Calculate linear scaling factor
    const commitCounts = successfulResults.map(r => r.commitCount);
    const executionTimes = successfulResults.map(r => r.metrics.executionTime);
    
    const linearScalingFactor = this.calculateLinearCorrelation(commitCounts, executionTimes);
    
    // Find scalability breakpoint (where performance degrades non-linearly)
    let scalabilityBreakpoint = 0;
    for (let i = 1; i < successfulResults.length; i++) {
      const prev = successfulResults[i - 1];
      const curr = successfulResults[i];
      
      const expectedTime = prev.metrics.executionTime * (curr.commitCount / prev.commitCount);
      const actualTime = curr.metrics.executionTime;
      
      if (actualTime > expectedTime * 1.5) { // 50% worse than linear
        scalabilityBreakpoint = prev.commitCount;
        break;
      }
    }
    
    // Find max supported load (under performance target)
    const maxSupportedLoad = successfulResults
      .filter(r => r.metrics.executionTime <= this.PERFORMANCE_TARGETS.SUB_100MS_TARGET)
      .reduce((max, r) => Math.max(max, r.commitCount), 0);
    
    // Calculate optimal batch size
    const optimalBatchSize = this.calculateOptimalBatchSize(successfulResults);
    
    return {
      linearScalingFactor,
      scalabilityBreakpoint: scalabilityBreakpoint || commitCounts[commitCounts.length - 1],
      maxSupportedLoad: maxSupportedLoad || commitCounts[0],
      optimalBatchSize
    };
  }

  /**
   * Check for performance regression
   */
  private async checkPerformanceRegression(loadTestResults: LoadTestResult[]): Promise<PerformanceBenchmarkReport['performanceBaselines']> {
    console.log('📉 Checking for performance regression...');
    
    const tc011Baseline = this.PERFORMANCE_TARGETS.TC011_BASELINE;
    
    // Calculate current baseline from recent successful results
    const successfulResults = loadTestResults.filter(r => r.success);
    const currentBaseline = successfulResults.length > 0 ?
      successfulResults.reduce((sum, r) => sum + r.metrics.executionTime, 0) / successfulResults.length :
      0;
    
    const regressionThreshold = tc011Baseline * 1.5; // 50% worse than baseline
    const performanceRegression = currentBaseline > regressionThreshold;
    
    return {
      tc011Baseline,
      currentBaseline,
      regressionThreshold,
      performanceRegression
    };
  }

  /**
   * Analyze memory usage
   */
  private async analyzeMemoryUsage(loadTestResults: LoadTestResult[]): Promise<PerformanceBenchmarkReport['memoryAnalysis']> {
    console.log('💾 Analyzing memory usage...');
    
    const successfulResults = loadTestResults.filter(r => r.success);
    
    if (successfulResults.length === 0) {
      return {
        baselineMemory: this.baselineMemory,
        peakMemory: this.baselineMemory,
        memoryGrowthRate: 0,
        memoryLeaksDetected: false,
        gcPressure: 0
      };
    }
    
    const memoryUsages = successfulResults.map(r => r.metrics.memoryUsage.heapUsed);
    const peakMemory = Math.max(...memoryUsages);
    
    // Calculate memory growth rate
    const commitCounts = successfulResults.map(r => r.commitCount);
    const memoryGrowthRate = this.calculateLinearCorrelation(commitCounts, memoryUsages);
    
    // Detect memory leaks (memory keeps growing beyond expected)
    const expectedGrowth = (peakMemory - this.baselineMemory) / Math.max(...commitCounts);
    const actualGrowth = memoryGrowthRate;
    const memoryLeaksDetected = actualGrowth > expectedGrowth * 2;
    
    // Calculate GC pressure (simplified)
    const avgMemoryIncrease = memoryUsages.reduce((sum, usage) => sum + usage, 0) / memoryUsages.length;
    const gcPressure = avgMemoryIncrease / (this.PERFORMANCE_TARGETS.MAX_MEMORY_MB * 1024 * 1024);
    
    return {
      baselineMemory: this.baselineMemory,
      peakMemory,
      memoryGrowthRate,
      memoryLeaksDetected,
      gcPressure
    };
  }

  /**
   * Analyze response time distribution
   */
  private async analyzeResponseTimeDistribution(loadTestResults: LoadTestResult[]): Promise<PerformanceBenchmarkReport['responseTimeAnalysis']> {
    console.log('⏱️  Analyzing response time distribution...');
    
    const successfulResults = loadTestResults.filter(r => r.success);
    const responseTimes = successfulResults.map(r => r.metrics.executionTime).sort((a, b) => a - b);
    
    if (responseTimes.length === 0) {
      return {
        percentiles: { P50: 0, P90: 0, P95: 0, P99: 0 },
        distribution: [],
        outliers: 0,
        variability: 0
      };
    }
    
    // Calculate percentiles
    const percentiles = {
      P50: this.calculatePercentile(responseTimes, 50),
      P90: this.calculatePercentile(responseTimes, 90),
      P95: this.calculatePercentile(responseTimes, 95),
      P99: this.calculatePercentile(responseTimes, 99)
    };
    
    // Create distribution histogram (10 bins)
    const distribution = this.createHistogram(responseTimes, 10);
    
    // Count outliers (> 3 standard deviations from mean)
    const mean = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    const stdDev = Math.sqrt(
      responseTimes.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) / responseTimes.length
    );
    const outliers = responseTimes.filter(time => Math.abs(time - mean) > 3 * stdDev).length;
    
    // Calculate variability (coefficient of variation)
    const variability = stdDev / mean;
    
    return {
      percentiles,
      distribution,
      outliers,
      variability
    };
  }

  /**
   * Calculate algorithm-specific performance
   */
  private async calculateAlgorithmPerformance(loadTestResults: LoadTestResult[]): Promise<PerformanceBenchmarkReport['algorithmPerformance']> {
    console.log('🔍 Calculating algorithm-specific performance...');
    
    const successfulResults = loadTestResults.filter(r => r.success);
    
    if (successfulResults.length === 0) {
      const emptyMetrics = this.createEmptyMetrics();
      return {
        cooccurrence: emptyMetrics,
        temporal: emptyMetrics,
        developer: emptyMetrics,
        magnitude: emptyMetrics,
        insights: emptyMetrics
      };
    }
    
    // Calculate average metrics for each algorithm
    const cooccurrence = this.calculateAverageAlgorithmMetrics(
      successfulResults.map(r => ({
        executionTime: r.detectionResult.cooccurrenceTimeMs,
        patternsFound: r.detectionResult.cooccurrencePatterns.length
      }))
    );
    
    const temporal = this.calculateAverageAlgorithmMetrics(
      successfulResults.map(r => ({
        executionTime: r.detectionResult.temporalTimeMs,
        patternsFound: r.detectionResult.temporalPatterns.length
      }))
    );
    
    const developer = this.calculateAverageAlgorithmMetrics(
      successfulResults.map(r => ({
        executionTime: r.detectionResult.developerTimeMs,
        patternsFound: r.detectionResult.developerPatterns.length
      }))
    );
    
    const magnitude = this.calculateAverageAlgorithmMetrics(
      successfulResults.map(r => ({
        executionTime: r.detectionResult.magnitudeTimeMs,
        patternsFound: r.detectionResult.magnitudePatterns.length
      }))
    );
    
    const insights = this.calculateAverageAlgorithmMetrics(
      successfulResults.map(r => ({
        executionTime: r.detectionResult.insightsTimeMs,
        patternsFound: r.detectionResult.insights.length
      }))
    );
    
    return {
      cooccurrence,
      temporal,
      developer,
      magnitude,
      insights
    };
  }

  // ========================================================================================
  // UTILITY METHODS
  // ========================================================================================

  private getCurrentMemoryUsage() {
    return process.memoryUsage();
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private calculateLinearCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY.reduce((sum, val) => sum + val * val, 0) - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateOptimalBatchSize(results: LoadTestResult[]): number {
    // Find batch size with best throughput per time ratio
    let optimalSize = 100;
    let bestRatio = 0;
    
    for (const result of results) {
      const ratio = result.metrics.throughput / result.metrics.executionTime;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        optimalSize = result.commitCount;
      }
    }
    
    return optimalSize;
  }

  private calculatePercentile(sortedArray: number[], percentile: number): number {
    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    
    if (upper >= sortedArray.length) return sortedArray[sortedArray.length - 1];
    
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  private createHistogram(data: number[], bins: number): number[] {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binSize = (max - min) / bins;
    const histogram = new Array(bins).fill(0);
    
    data.forEach(value => {
      const bin = Math.min(Math.floor((value - min) / binSize), bins - 1);
      histogram[bin]++;
    });
    
    return histogram;
  }

  private calculateAverageAlgorithmMetrics(algorithmData: { executionTime: number; patternsFound: number }[]): PerformanceMetrics {
    if (algorithmData.length === 0) {
      return this.createEmptyMetrics();
    }
    
    const avgExecutionTime = algorithmData.reduce((sum, data) => sum + data.executionTime, 0) / algorithmData.length;
    const avgPatternsFound = algorithmData.reduce((sum, data) => sum + data.patternsFound, 0) / algorithmData.length;
    
    return {
      executionTime: avgExecutionTime,
      memoryUsage: {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0
      },
      cpuUsage: {
        user: 0,
        system: 0
      },
      patternsPerSecond: avgPatternsFound / (avgExecutionTime / 1000),
      throughput: avgPatternsFound / (avgExecutionTime / 1000),
      responseTime: avgExecutionTime
    };
  }

  private createEmptyMetrics(): PerformanceMetrics {
    return {
      executionTime: 0,
      memoryUsage: {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0
      },
      cpuUsage: {
        user: 0,
        system: 0
      },
      patternsPerSecond: 0,
      throughput: 0,
      responseTime: 0
    };
  }

  private createEmptyDetectionResult(): PatternDetectionResult {
    return {
      sessionId: '',
      projectId: '',
      detectionTimestamp: new Date(),
      executionTimeMs: 0,
      cooccurrenceTimeMs: 0,
      temporalTimeMs: 0,
      developerTimeMs: 0,
      magnitudeTimeMs: 0,
      insightsTimeMs: 0,
      cooccurrencePatterns: [],
      temporalPatterns: [],
      developerPatterns: [],
      magnitudePatterns: [],
      insights: [],
      commitsAnalyzed: 0,
      filesAnalyzed: 0,
      totalPatternsFound: 0,
      alertsGenerated: 0,
      success: false,
      errors: []
    };
  }

  private async getValidationProject(): Promise<string> {
    const query = `
      SELECT id FROM projects 
      WHERE name ILIKE '%aidis%' 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    const result = await db.query(query);
    
    if (result.rows.length === 0) {
      throw new Error('No AIDIS project found for validation');
    }
    
    return result.rows[0].id;
  }

  private async getTestCommits(count: number, offset: number = 0): Promise<string[]> {
    const query = `
      SELECT commit_sha 
      FROM git_commits 
      WHERE project_id = $1 
      ORDER BY author_date ASC
      LIMIT $2 OFFSET $3
    `;
    const result = await db.query(query, [this.projectId, count, offset]);
    return result.rows.map(row => row.commit_sha);
  }

  // ========================================================================================
  // RECOMMENDATION AND REPORTING
  // ========================================================================================

  private async generatePerformanceRecommendations(
    loadTestResults: LoadTestResult[],
    scalabilityAnalysis: PerformanceBenchmarkReport['scalabilityAnalysis'],
    memoryAnalysis: PerformanceBenchmarkReport['memoryAnalysis'],
    concurrencyResults: ConcurrencyTestResult[]
  ): Promise<PerformanceBenchmarkReport['performanceRecommendations']> {
    
    const recommendations: PerformanceBenchmarkReport['performanceRecommendations'] = [];
    
    // Check for sub-100ms target compliance
    const averageTime = loadTestResults
      .filter(r => r.success)
      .reduce((sum, r) => sum + r.metrics.executionTime, 0) / Math.max(loadTestResults.filter(r => r.success).length, 1);
    
    if (averageTime > this.PERFORMANCE_TARGETS.SUB_100MS_TARGET) {
      recommendations.push({
        priority: 'critical',
        issue: `Average execution time ${averageTime.toFixed(2)}ms exceeds 100ms target`,
        recommendation: 'Optimize algorithm performance or implement caching',
        estimatedImprovement: `${((averageTime - this.PERFORMANCE_TARGETS.SUB_100MS_TARGET) / averageTime * 100).toFixed(1)}% reduction needed`
      });
    }
    
    // Check scalability issues
    if (scalabilityAnalysis.linearScalingFactor < 0.8) {
      recommendations.push({
        priority: 'high',
        issue: `Poor linear scaling factor: ${scalabilityAnalysis.linearScalingFactor.toFixed(3)}`,
        recommendation: 'Implement better algorithm complexity or parallelization',
        estimatedImprovement: '2-3x performance improvement possible'
      });
    }
    
    if (scalabilityAnalysis.maxSupportedLoad < 1000) {
      recommendations.push({
        priority: 'high',
        issue: `Low maximum supported load: ${scalabilityAnalysis.maxSupportedLoad} commits`,
        recommendation: 'Implement batch processing and streaming algorithms',
        estimatedImprovement: '5-10x load capacity increase'
      });
    }
    
    // Check memory issues
    if (memoryAnalysis.memoryLeaksDetected) {
      recommendations.push({
        priority: 'critical',
        issue: 'Memory leaks detected in pattern detection',
        recommendation: 'Fix memory leaks and implement proper cleanup',
        estimatedImprovement: 'Stable memory usage'
      });
    }
    
    if (memoryAnalysis.gcPressure > 0.8) {
      recommendations.push({
        priority: 'medium',
        issue: `High GC pressure: ${(memoryAnalysis.gcPressure * 100).toFixed(1)}%`,
        recommendation: 'Optimize memory allocation and object creation',
        estimatedImprovement: '20-30% performance improvement'
      });
    }
    
    // Check concurrency issues
    const highErrorRateResults = concurrencyResults.filter(r => r.errorRate > this.PERFORMANCE_TARGETS.MAX_ERROR_RATE);
    if (highErrorRateResults.length > 0) {
      const maxErrorRate = Math.max(...highErrorRateResults.map(r => r.errorRate));
      recommendations.push({
        priority: 'high',
        issue: `High error rate under concurrency: ${(maxErrorRate * 100).toFixed(1)}%`,
        recommendation: 'Implement proper connection pooling and resource management',
        estimatedImprovement: 'Error rate < 5%'
      });
    }
    
    const resourceContentionResults = concurrencyResults.filter(r => r.resourceContention);
    if (resourceContentionResults.length > 0) {
      recommendations.push({
        priority: 'medium',
        issue: 'Resource contention detected under concurrent load',
        recommendation: 'Implement async processing and resource isolation',
        estimatedImprovement: 'Linear scaling with concurrent users'
      });
    }
    
    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  private determineBenchmarkStatus(
    performanceBaselines: PerformanceBenchmarkReport['performanceBaselines'],
    memoryAnalysis: PerformanceBenchmarkReport['memoryAnalysis'],
    concurrencyResults: ConcurrencyTestResult[],
    responseTimeAnalysis: PerformanceBenchmarkReport['responseTimeAnalysis']
  ): PerformanceBenchmarkReport['benchmarkStatus'] {
    
    let score = 0;
    let maxScore = 0;
    
    // Performance baseline score (25 points)
    maxScore += 25;
    if (!performanceBaselines.performanceRegression) {
      score += 25;
    } else if (performanceBaselines.currentBaseline < performanceBaselines.regressionThreshold * 1.2) {
      score += 15;
    } else if (performanceBaselines.currentBaseline < performanceBaselines.regressionThreshold * 1.5) {
      score += 5;
    }
    
    // Memory analysis score (25 points)
    maxScore += 25;
    if (!memoryAnalysis.memoryLeaksDetected && memoryAnalysis.gcPressure < 0.5) {
      score += 25;
    } else if (!memoryAnalysis.memoryLeaksDetected && memoryAnalysis.gcPressure < 0.8) {
      score += 15;
    } else if (!memoryAnalysis.memoryLeaksDetected) {
      score += 10;
    } else {
      score += 0; // Memory leaks are critical
    }
    
    // Concurrency score (25 points)
    maxScore += 25;
    const avgErrorRate = concurrencyResults.reduce((sum, r) => sum + r.errorRate, 0) / Math.max(concurrencyResults.length, 1);
    if (avgErrorRate <= this.PERFORMANCE_TARGETS.MAX_ERROR_RATE) {
      score += 25;
    } else if (avgErrorRate <= this.PERFORMANCE_TARGETS.MAX_ERROR_RATE * 2) {
      score += 15;
    } else if (avgErrorRate <= this.PERFORMANCE_TARGETS.MAX_ERROR_RATE * 4) {
      score += 5;
    }
    
    // Response time score (25 points)
    maxScore += 25;
    if (responseTimeAnalysis.percentiles.P95 <= this.PERFORMANCE_TARGETS.SUB_100MS_TARGET) {
      score += 25;
    } else if (responseTimeAnalysis.percentiles.P95 <= this.PERFORMANCE_TARGETS.SUB_100MS_TARGET * 1.5) {
      score += 15;
    } else if (responseTimeAnalysis.percentiles.P95 <= this.PERFORMANCE_TARGETS.SUB_100MS_TARGET * 2) {
      score += 10;
    } else if (responseTimeAnalysis.percentiles.P95 <= this.PERFORMANCE_TARGETS.SUB_100MS_TARGET * 3) {
      score += 5;
    }
    
    const percentageScore = (score / maxScore) * 100;
    
    if (percentageScore >= 90) return 'EXCELLENT';
    if (percentageScore >= 75) return 'GOOD';
    if (percentageScore >= 60) return 'ACCEPTABLE';
    if (percentageScore >= 40) return 'POOR';
    return 'FAILED';
  }

  private async savePerformanceReport(report: PerformanceBenchmarkReport): Promise<void> {
    const insertQuery = `
      INSERT INTO pattern_performance_reports (
        benchmark_id, project_id, benchmark_timestamp, test_configuration,
        load_test_results, scalability_analysis, performance_baselines,
        memory_analysis, concurrency_results, response_time_analysis,
        algorithm_performance, performance_recommendations, benchmark_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `;
    
    try {
      await db.query(insertQuery, [
        report.benchmarkId,
        report.projectId,
        report.benchmarkTimestamp,
        JSON.stringify(report.testConfiguration),
        JSON.stringify(report.loadTestResults),
        JSON.stringify(report.scalabilityAnalysis),
        JSON.stringify(report.performanceBaselines),
        JSON.stringify(report.memoryAnalysis),
        JSON.stringify(report.concurrencyResults),
        JSON.stringify(report.responseTimeAnalysis),
        JSON.stringify(report.algorithmPerformance),
        JSON.stringify(report.performanceRecommendations),
        report.benchmarkStatus
      ]);
      
      console.log(`💾 Performance report saved with ID: ${report.benchmarkId}`);
    } catch (error) {
      console.error('❌ Failed to save performance report:', error);
    }
  }

  private async printPerformanceSummary(report: PerformanceBenchmarkReport): Promise<void> {
    console.log('\n' + '='.repeat(80));
    console.log('⚡ TC019 PERFORMANCE BENCHMARKING REPORT');
    console.log('='.repeat(80));
    console.log(`📊 Benchmark ID: ${report.benchmarkId}`);
    console.log(`🕐 Benchmark Time: ${report.benchmarkTimestamp.toISOString()}`);
    console.log(`✅ Benchmark Status: ${report.benchmarkStatus}`);
    
    console.log('\n📈 LOAD TESTING RESULTS:');
    const successfulTests = report.loadTestResults.filter(r => r.success);
    console.log(`   Total Tests: ${report.loadTestResults.length} | Successful: ${successfulTests.length}`);
    if (successfulTests.length > 0) {
      const avgTime = successfulTests.reduce((sum, r) => sum + r.metrics.executionTime, 0) / successfulTests.length;
      const maxLoad = Math.max(...successfulTests.map(r => r.commitCount));
      console.log(`   Average Execution Time: ${avgTime.toFixed(2)}ms`);
      console.log(`   Maximum Load Tested: ${maxLoad} commits`);
      console.log(`   Sub-100ms Target: ${avgTime <= 100 ? '✅ PASS' : '❌ FAIL'}`);
    }
    
    console.log('\n📊 SCALABILITY ANALYSIS:');
    console.log(`   Linear Scaling Factor: ${report.scalabilityAnalysis.linearScalingFactor.toFixed(3)}`);
    console.log(`   Scalability Breakpoint: ${report.scalabilityAnalysis.scalabilityBreakpoint} commits`);
    console.log(`   Max Supported Load: ${report.scalabilityAnalysis.maxSupportedLoad} commits`);
    console.log(`   Optimal Batch Size: ${report.scalabilityAnalysis.optimalBatchSize} commits`);
    
    console.log('\n⚡ PERFORMANCE BASELINES:');
    console.log(`   TC011 Baseline: ${report.performanceBaselines.tc011Baseline}ms`);
    console.log(`   Current Baseline: ${report.performanceBaselines.currentBaseline.toFixed(2)}ms`);
    console.log(`   Performance Regression: ${report.performanceBaselines.performanceRegression ? '⚠️  YES' : '✅ NO'}`);
    
    console.log('\n💾 MEMORY ANALYSIS:');
    console.log(`   Peak Memory: ${(report.memoryAnalysis.peakMemory / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Memory Leaks: ${report.memoryAnalysis.memoryLeaksDetected ? '⚠️  DETECTED' : '✅ NONE'}`);
    console.log(`   GC Pressure: ${(report.memoryAnalysis.gcPressure * 100).toFixed(1)}%`);
    
    console.log('\n🔄 CONCURRENCY TESTING:');
    if (report.concurrencyResults.length > 0) {
      const maxConcurrency = Math.max(...report.concurrencyResults.map(r => r.concurrentUsers));
      const avgErrorRate = report.concurrencyResults.reduce((sum, r) => sum + r.errorRate, 0) / report.concurrencyResults.length;
      console.log(`   Max Concurrent Users: ${maxConcurrency}`);
      console.log(`   Average Error Rate: ${(avgErrorRate * 100).toFixed(2)}%`);
      console.log(`   Resource Contention: ${report.concurrencyResults.some(r => r.resourceContention) ? '⚠️  DETECTED' : '✅ NONE'}`);
    }
    
    console.log('\n⏱️  RESPONSE TIME ANALYSIS:');
    console.log(`   P50: ${report.responseTimeAnalysis.percentiles.P50.toFixed(2)}ms`);
    console.log(`   P95: ${report.responseTimeAnalysis.percentiles.P95.toFixed(2)}ms`);
    console.log(`   P99: ${report.responseTimeAnalysis.percentiles.P99.toFixed(2)}ms`);
    console.log(`   Outliers: ${report.responseTimeAnalysis.outliers}`);
    
    if (report.performanceRecommendations.length > 0) {
      console.log('\n💡 TOP PERFORMANCE RECOMMENDATIONS:');
      report.performanceRecommendations.slice(0, 3).forEach((rec, i) => {
        console.log(`   ${i + 1}. [${rec.priority.toUpperCase()}] ${rec.recommendation}`);
      });
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`🎉 PERFORMANCE BENCHMARKING COMPLETED - STATUS: ${report.benchmarkStatus}`);
    console.log('='.repeat(80));
  }
}

// ========================================================================================
// MAIN EXECUTION
// ========================================================================================

export async function runTC019PerformanceBenchmarks(config?: Partial<LoadTestConfig>): Promise<PerformanceBenchmarkReport> {
  const benchmarks = new TC019PerformanceBenchmarks();
  return await benchmarks.runPerformanceBenchmarks(config);
}

// Export for external use
export default TC019PerformanceBenchmarks;

// CLI execution
if (require.main === module) {
  console.log('🚀 Starting TC019 Performance Benchmarking Framework...');
  
  runTC019PerformanceBenchmarks()
    .then((report) => {
      console.log(`\n✅ Performance benchmarking completed with status: ${report.benchmarkStatus}`);
      process.exit(report.benchmarkStatus === 'FAILED' ? 1 : 0);
    })
    .catch((error) => {
      console.error('❌ Performance benchmarking failed:', error);
      process.exit(1);
    });
}