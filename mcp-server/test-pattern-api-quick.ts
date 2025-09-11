#!/usr/bin/env npx tsx

import { patternAnalysisHandlers } from './src/handlers/patternAnalysis.js';

async function testPatternAnalysisAPI() {
  console.log('🔍 Testing Pattern Analysis API Endpoints...');

  // Test basic pattern discovery
  console.log('\n1. Testing pattern_get_discovered...');
  try {
    const result = await patternAnalysisHandlers.pattern_get_discovered({
      projectId: '4afb236c-00d7-433d-87de-0f489b96acb2',
      limit: 5
    });
    
    console.log('✅ Result:', result.success ? 'SUCCESS' : 'FAILED');
    if (result.success) {
      console.log('   Total patterns:', result.patterns.totalPatterns);
      console.log('   Execution time:', result.executionTimeMs + 'ms');
    } else {
      console.log('   Error:', result.error);
    }
  } catch (error: any) {
    console.log('❌ Exception:', error.message);
  }

  // Test pattern performance monitoring
  console.log('\n2. Testing pattern_get_performance...');
  try {
    const result = await patternAnalysisHandlers.pattern_get_performance({
      projectId: '4afb236c-00d7-433d-87de-0f489b96acb2',
      includeOptimizationSuggestions: true
    });
    
    console.log('✅ Result:', result.success ? 'SUCCESS' : 'FAILED');
    if (result.success) {
      console.log('   Total detections:', result.performance.systemMetrics.totalDetections);
      console.log('   Suggestions:', result.suggestions.length);
      console.log('   Execution time:', result.executionTimeMs + 'ms');
    } else {
      console.log('   Error:', result.error);
    }
  } catch (error: any) {
    console.log('❌ Exception:', error.message);
  }

  // Test pattern recommendations
  console.log('\n3. Testing pattern_get_recommendations...');
  try {
    const result = await patternAnalysisHandlers.pattern_get_recommendations({
      projectId: '4afb236c-00d7-433d-87de-0f489b96acb2',
      limit: 3
    });
    
    console.log('✅ Result:', result.success ? 'SUCCESS' : 'FAILED');
    if (result.success) {
      console.log('   Total recommendations:', result.totalRecommendations);
      console.log('   High impact recommendations:', result.highImpactRecommendations);
      console.log('   Execution time:', result.executionTimeMs + 'ms');
    } else {
      console.log('   Error:', result.error);
    }
  } catch (error: any) {
    console.log('❌ Exception:', error.message);
  }

  console.log('\n🎉 Pattern Analysis API Test Complete!');
}

testPatternAnalysisAPI().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});