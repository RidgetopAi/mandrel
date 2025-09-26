/**
 * Comprehensive Test Suite for AIDIS Embedding Service Error Handling
 *
 * This test suite validates all the error handling improvements:
 * - Input validation
 * - Retry logic with exponential backoff
 * - Proper error propagation
 * - Health checks and monitoring
 * - Performance metrics
 */

import { embeddingService, EmbeddingError, EmbeddingErrorType } from './src/services/embedding.js';

interface TestResult {
  testName: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

class EmbeddingErrorHandlingTests {
  private results: TestResult[] = [];

  /**
   * Run all error handling tests
   */
  async runAllTests(): Promise<void> {
    console.log('🧪 Starting Comprehensive Embedding Error Handling Tests\n');
    console.log('=' .repeat(70));

    // Reset metrics before testing
    embeddingService.resetMetrics();

    // Test categories
    await this.testInputValidation();
    await this.testRetryLogic();
    await this.testErrorPropagation();
    await this.testHealthChecks();
    await this.testMonitoring();
    await this.testPerformanceMetrics();
    await this.testEdgeCases();

    // Display results
    this.displayResults();
  }

  /**
   * Test input validation scenarios
   */
  private async testInputValidation(): Promise<void> {
    console.log('\n📝 Testing Input Validation...\n');

    // Test empty text
    await this.runTest('Empty text validation', async () => {
      try {
        await embeddingService.generateEmbedding({ text: '' });
        throw new Error('Should have thrown validation error');
      } catch (error) {
        if (error instanceof EmbeddingError && error.type === EmbeddingErrorType.INPUT_VALIDATION) {
          return true;
        }
        throw error;
      }
    });

    // Test null/undefined text
    await this.runTest('Null text validation', async () => {
      try {
        await embeddingService.generateEmbedding({ text: null as any });
        throw new Error('Should have thrown validation error');
      } catch (error) {
        if (error instanceof EmbeddingError && error.type === EmbeddingErrorType.INPUT_VALIDATION) {
          return true;
        }
        throw error;
      }
    });

    // Test whitespace-only text
    await this.runTest('Whitespace text validation', async () => {
      try {
        await embeddingService.generateEmbedding({ text: '   \n\t   ' });
        throw new Error('Should have thrown validation error');
      } catch (error) {
        if (error instanceof EmbeddingError && error.type === EmbeddingErrorType.INPUT_VALIDATION) {
          return true;
        }
        throw error;
      }
    });

    // Test overly long text
    await this.runTest('Long text validation', async () => {
      const longText = 'a'.repeat(10000); // Assuming max is 8000
      try {
        await embeddingService.generateEmbedding({ text: longText });
        throw new Error('Should have thrown validation error for long text');
      } catch (error) {
        if (error instanceof EmbeddingError && error.type === EmbeddingErrorType.INPUT_VALIDATION) {
          return true;
        }
        throw error;
      }
    });

    // Test text with control characters
    await this.runTest('Control characters validation', async () => {
      const textWithControlChars = 'Hello\x00World\x07Test';
      try {
        await embeddingService.generateEmbedding({ text: textWithControlChars });
        throw new Error('Should have thrown validation error for control characters');
      } catch (error) {
        if (error instanceof EmbeddingError && error.type === EmbeddingErrorType.INPUT_VALIDATION) {
          return true;
        }
        throw error;
      }
    });

    // Test valid input (should succeed)
    await this.runTest('Valid input processing', async () => {
      const result = await embeddingService.generateEmbedding({
        text: 'This is a valid test message for embedding generation.'
      });

      return result &&
             Array.isArray(result.embedding) &&
             result.embedding.length > 0 &&
             typeof result.dimensions === 'number';
    });
  }

  /**
   * Test health check functionality
   */
  private async testHealthChecks(): Promise<void> {
    console.log('\n🏥 Testing Health Checks...\n');

    await this.runTest('Basic health check', async () => {
      const isHealthy = await embeddingService.isHealthy();
      return typeof isHealthy === 'boolean';
    });

    await this.runTest('Detailed health status', async () => {
      const status = await embeddingService.getHealthStatus();

      return status &&
             typeof status.healthy === 'boolean' &&
             typeof status.localModelReady === 'boolean' &&
             typeof status.openAiAvailable === 'boolean' &&
             status.metrics;
    });

    await this.runTest('Service status', async () => {
      const status = await embeddingService.getStatus();

      return status &&
             status.config &&
             status.health &&
             status.metrics &&
             status.runtime &&
             typeof status.runtime.uptime === 'number';
    });
  }

