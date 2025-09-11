/**
 * Test TS004 - Session Title and Description Fields
 * Validates title and description functionality for sessions
 */

import { SessionTracker } from './mcp-server/src/services/sessionTracker.js';
import { db } from './mcp-server/src/config/database.js';

async function testSessionTitleDescription() {
  console.log('🧪 Testing TS004 - Session Title and Description Fields');
  console.log('====================================================');
  
  try {
    // Test 1: Create session with title and description
    console.log('\n1. Testing session creation with title and description...');
    const title1 = 'Test Authentication Feature';
    const description1 = 'Implementing user authentication with JWT tokens and password reset functionality';
    
    const sessionId1 = await SessionTracker.startSession(undefined, title1, description1);
    console.log(`Created session: ${sessionId1.substring(0, 8)}...`);
    
    // Verify title and description were saved
    const session1 = await SessionTracker.getSessionWithDetails(sessionId1);
    console.log(`Session title: "${session1?.title}"`);
    console.log(`Session description: "${session1?.description}"`);
    
    if (session1?.title === title1 && session1?.description === description1) {
      console.log('✅ Test 1 PASSED: Title and description saved correctly');
    } else {
      console.log('❌ Test 1 FAILED: Title/description not saved correctly');
    }
    
    // Test 2: Create session with only title
    console.log('\n2. Testing session creation with title only...');
    const title2 = 'Debug Payment Flow';
    
    const sessionId2 = await SessionTracker.startSession(undefined, title2);
    const session2 = await SessionTracker.getSessionWithDetails(sessionId2);
    console.log(`Session title: "${session2?.title}"`);
    console.log(`Session description: ${session2?.description || 'null'}`);
    
    if (session2?.title === title2 && !session2?.description) {
      console.log('✅ Test 2 PASSED: Title-only session created correctly');
    } else {
      console.log('❌ Test 2 FAILED: Title-only session not created correctly');
    }
    
    // Test 3: Create session with description only (should auto-generate title)
    console.log('\n3. Testing auto-title generation from description...');
    const description3 = 'This is a longer description that should be truncated to create an auto-generated title for the session';
    
    const sessionId3 = await SessionTracker.startSession(undefined, undefined, description3);
    const session3 = await SessionTracker.getSessionWithDetails(sessionId3);
    console.log(`Auto-generated title: "${session3?.title}"`);
    console.log(`Original description: "${session3?.description}"`);
    
    if (session3?.title && session3?.title.length <= 53 && session3?.title.includes('...')) {
      console.log('✅ Test 3 PASSED: Auto-title generation works');
    } else {
      console.log('❌ Test 3 FAILED: Auto-title generation failed');
    }
    
    // Test 4: Update existing session title and description
    console.log('\n4. Testing session details update...');
    const newTitle = 'Updated Authentication Feature';
    const newDescription = 'Updated implementation with OAuth2 and multi-factor authentication support';
    
    const updateSuccess = await SessionTracker.updateSessionDetails(sessionId1, newTitle, newDescription);
    console.log(`Update success: ${updateSuccess}`);
    
    if (updateSuccess) {
      const updatedSession = await SessionTracker.getSessionWithDetails(sessionId1);
      console.log(`Updated title: "${updatedSession?.title}"`);
      console.log(`Updated description: "${updatedSession?.description}"`);
      
      if (updatedSession?.title === newTitle && updatedSession?.description === newDescription) {
        console.log('✅ Test 4 PASSED: Session details updated successfully');
      } else {
        console.log('❌ Test 4 FAILED: Session details not updated correctly');
      }
    } else {
      console.log('❌ Test 4 FAILED: Session update failed');
    }
    
    // Test 5: Update only title
    console.log('\n5. Testing partial update (title only)...');
    const partialTitle = 'Partial Update Test';
    
    const partialSuccess = await SessionTracker.updateSessionDetails(sessionId2, partialTitle);
    const partialSession = await SessionTracker.getSessionWithDetails(sessionId2);
    console.log(`Partial update title: "${partialSession?.title}"`);
    console.log(`Description unchanged: ${partialSession?.description || 'null'}`);
    
    if (partialSession?.title === partialTitle && !partialSession?.description) {
      console.log('✅ Test 5 PASSED: Partial update works correctly');
    } else {
      console.log('❌ Test 5 FAILED: Partial update failed');
    }
    
    // Test 6: Check database migration applied existing sessions
    console.log('\n6. Testing existing sessions have auto-generated titles...');
    const existingSessionsSql = `
      SELECT COUNT(*) as count, 
             COUNT(CASE WHEN title IS NOT NULL THEN 1 END) as with_titles
      FROM sessions 
      WHERE started_at < NOW() - INTERVAL '1 minute'
    `;
    
    const existingResult = await db.query(existingSessionsSql);
    const totalCount = parseInt(existingResult.rows[0].count);
    const withTitles = parseInt(existingResult.rows[0].with_titles);
    
    console.log(`Total existing sessions: ${totalCount}`);
    console.log(`Sessions with titles: ${withTitles}`);
    
    if (totalCount === withTitles || totalCount === 0) {
      console.log('✅ Test 6 PASSED: All existing sessions have titles');
    } else {
      console.log('❌ Test 6 FAILED: Some existing sessions missing titles');
    }
    
    // Cleanup test sessions
    console.log('\n7. Cleaning up test sessions...');
    await db.query('UPDATE sessions SET ended_at = NOW() WHERE id IN ($1, $2, $3)', [sessionId1, sessionId2, sessionId3]);
    
    console.log('\n✅ TS004 Session Title and Description Testing Complete');
    console.log('Sessions now support titles and descriptions for better organization!');
    
  } catch (error) {
    console.error('❌ TS004 test failed:', error);
    throw error;
  }
}

testSessionTitleDescription().catch(console.error);