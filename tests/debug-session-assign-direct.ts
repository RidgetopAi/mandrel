/**
 * Direct test of session assignment functionality
 * Bypasses MCP to test core functionality
 */

import { SessionManagementHandler } from './mcp-server/src/handlers/sessionAnalytics.js';
import { SessionTracker } from './mcp-server/src/services/sessionTracker.js';

async function testSessionAssignment() {
  console.log('🧪 Testing Session Assignment Directly');
  console.log('=====================================');
  
  try {
    // 1. Check for active session
    console.log('\n1. Checking for active session...');
    const activeSessionId = await SessionTracker.getActiveSession();
    console.log('Active session ID:', activeSessionId);
    
    if (!activeSessionId) {
      console.log('\n2. Creating new session...');
      const newSessionId = await SessionTracker.startSession();
      console.log('New session created:', newSessionId);
    }
    
    // 3. Get session status
    console.log('\n3. Getting session status...');
    const statusResult = await SessionManagementHandler.getSessionStatus();
    console.log('Session status result:', JSON.stringify(statusResult, null, 2));
    
    // 4. Try to assign session to project
    console.log('\n4. Assigning session to aidis-bootstrap...');
    const assignResult = await SessionManagementHandler.assignSessionToProject('aidis-bootstrap');
    console.log('Assignment result:', JSON.stringify(assignResult, null, 2));
    
    // 5. Check status again after assignment
    console.log('\n5. Checking session status after assignment...');
    const statusAfter = await SessionManagementHandler.getSessionStatus();
    console.log('Session status after assignment:', JSON.stringify(statusAfter, null, 2));
    
    console.log('\n✅ Direct session assignment test completed');
    
  } catch (error) {
    console.error('❌ Direct session assignment test failed:', error);
  }
}

testSessionAssignment().catch(console.error);