  /**
   * Test monitoring and metrics collection
   */
  private async testMonitoring(): Promise<void> {
    console.log('\n📊 Testing Monitoring and Metrics...\n');

    // Reset metrics first
    embeddingService.resetMetrics();

    await this.runTest('Initial metrics state', async () => {
      const metrics = embeddingService.getMetrics();
      return metrics.totalRequests === 0 &&
             metrics.successfulRequests === 0 &&
             metrics.failedRequests === 0;
    });

    await this.runTest('Metrics update on success', async () => {
      const initialMetrics = embeddingService.getMetrics();

      await embeddingService.generateEmbedding({ text: 'Test for metrics' });

      const updatedMetrics = embeddingService.getMetrics();
      return updatedMetrics.totalRequests === initialMetrics.totalRequests + 1 &&
             updatedMetrics.successfulRequests === initialMetrics.successfulRequests + 1;
    });

    await this.runTest('Metrics update on failure', async () => {
      const initialMetrics = embeddingService.getMetrics();

      try {
        await embeddingService.generateEmbedding({ text: '' }); // This should fail
      } catch (error) {
        // Expected to fail
      }

      const updatedMetrics = embeddingService.getMetrics();
      return updatedMetrics.totalRequests === initialMetrics.totalRequests + 1 &&
             updatedMetrics.failedRequests === initialMetrics.failedRequests + 1;
    });

    await this.runTest('Performance timing', async () => {
      const startTime = Date.now();
      await embeddingService.generateEmbedding({ text: 'Performance test' });
      const endTime = Date.now();

      const metrics = embeddingService.getMetrics();

      // Check that average processing time is reasonable
      return metrics.averageProcessingTime > 0 &&
             metrics.averageProcessingTime < (endTime - startTime + 1000); // Add buffer for test overhead
    });
  }

  /**
   * Test performance metrics accuracy
   */
  private async testPerformanceMetrics(): Promise<void> {
    console.log('\n⏱️ Testing Performance Metrics...\n');

    embeddingService.resetMetrics();

    await this.runTest('Processing time tracking', async () => {
      const testTexts = [
        'Short text',
        'This is a medium length text for testing embedding generation',
        'This is a longer text that should take more time to process and generate embeddings for semantic search functionality'
      ];

      for (const text of testTexts) {
        await embeddingService.generateEmbedding({ text });
      }

      const metrics = embeddingService.getMetrics();

      return metrics.totalRequests === 3 &&
             metrics.successfulRequests === 3 &&
             metrics.totalProcessingTime > 0 &&
             metrics.averageProcessingTime === metrics.totalProcessingTime / metrics.successfulRequests;
    });

    await this.runTest('Model usage tracking', async () => {
      const initialMetrics = embeddingService.getMetrics();

      // Force local model usage
      await embeddingService.generateEmbedding({ text: 'Test local model tracking' });

      const updatedMetrics = embeddingService.getMetrics();

      // Should have incremented either local or OpenAI success counter
      return (updatedMetrics.localModelSuccesses > initialMetrics.localModelSuccesses) ||
             (updatedMetrics.openAiSuccesses > initialMetrics.openAiSuccesses);
    });
  }

  /**
   * Test retry logic (simulated with controlled failures)
   */
  private async testRetryLogic(): Promise<void> {
    console.log('\n🔄 Testing Retry Logic...\n');

    // Note: This test is limited since we can't easily simulate transient failures
    // In a real scenario, you'd want to use dependency injection to mock the underlying services

    await this.runTest('Error categorization', async () => {
      try {
        await embeddingService.generateEmbedding({ text: '' });
        return false; // Should have thrown
      } catch (error) {
        return error instanceof EmbeddingError &&
               error.type === EmbeddingErrorType.INPUT_VALIDATION &&
               error.isRetryable === false; // Input validation errors are not retryable
      }
    });

    await this.runTest('Retry configuration', async () => {
      const config = embeddingService.getConfig();
      return config.retryConfig &&
             typeof config.retryConfig.maxRetries === 'number' &&
             typeof config.retryConfig.baseDelay === 'number' &&
             typeof config.retryConfig.backoffMultiplier === 'number';
    });
  }

  /**
   * Test error propagation
   */
  private async testErrorPropagation(): Promise<void> {
    console.log('\n🚨 Testing Error Propagation...\n');

    await this.runTest('EmbeddingError propagation', async () => {
      try {
        await embeddingService.generateEmbedding({ text: '' });
        return false;
      } catch (error) {
        return error instanceof EmbeddingError &&
               error.message.includes('empty') &&
               error.type === EmbeddingErrorType.INPUT_VALIDATION;
      }
    });

    await this.runTest('Similarity calculation errors', async () => {
      try {
        embeddingService.calculateCosineSimilarity([1, 2, 3], [1, 2]); // Different lengths
        return false;
      } catch (error) {
        return error instanceof EmbeddingError &&
               error.type === EmbeddingErrorType.INPUT_VALIDATION &&
               error.message.includes('same dimensions');
      }
    });

    await this.runTest('Invalid embedding validation', async () => {
      const isValid = embeddingService.validateEmbedding([1, 2, NaN, 4]);
      return !isValid; // Should fail validation
    });
  }

