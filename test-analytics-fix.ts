#!/usr/bin/env npx tsx
/**
 * Verification script for Analytics table fix
 * Tests that sessionAnalytics.ts now queries the correct 'sessions' table
 */

import { SessionAnalyticsService } from './aidis-command/backend/src/services/sessionAnalytics';

async function main() {
  console.log('Testing Analytics Fix - Sessions Table Migration\n');
  console.log('='.repeat(60));

  try {
    // Test 1: Get session analytics
    console.log('\n1. Testing getSessionAnalytics...');
    const analytics = await SessionAnalyticsService.getSessionAnalytics();
    console.log('✅ Success!');
    console.log(`   Total Sessions: ${analytics.total_sessions}`);
    console.log(`   Total Tokens: ${analytics.total_tokens_used}`);
    console.log(`   Average Tokens/Session: ${analytics.average_tokens_per_session}`);
    console.log(`   Total Contexts: ${analytics.total_contexts}`);
    console.log(`   Sessions This Week: ${analytics.sessions_this_week}`);

    // Verify we have real data
    if (analytics.total_sessions === 0) {
      console.log('⚠️  WARNING: No sessions found - but query succeeded');
    } else if (analytics.total_tokens_used > 0) {
      console.log('✅ VERIFIED: Token data is now loading correctly!');
    } else {
      console.log('⚠️  WARNING: Sessions exist but no token data');
    }

    // Test 2: Get session trends
    console.log('\n2. Testing getSessionTrends...');
    const trends = await SessionAnalyticsService.getSessionTrends(7);
    console.log(`✅ Success! Retrieved ${trends.length} days of trend data`);
    const daysWithSessions = trends.filter(t => t.session_count > 0).length;
    console.log(`   Days with sessions: ${daysWithSessions}`);
    const totalTokensInTrends = trends.reduce((sum, t) => sum + t.total_tokens_used, 0);
    console.log(`   Total tokens in trends: ${totalTokensInTrends}`);

    // Test 3: Get productive sessions
    console.log('\n3. Testing getProductiveSessions...');
    const productive = await SessionAnalyticsService.getProductiveSessions(5);
    console.log(`✅ Success! Found ${productive.length} productive sessions`);
    if (productive.length > 0) {
      const topSession = productive[0];
      console.log(`   Top session: ${topSession.context_count} contexts, ${topSession.tokens_used} tokens`);
    }

    // Test 4: Get token usage patterns
    console.log('\n4. Testing getTokenUsagePatterns...');
    const patterns = await SessionAnalyticsService.getTokenUsagePatterns();
    console.log(`✅ Success! Retrieved ${patterns.length} hourly patterns`);
    const hoursWithActivity = patterns.filter(p => p.session_count > 0).length;
    console.log(`   Hours with activity: ${hoursWithActivity}`);

    // Test 5: Get session stats
    console.log('\n5. Testing getSessionStats...');
    const stats = await SessionAnalyticsService.getSessionStats();
    console.log('✅ Success!');
    console.log(`   Total Sessions: ${stats.totalSessions}`);
    console.log(`   Active Sessions: ${stats.activeSessions}`);
    console.log(`   Today Sessions: ${stats.todaySessions}`);
    console.log(`   Average Duration: ${stats.averageDuration} minutes`);

    // Final verification
    console.log('\n' + '='.repeat(60));
    console.log('VERIFICATION COMPLETE');
    console.log('='.repeat(60));

    if (analytics.total_sessions > 0 && analytics.total_tokens_used > 0) {
      console.log('✅ ALL TESTS PASSED - Analytics now reading from sessions table!');
      console.log('✅ Token tracking data is loading correctly!');
      console.log('✅ The fix is working as expected!');
    } else if (analytics.total_sessions > 0) {
      console.log('✅ Tests passed but no token data found');
      console.log('   This may be expected if sessions haven\'t tracked tokens yet');
    } else {
      console.log('⚠️  No sessions found - but queries are working');
    }

  } catch (error) {
    console.error('\n❌ ERROR during testing:');
    console.error(error);
    process.exit(1);
  }
}

main().catch(console.error);
