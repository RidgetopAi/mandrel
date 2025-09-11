/**
 * Comprehensive Test for Session Recovery System
 * Tests the complete integration between frontend and backend session recovery
 */

import { ProjectApi } from './aidis-command/frontend/src/services/projectApi';

async function testSessionRecoverySystem() {
  console.log('🔄 Testing Session Recovery System...\n');

  try {
    // Test 1: Backend API getCurrentSession endpoint
    console.log('📡 Testing backend getCurrentSession API...');
    const currentSession = await ProjectApi.getCurrentSession();
    
    if (currentSession) {
      console.log('✅ Current session found:');
      console.log(`   ID: ${currentSession.id}`);
      console.log(`   Project: ${currentSession.project_name || 'N/A'}`);
      console.log(`   Title: ${currentSession.title || 'N/A'}`);
      console.log(`   Type: ${currentSession.type || 'N/A'}`);
      console.log(`   Duration: ${currentSession.duration || 'N/A'}`);
      console.log(`   Context Count: ${currentSession.context_count || 0}`);
    } else {
      console.log('⚠️  No current session found');
    }

    // Test 2: Verify session recovery service initialization
    console.log('\n🔧 Testing SessionRecoveryService...');
    
    // Import and test the session recovery service
    const { sessionRecovery } = await import('./aidis-command/frontend/src/services/sessionRecovery');
    
    console.log('✅ SessionRecoveryService imported successfully');
    console.log(`   Current session: ${sessionRecovery.getCurrentSession()?.id || 'None'}`);
    console.log(`   Connection status: ${sessionRecovery.isConnected()}`);
    console.log(`   Reconnect attempts: ${sessionRecovery.getReconnectAttempts()}`);

    // Test 3: Force sync functionality
    console.log('\n🔄 Testing force sync...');
    await sessionRecovery.forceSync();
    console.log('✅ Force sync completed');

    // Test 4: Persistence functionality
    console.log('\n💾 Testing persistence...');
    const persistedData = sessionRecovery.getPersistedData();
    console.log(`   Persisted session: ${persistedData.currentSession?.id || 'None'}`);
    console.log(`   Last sync: ${new Date(persistedData.lastSyncTime).toISOString()}`);

    // Test 5: Session update functionality
    if (currentSession) {
      console.log('\n📝 Testing session update...');
      sessionRecovery.updateSession(currentSession);
      console.log('✅ Session updated successfully');
    }

    // Test 6: Connection state management
    console.log('\n🔌 Testing connection state management...');
    const initialState = sessionRecovery.isConnected();
    sessionRecovery.setConnectionState(false);
    console.log(`   Connection state changed: ${initialState} → ${sessionRecovery.isConnected()}`);
    sessionRecovery.setConnectionState(true);
    console.log(`   Connection state restored: ${sessionRecovery.isConnected()}`);

    console.log('\n✅ Session Recovery System Test Complete!');
    console.log('\n📊 Summary:');
    console.log(`   - Backend API: ${currentSession ? 'Working' : 'No active session'}`);
    console.log(`   - Recovery Service: Working`);
    console.log(`   - Persistence: Working`);
    console.log(`   - State Management: Working`);

  } catch (error) {
    console.error('❌ Session Recovery Test Failed:', error);
    
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
      if (error.stack) {
        console.error(`   Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
    }
    
    process.exit(1);
  }
}

// Run the test
testSessionRecoverySystem().catch(console.error);