  /**
   * Test edge cases
   */
  private async testEdgeCases(): Promise<void> {
    console.log('\n🔍 Testing Edge Cases...\n');

    await this.runTest('Very short valid text', async () => {
      const result = await embeddingService.generateEmbedding({ text: 'Hi' });
      return result && result.embedding && result.embedding.length > 0;
    });

    await this.runTest('Special characters handling', async () => {
      const result = await embeddingService.generateEmbedding({
        text: 'Special chars: áéíóú ñüß €£¥ 中文 русский العربية'
      });
      return result && result.embedding && result.embedding.length > 0;
    });

    await this.runTest('Numeric text handling', async () => {
      const result = await embeddingService.generateEmbedding({
        text: '12345 67890 3.14159 -42 1e6'
      });
      return result && result.embedding && result.embedding.length > 0;
    });

    await this.runTest('Mixed content handling', async () => {
      const result = await embeddingService.generateEmbedding({
        text: 'Code: function test() { return 42; } // This is a test'
      });
      return result && result.embedding && result.embedding.length > 0;
    });

    await this.runTest('Similarity calculation with zero vectors', async () => {
      const zeroVector = new Array(100).fill(0);
      const normalVector = new Array(100).fill(0.1);

      const similarity = embeddingService.calculateCosineSimilarity(zeroVector, normalVector);
      return similarity === 0; // Zero vector should return 0 similarity
    });

    await this.runTest('Embedding validation edge cases', async () => {
      const dimensions = embeddingService.getConfig().dimensions;

      // Test various invalid embeddings
      const tests = [
        { embedding: [], expected: false }, // Empty
        { embedding: new Array(dimensions).fill(0), expected: true }, // All zeros (valid)
        { embedding: new Array(dimensions).fill(1.5), expected: false }, // Out of range
        { embedding: new Array(dimensions - 1).fill(0.5), expected: false }, // Wrong size
        { embedding: new Array(dimensions).fill(0.5), expected: true }, // Valid
      ];

      return tests.every(test =>
        embeddingService.validateEmbedding(test.embedding) === test.expected
      );
    });
  }

  /**
   * Helper method to run individual tests
   */
  private async runTest(testName: string, testFn: () => Promise<boolean>): Promise<void> {
    const startTime = Date.now();

    try {
      console.log(`🔬 ${testName}...`);
      const result = await testFn();
      const duration = Date.now() - startTime;

      this.results.push({
        testName,
        passed: result,
        duration
      });

      if (result) {
        console.log(`   ✅ PASSED (${duration}ms)`);
      } else {
        console.log(`   ❌ FAILED (${duration}ms) - Test returned false`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;

      this.results.push({
        testName,
        passed: false,
        error: error.message,
        duration
      });

      console.log(`   ❌ FAILED (${duration}ms) - ${error.message}`);
    }
  }

  /**
   * Display final test results
   */
  private displayResults(): void {
    console.log('\n' + '='.repeat(70));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(70));

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;

    console.log(`\n📈 Overall: ${passed}/${total} tests passed (${failed} failed)`);
    console.log(`📊 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

    const totalDuration = this.results.reduce((sum, r) => sum + (r.duration || 0), 0);
    console.log(`⏱️  Total Duration: ${totalDuration}ms`);

    if (failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.results.filter(r => !r.passed).forEach(result => {
        console.log(`   - ${result.testName}: ${result.error || 'Test returned false'}`);
      });
    }

    // Display final metrics
    console.log('\n📊 Final Service Metrics:');
    const metrics = embeddingService.getMetrics();
    console.log(`   Total Requests: ${metrics.totalRequests}`);
    console.log(`   Successful: ${metrics.successfulRequests}`);
    console.log(`   Failed: ${metrics.failedRequests}`);
    console.log(`   Avg Processing Time: ${metrics.averageProcessingTime.toFixed(2)}ms`);
    console.log(`   Local Model Successes: ${metrics.localModelSuccesses}`);
    console.log(`   OpenAI Successes: ${metrics.openAiSuccesses}`);
    console.log(`   Mock Fallbacks: ${metrics.mockFallbacks}`);

    if (failed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Embedding service error handling is robust.');
    } else {
      console.log(`\n⚠️  ${failed} test(s) failed. Review and fix before deployment.`);
      process.exit(1);
    }
  }
}

// Run the tests
async function main() {
  const tester = new EmbeddingErrorHandlingTests();
  await tester.runAllTests();
}

main().catch(error => {
  console.error('💥 Test suite crashed:', error);
  process.exit(1);
});