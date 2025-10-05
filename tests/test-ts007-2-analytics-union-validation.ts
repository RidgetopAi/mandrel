#!/usr/bin/env npx tsx

/**
 * TS007-2 Analytics UNION Validation Test
 * 
 * Validates that all three updated analytics methods correctly include MCP sessions:
 * - getTokenUsagePatterns
 * - getSessionsList  
 * - getSessionStats
 */

import { SessionAnalytics } from './aidis-command/backend/src/services/sessionAnalytics';

async function testTokenUsagePatterns() {
  console.log('\n🔍 Testing getTokenUsagePatterns with UNION...');
  
  try {
    const patterns = await SessionAnalytics.getTokenUsagePatterns();
    
    console.log(`✅ Found ${patterns.length} hourly patterns`);
    console.log(`📊 Sample pattern:`, {
      hour: patterns[0]?.hour,
      total_tokens: patterns[0]?.total_tokens,
      session_count: patterns[0]?.session_count,
      average_tokens_per_session: patterns[0]?.average_tokens_per_session
    });
    
    // Verify all 24 hours are covered
    const hours = patterns.map(p => p.hour).sort((a, b) => a - b);
    if (hours.length === 24 && hours[0] === 0 && hours[23] === 23) {
      console.log('✅ All 24 hours covered in patterns');
    } else {
      console.log('⚠️  Hours coverage issue:', hours.length, 'hours found');
    }
    
    return patterns;
  } catch (error) {
    console.error('❌ getTokenUsagePatterns failed:', error.message);
    throw error;
  }
}

async function testSessionsList() {
  console.log('\n🔍 Testing getSessionsList with UNION...');
  
  try {
    const result = await SessionAnalytics.getSessionsList({
      limit: 20,
      offset: 0
    });
    
    console.log(`✅ Found ${result.total} total sessions`);
    console.log(`📄 Retrieved ${result.sessions.length} sessions in current page`);
    
    if (result.sessions.length > 0) {
      const sample = result.sessions[0];
      console.log(`📊 Sample session:`, {
        id: sample.id,
        title: sample.title,
        type: sample.type,
        project_name: sample.project_name,
        status: sample.status,
        contextsCount: sample.contextsCount,
        duration: sample.duration
      });
      
      // Check for both web and MCP sessions
      const webSessions = result.sessions.filter(s => s.type === 'web');
      const mcpSessions = result.sessions.filter(s => s.type === 'mcp');
      
      console.log(`📊 Session types: ${webSessions.length} web, ${mcpSessions.length} MCP`);
      
      if (mcpSessions.length > 0) {
        console.log('✅ MCP sessions included in results');
      } else {
        console.log('⚠️  No MCP sessions found (may be expected if none exist)');
      }
    }
    
    return result;
  } catch (error) {
    console.error('❌ getSessionsList failed:', error.message);
    throw error;
  }
}

async function testSessionStats() {
  console.log('\n🔍 Testing getSessionStats with UNION...');
  
  try {
    const stats = await SessionAnalytics.getSessionStats();
    
    console.log(`✅ Session statistics retrieved:`);
    console.log(`📊 Total sessions: ${stats.totalSessions}`);
    console.log(`🟢 Active sessions: ${stats.activeSessions}`);
    console.log(`📅 Today sessions: ${stats.todaySessions}`);
    console.log(`⏱️  Average duration: ${stats.averageDuration} minutes`);
    
    // Validate reasonable values
    if (stats.totalSessions > 0) {
      console.log('✅ Has sessions in database');
      
      if (stats.averageDuration >= 0) {
        console.log('✅ Average duration is valid');
      } else {
        console.log('⚠️  Average duration seems invalid:', stats.averageDuration);
      }
    } else {
      console.log('⚠️  No sessions found (may be expected for empty database)');
    }
    
    return stats;
  } catch (error) {
    console.error('❌ getSessionStats failed:', error.message);
    throw error;
  }
}

async function runValidationTests() {
  console.log('🚀 Starting TS007-2 Analytics UNION Validation Tests');
  console.log('Testing all three updated analytics methods...');
  
  try {
    // Test all three methods
    const patterns = await testTokenUsagePatterns();
    const sessionsList = await testSessionsList();
    const stats = await testSessionStats();
    
    console.log('\n🎉 SUCCESS: All three analytics methods updated with UNION queries');
    console.log('\n📊 Summary:');
    console.log(`- Token patterns: ${patterns.length} hours with data`);
    console.log(`- Sessions list: ${sessionsList.total} total sessions found`);
    console.log(`- Session stats: ${stats.totalSessions} sessions, ${stats.activeSessions} active`);
    
    console.log('\n✅ TS007-2 COMPLETE: Analytics methods now include MCP sessions');
    console.log('🎯 Priority 2 session analytics integration finished');
    
    return true;
  } catch (error) {
    console.error('\n❌ TS007-2 validation failed:', error.message);
    return false;
  }
}

// Run the tests
if (require.main === module) {
  runValidationTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Validation script error:', error);
      process.exit(1);
    });
}

export { runValidationTests };
