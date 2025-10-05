#!/usr/bin/env tsx

/**
 * Test session details fix for both user_sessions and sessions tables
 */

import { SessionDetailService } from './aidis-command/backend/src/services/sessionDetail';

async function testSessionDetailsFix() {
  console.log('🔍 Testing session details fix...\n');

  // Test user session (web session)
  const webSessionId = '34436dc4-fd52-4695-8289-67863a06d039';
  console.log(`Testing web session: ${webSessionId}`);
  
  try {
    const webSession = await SessionDetailService.getSessionDetail(webSessionId);
    if (webSession) {
      console.log('✅ Web session found!');
      console.log(`  - Project: ${webSession.project_name || 'None'}`);
      console.log(`  - Type: ${webSession.session_type}`);
      console.log(`  - Duration: ${webSession.duration_minutes}min`);
    } else {
      console.log('❌ Web session not found');
    }
  } catch (error) {
    console.log('❌ Web session error:', error);
  }

  console.log('');

  // Test agent session (from sessions table)  
  const agentSessionId = '5eb39677-fd5a-437a-9a9c-7ae11c6140c4';
  console.log(`Testing agent session: ${agentSessionId}`);
  
  try {
    const agentSession = await SessionDetailService.getSessionDetail(agentSessionId);
    if (agentSession) {
      console.log('✅ Agent session found!');
      console.log(`  - Project: ${agentSession.project_name || 'None'}`);
      console.log(`  - Type: ${agentSession.session_type}`);
      console.log(`  - Duration: ${agentSession.duration_minutes}min`);
    } else {
      console.log('❌ Agent session not found');
    }
  } catch (error) {
    console.log('❌ Agent session error:', error);
  }

  console.log('\n🎯 Fix validation complete!');
}

testSessionDetailsFix().catch(console.error);
