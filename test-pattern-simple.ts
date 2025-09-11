#!/usr/bin/env tsx

/**
 * Simple Pattern Detection Test
 * 
 * Quick validation of core pattern detection functionality
 */

import { PatternDetectionHandler } from './mcp-server/src/handlers/patternDetection.js';

async function simpleTest() {
  console.log('🔍 Simple Pattern Detection Test');
  
  try {
    // Test 1: Start service
    console.log('\n1. Starting pattern detection service...');
    const startResult = await PatternDetectionHandler.startPatternDetection({});
    console.log(`✅ Service start: ${startResult.success ? 'SUCCESS' : 'FAILED'}`);
    if (!startResult.success) console.log(`   Error: ${startResult.error}`);
    
    // Test 2: Check status
    console.log('\n2. Checking service status...');
    const statusResult = await PatternDetectionHandler.getPatternDetectionStatus();
    console.log(`✅ Status check: ${statusResult.success ? 'SUCCESS' : 'FAILED'}`);
    if (statusResult.success) {
      console.log(`   Active: ${statusResult.isActive}`);
      console.log(`   Metrics: ${JSON.stringify(statusResult.metrics, null, 2)}`);
    }
    
    // Test 3: Get session insights
    console.log('\n3. Getting session insights...');
    const insightsResult = await PatternDetectionHandler.getSessionPatternInsights({});
    console.log(`✅ Session insights: ${insightsResult.success ? 'SUCCESS' : 'FAILED'}`);
    if (insightsResult.success) {
      console.log(`   Total insights: ${insightsResult.totalInsights}`);
      console.log(`   Critical: ${insightsResult.criticalInsights}`);
    } else {
      console.log(`   Error: ${insightsResult.error}`);
    }
    
    // Test 4: Get project analysis
    console.log('\n4. Getting project analysis...');
    const analysisResult = await PatternDetectionHandler.analyzeProjectPatterns({});
    console.log(`✅ Project analysis: ${analysisResult.success ? 'SUCCESS' : 'FAILED'}`);
    if (analysisResult.success) {
      console.log(`   Analysis: ${JSON.stringify(analysisResult.analysis, null, 2)}`);
    }
    
    // Test 5: Get alerts
    console.log('\n5. Getting pattern alerts...');
    const alertsResult = await PatternDetectionHandler.getPatternAlerts({});
    console.log(`✅ Pattern alerts: ${alertsResult.success ? 'SUCCESS' : 'FAILED'}`);
    if (alertsResult.success) {
      console.log(`   Total alerts: ${alertsResult.totalAlerts}`);
      console.log(`   Critical: ${alertsResult.criticalAlerts}`);
    }
    
    // Test 6: Stop service
    console.log('\n6. Stopping pattern detection service...');
    const stopResult = await PatternDetectionHandler.stopPatternDetection();
    console.log(`✅ Service stop: ${stopResult.success ? 'SUCCESS' : 'FAILED'}`);
    
    console.log('\n🎉 Pattern Detection System Test Complete!');
    console.log('\n📊 SUMMARY:');
    console.log(`   Start Service: ${startResult.success ? '✅' : '❌'}`);
    console.log(`   Status Check: ${statusResult.success ? '✅' : '❌'}`);
    console.log(`   Session Insights: ${insightsResult.success ? '✅' : '❌'}`);
    console.log(`   Project Analysis: ${analysisResult.success ? '✅' : '❌'}`);
    console.log(`   Pattern Alerts: ${alertsResult.success ? '✅' : '❌'}`);
    console.log(`   Stop Service: ${stopResult.success ? '✅' : '❌'}`);
    
    const allSuccess = [
      startResult.success,
      statusResult.success, 
      insightsResult.success,
      analysisResult.success,
      alertsResult.success,
      stopResult.success
    ].every(s => s === true);
    
    console.log(`\n🎯 Overall Result: ${allSuccess ? '✅ ALL PASSED' : '❌ SOME FAILED'}`);
    
    return allSuccess;
    
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    return false;
  }
}

simpleTest().then(success => {
  process.exit(success ? 0 : 1);
});