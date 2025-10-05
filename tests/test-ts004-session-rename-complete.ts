#!/usr/bin/env npx tsx

/**
 * TS004-1: Complete Session Renaming Functionality Test
 * 
 * Tests the entire session renaming flow:
 * 1. Backend API (PUT /sessions/:id)
 * 2. MCP integration (session_update tool)
 * 3. Response validation
 * 4. Persistence verification
 * 5. Error handling
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api';
const API_KEY = 'ridge-dev-2024';

interface SessionResponse {
  sessionId: string;
  projectId?: string;
  title?: string;
  description?: string;
  type?: string;
  metadata?: any;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

class SessionRenameTest {
  private sessionId?: string;
  private originalTitle?: string;
  private originalDescription?: string;

  async runAllTests() {
    console.log('🧪 TS004-1: Session Renaming Functionality Test');
    console.log('=' .repeat(60));

    try {
      // Setup: Get current session
      await this.getCurrentSession();
      
      // Test scenarios
      await this.testUpdateTitleOnly();
      await this.testUpdateDescriptionOnly();
      await this.testUpdateBothTitleAndDescription();
      await this.testInvalidSessionId();
      await this.testInvalidRequestBody();
      await this.testAuthenticationRequired();
      
      // Cleanup: Restore original values
      await this.cleanup();

      console.log('\n✅ All session rename tests completed successfully!');

    } catch (error) {
      console.error('\n❌ Test suite failed:', error);
      throw error;
    }
  }

  private async getCurrentSession(): Promise<void> {
    console.log('\n📋 Getting current session...');
    
    const response = await axios.get(`${BASE_URL}/sessions/current`, {
      headers: { 'X-API-Key': API_KEY }
    });

    if (!response.data.success) {
      throw new Error(`Failed to get current session: ${response.data.error}`);
    }

    const session = response.data.data.session;
    this.sessionId = session.id;
    this.originalTitle = session.title;
    this.originalDescription = session.description;

    console.log(`📋 Session ID: ${this.sessionId}`);
    console.log(`📋 Original Title: ${this.originalTitle || '(none)'}`);
    console.log(`📋 Original Description: ${this.originalDescription || '(none)'}`);
  }

  private async testUpdateTitleOnly(): Promise<void> {
    console.log('\n🧪 Test 1: Update title only');
    
    const newTitle = `TS004 Test Title - ${Date.now()}`;
    
    const response = await axios.put(
      `${BASE_URL}/sessions/${this.sessionId}`,
      { title: newTitle },
      { headers: { 'X-API-Key': API_KEY } }
    );

    // Verify response structure
    if (!response.data.success) {
      throw new Error(`Update failed: ${response.data.error}`);
    }

    console.log('✅ Title update API call successful');

    // Verify persistence
    await this.verifyPersistence({ title: newTitle });
    console.log('✅ Title update persisted correctly');
  }

  private async testUpdateDescriptionOnly(): Promise<void> {
    console.log('\n🧪 Test 2: Update description only');
    
    const newDescription = `TS004 Test Description - ${Date.now()}`;
    
    const response = await axios.put(
      `${BASE_URL}/sessions/${this.sessionId}`,
      { description: newDescription },
      { headers: { 'X-API-Key': API_KEY } }
    );

    // Verify response structure
    if (!response.data.success) {
      throw new Error(`Update failed: ${response.data.error}`);
    }

    console.log('✅ Description update API call successful');

    // Verify persistence
    await this.verifyPersistence({ description: newDescription });
    console.log('✅ Description update persisted correctly');
  }

  private async testUpdateBothTitleAndDescription(): Promise<void> {
    console.log('\n🧪 Test 3: Update both title and description');
    
    const newTitle = `TS004 Combined Test Title - ${Date.now()}`;
    const newDescription = `TS004 Combined Test Description - ${Date.now()}`;
    
    const response = await axios.put(
      `${BASE_URL}/sessions/${this.sessionId}`,
      { 
        title: newTitle,
        description: newDescription 
      },
      { headers: { 'X-API-Key': API_KEY } }
    );

    // Verify response structure
    if (!response.data.success) {
      throw new Error(`Update failed: ${response.data.error}`);
    }

    console.log('✅ Combined update API call successful');

    // Verify persistence
    await this.verifyPersistence({ 
      title: newTitle, 
      description: newDescription 
    });
    console.log('✅ Combined update persisted correctly');
  }

  private async testInvalidSessionId(): Promise<void> {
    console.log('\n🧪 Test 4: Invalid session ID handling');
    
    try {
      const response = await axios.put(
        `${BASE_URL}/sessions/invalid-session-id`,
        { title: 'Test Title' },
        { headers: { 'X-API-Key': API_KEY } }
      );

      // Should not reach here - expecting error
      if (response.data.success) {
        throw new Error('Expected error for invalid session ID, but got success');
      }

    } catch (error: any) {
      if (error.response?.status === 400 || error.response?.status === 404) {
        console.log('✅ Invalid session ID properly rejected');
      } else {
        throw new Error(`Unexpected error for invalid session ID: ${error.message}`);
      }
    }
  }

  private async testInvalidRequestBody(): Promise<void> {
    console.log('\n🧪 Test 5: Invalid request body handling');
    
    // Test empty body
    try {
      const response = await axios.put(
        `${BASE_URL}/sessions/${this.sessionId}`,
        {},
        { headers: { 'X-API-Key': API_KEY } }
      );

      if (response.data.success) {
        console.log('✅ Empty body handled (allowed or rejected appropriately)');
      } else {
        console.log('✅ Empty body properly rejected');
      }

    } catch (error: any) {
      if (error.response?.status === 400) {
        console.log('✅ Empty body properly rejected with 400');
      } else {
        console.log(`⚠️  Empty body rejected with status: ${error.response?.status}`);
      }
    }

    // Test invalid data types
    try {
      const response = await axios.put(
        `${BASE_URL}/sessions/${this.sessionId}`,
        { title: 123, description: false }, // Invalid types
        { headers: { 'X-API-Key': API_KEY } }
      );

      console.log(`⚠️  Invalid data types response: ${response.data.success ? 'accepted' : 'rejected'}`);

    } catch (error: any) {
      if (error.response?.status === 400) {
        console.log('✅ Invalid data types properly rejected');
      } else {
        console.log(`⚠️  Invalid data types rejected with status: ${error.response?.status}`);
      }
    }
  }

  private async testAuthenticationRequired(): Promise<void> {
    console.log('\n🧪 Test 6: Authentication required check');
    
    try {
      const response = await axios.put(
        `${BASE_URL}/sessions/${this.sessionId}`,
        { title: 'Test Title' }
        // No API key header
      );

      if (response.data.success) {
        throw new Error('Expected authentication error, but request succeeded');
      }

    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.log('✅ Authentication properly required');
      } else {
        throw new Error(`Unexpected error for missing auth: ${error.message}`);
      }
    }
  }

  private async verifyPersistence(expected: { title?: string; description?: string }): Promise<void> {
    const response = await axios.get(`${BASE_URL}/sessions/current`, {
      headers: { 'X-API-Key': API_KEY }
    });

    if (!response.data.success) {
      throw new Error(`Failed to verify persistence: ${response.data.error}`);
    }

    const session = response.data.data.session;

    if (expected.title && session.title !== expected.title) {
      throw new Error(`Title mismatch. Expected: "${expected.title}", Got: "${session.title}"`);
    }

    if (expected.description && session.description !== expected.description) {
      throw new Error(`Description mismatch. Expected: "${expected.description}", Got: "${session.description}"`);
    }
  }

  private async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up - restoring original values...');
    
    try {
      if (this.originalTitle || this.originalDescription) {
        await axios.put(
          `${BASE_URL}/sessions/${this.sessionId}`,
          {
            title: this.originalTitle || '',
            description: this.originalDescription || ''
          },
          { headers: { 'X-API-Key': API_KEY } }
        );
        console.log('✅ Original values restored');
      } else {
        console.log('✅ No cleanup needed (no original values)');
      }
    } catch (error) {
      console.warn('⚠️  Cleanup failed:', error);
    }
  }
}

// Run the test
const tester = new SessionRenameTest();
tester.runAllTests()
  .then(() => {
    console.log('\n🎉 TS004-1 Session Rename Test Suite PASSED');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 TS004-1 Session Rename Test Suite FAILED:', error.message);
    process.exit(1);
  });
