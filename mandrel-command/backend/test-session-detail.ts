import { SessionDetailService } from './src/services/sessionDetail';
import { db } from './src/database/connection';

async function testSessionDetail() {
  console.log('Testing Session Detail Service...\n');

  try {
    // Get a valid session ID
    const sessionResult = await db.query(`
      SELECT id, project_id 
      FROM user_sessions 
      ORDER BY started_at DESC 
      LIMIT 1
    `);
    
    if (sessionResult.rows.length === 0) {
      console.log('No sessions found in database');
      return;
    }

    const sessionId = sessionResult.rows[0].id;
    const projectId = sessionResult.rows[0].project_id;
    
    console.log(`Testing with session ID: ${sessionId}`);
    console.log(`Project ID: ${projectId}\n`);

    // Test 1: Get session detail
    console.log('1. Testing getSessionDetail()');
    const detail = await SessionDetailService.getSessionDetail(sessionId);
    
    if (detail) {
      console.log('   ✓ Session detail loaded successfully');
      console.log(`   - Duration: ${detail.duration_minutes} minutes`);
      console.log(`   - Total Tokens: ${detail.total_tokens}`);
      console.log(`   - Contexts: ${detail.contexts.length}`);
      console.log(`   - Decisions: ${detail.decisions.length}`);
      console.log(`   - Tasks: ${detail.tasks.length}`);
      console.log(`   - Code Components: ${detail.code_components.length}`);
      console.log(`   - Productivity Score: ${detail.productivity_score}`);
      
      if (detail.contexts.length > 0) {
        console.log('\n   Sample context:');
        const ctx = detail.contexts[0];
        console.log(`     Type: ${ctx.context_type}`);
        console.log(`     Content: ${ctx.content.substring(0, 100)}...`);
      }
      
      if (detail.decisions.length > 0) {
        console.log('\n   Sample decision:');
        const dec = detail.decisions[0];
        console.log(`     Title: ${dec.title}`);
        console.log(`     Type: ${dec.decision_type}`);
        console.log(`     Status: ${dec.status}`);
      }
    } else {
      console.log('   ✗ Session not found');
    }

    // Test 2: Get session summaries
    console.log('\n2. Testing getSessionSummaries()');
    const summaries = await SessionDetailService.getSessionSummaries(undefined, 5, 0);
    
    console.log(`   ✓ Found ${summaries.length} session summaries`);
    
    if (summaries.length > 0) {
      console.log('\n   Recent sessions:');
      summaries.forEach((summary, index) => {
        console.log(`   ${index + 1}. ${summary.project_name || 'Unknown Project'}`);
        console.log(`      - Duration: ${summary.duration_minutes}min`);
        console.log(`      - Contexts: ${summary.contexts_created}`);
        console.log(`      - Decisions: ${summary.decisions_created}`);
        console.log(`      - Tasks: ${summary.tasks_created} created, ${summary.tasks_completed} completed`);
        console.log(`      - Score: ${summary.productivity_score}`);
      });
    }

    // Test 3: Get stats by period
    console.log('\n3. Testing getSessionStatsByPeriod()');
    const dailyStats = await SessionDetailService.getSessionStatsByPeriod('day', undefined, 7);
    
    console.log(`   ✓ Got stats for ${dailyStats.length} days`);
    
    if (dailyStats.length > 0) {
      console.log('\n   Last 7 days activity:');
      dailyStats.forEach(stat => {
        const date = new Date(stat.period).toLocaleDateString();
        console.log(`   ${date}: ${stat.session_count} sessions, ${stat.total_contexts} contexts, ${stat.total_decisions} decisions`);
      });
    }

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await db.end();
  }
}

// Run the test
testSessionDetail().then(() => {
  console.log('\nTests complete!');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});