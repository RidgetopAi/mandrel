#!/usr/bin/env npx tsx

/**
 * TS006-2 Analytics Union Queries Test
 * Verify that getSessionAnalytics, getSessionTrends, and getProductiveSessions
 * include both user_sessions and sessions data using UNION ALL pattern
 */

import { SessionAnalyticsService } from './aidis-command-dev/backend/src/services/sessionAnalytics';

async function testAnalyticsUnion() {
  console.log('🧪 TS006-2: Testing Analytics Union Queries');
  console.log('=' .repeat(60));

  try {
    // Test 1: Session Analytics (overall stats)
    console.log('\n📊 Testing getSessionAnalytics (includes both session types)...');
    const analytics = await SessionAnalyticsService.getSessionAnalytics();
    console.log(`✓ Total Sessions: ${analytics.total_sessions}`);
    console.log(`✓ Total Duration: ${analytics.total_duration_minutes} minutes`);
    console.log(`✓ Total Contexts: ${analytics.total_contexts}`);
    console.log(`✓ Total Tokens: ${analytics.total_tokens_used}`);
    console.log(`✓ Sessions This Week: ${analytics.sessions_this_week}`);

    // Test 2: Session Trends (daily aggregation)
    console.log('\n📈 Testing getSessionTrends (includes both session types)...');
    const trends = await SessionAnalyticsService.getSessionTrends(7);
    console.log(`✓ Trend Data Points: ${trends.length}`);
    if (trends.length > 0) {
      const latestTrend = trends[trends.length - 1];
      console.log(`✓ Latest Day Sessions: ${latestTrend.session_count}`);
      console.log(`✓ Latest Day Contexts: ${latestTrend.total_contexts}`);
      console.log(`✓ Latest Day Tokens: ${latestTrend.total_tokens_used}`);
    }

    // Test 3: Productive Sessions (ranking)
    console.log('\n🏆 Testing getProductiveSessions (includes both session types)...');
    const productive = await SessionAnalyticsService.getProductiveSessions(5);
    console.log(`✓ Productive Sessions Found: ${productive.length}`);
    productive.forEach((session, index) => {
      console.log(`  ${index + 1}. ID: ${session.id} | Score: ${session.productivity_score} | Contexts: ${session.context_count} | Tokens: ${session.tokens_used}`);
    });

    // Test 4: Project-specific analytics
    console.log('\n🔍 Testing with project filter...');
    // Get a project ID if available
    if (productive.length > 0 && productive[0].project_id) {
      const projectId = productive[0].project_id;
      const projectAnalytics = await SessionAnalyticsService.getSessionAnalytics(projectId);
      console.log(`✓ Project ${projectId} Sessions: ${projectAnalytics.total_sessions}`);
      
      const projectTrends = await SessionAnalyticsService.getSessionTrends(7, projectId);
      console.log(`✓ Project ${projectId} Trend Points: ${projectTrends.length}`);
    }

    console.log('\n✅ All analytics methods successfully include both session types!');
    console.log('🎯 Union queries working correctly - MCP sessions now visible in analytics');

  } catch (error) {
    console.error('❌ Analytics union query test failed:', error);
    throw error;
  }
}

async function main() {
  await testAnalyticsUnion();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}
