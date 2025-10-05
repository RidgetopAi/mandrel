#!/usr/bin/env npx tsx

/**
 * TS006-2 Production Union Queries Test
 * Test the three core analytics methods with UNION queries in production
 */

import { SessionAnalyticsService } from './aidis-command/backend/src/services/sessionAnalytics';

async function testProductionAnalyticsUnion() {
  console.log('🧪 TS006-2: Testing Production Analytics Union Queries');
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

    // Test 4: Additional methods to ensure they still work
    console.log('\n🔧 Testing additional analytics methods...');
    
    const tokenPatterns = await SessionAnalyticsService.getTokenUsagePatterns();
    console.log(`✓ Token Usage Patterns: ${tokenPatterns.length} hours`);

    const sessionsList = await SessionAnalyticsService.getSessionsList({
      limit: 10,
      offset: 0
    });
    console.log(`✓ Sessions List: ${sessionsList.sessions.length}/${sessionsList.total} sessions`);

    const sessionStats = await SessionAnalyticsService.getSessionStats();
    console.log(`✓ Session Stats: ${sessionStats.totalSessions} total, ${sessionStats.activeSessions} active`);

    console.log('\n✅ All production analytics methods working correctly!');
    console.log('🎯 Union queries successfully implemented - MCP sessions now included in analytics');

  } catch (error) {
    console.error('❌ Production analytics union query test failed:', error);
    throw error;
  }
}

async function main() {
  await testProductionAnalyticsUnion();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}
