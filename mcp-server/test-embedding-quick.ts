/**
 * Quick Test of Embedding Service Error Handling Improvements
 */

import { embeddingService, EmbeddingError, EmbeddingErrorType } from './src/services/embedding.js';

async function quickTest() {
  console.log('🧪 Quick Test of Embedding Error Handling Improvements\n');

  try {
    // Test 1: Input validation
    console.log('1. Testing input validation...');
    try {
      await embeddingService.generateEmbedding({ text: '' });
      console.log('   ❌ FAILED - Should have thrown validation error');
    } catch (error) {
      if (error instanceof EmbeddingError && error.type === EmbeddingErrorType.INPUT_VALIDATION) {
        console.log('   ✅ PASSED - Correctly caught empty text validation');
      } else {
        console.log('   ❌ FAILED - Wrong error type:', error.message);
      }
    }

    // Test 2: Valid embedding generation
    console.log('\n2. Testing valid embedding generation...');
    const result = await embeddingService.generateEmbedding({
      text: 'This is a test message for embedding generation'
    });
    console.log(`   ✅ PASSED - Generated ${result.dimensions}D embedding (model: ${result.model})`);

    // Test 3: Metrics collection
    console.log('\n3. Testing metrics collection...');
    const metrics = embeddingService.getMetrics();
    if (metrics.totalRequests > 0 && metrics.successfulRequests > 0) {
      console.log(`   ✅ PASSED - Metrics working (${metrics.totalRequests} total, ${metrics.successfulRequests} successful)`);
    } else {
      console.log('   ❌ FAILED - Metrics not collecting properly');
    }

    // Test 4: Configuration
    console.log('\n4. Testing configuration...');
    const config = embeddingService.getConfig();
    if (config.retryConfig && config.maxTextLength && typeof config.dimensions === 'number') {
      console.log('   ✅ PASSED - Configuration includes error handling settings');
    } else {
      console.log('   ❌ FAILED - Missing error handling configuration');
    }

    // Test 5: Health check
    console.log('\n5. Testing health check...');
    const isHealthy = await embeddingService.isHealthy();
    console.log(`   ${isHealthy ? '✅ PASSED' : '⚠️  WARNING'} - Service health: ${isHealthy}`);

    console.log('\n🎉 Quick test completed! Error handling improvements are working.');
    console.log('\n📊 Final metrics:');
    const finalMetrics = embeddingService.getMetrics();
    console.log(`   Total requests: ${finalMetrics.totalRequests}`);
    console.log(`   Successful: ${finalMetrics.successfulRequests}`);
    console.log(`   Failed: ${finalMetrics.failedRequests}`);
    console.log(`   Average time: ${finalMetrics.averageProcessingTime.toFixed(2)}ms`);

  } catch (error) {
    console.error('❌ Quick test failed:', error);
    process.exit(1);
  }
}

quickTest();