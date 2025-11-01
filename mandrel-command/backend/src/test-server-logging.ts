/**
 * Test the server with logging by making API calls
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:5001';

async function testServerLogging() {
  console.log('🧪 Testing server logging with API calls...\n');

  try {
    // Test 1: Health check (should succeed)
    console.log('Test 1: Health check');
    const healthResponse = await axios.get(`${BASE_URL}/api/health`, {
      headers: {
        'x-correlation-id': 'test-health-001',
        'User-Agent': 'LoggingTestAgent/1.0'
      }
    });
    console.log('✅ Health check:', healthResponse.status);

    // Test 2: Version endpoint
    console.log('\nTest 2: Version endpoint');  
    const versionResponse = await axios.get(`${BASE_URL}/api/version`, {
      headers: {
        'x-correlation-id': 'test-version-002'
      }
    });
    console.log('✅ Version:', versionResponse.status);

    // Test 3: Non-existent endpoint (should trigger 404)
    console.log('\nTest 3: 404 error test');
    try {
      await axios.get(`${BASE_URL}/api/nonexistent`, {
        headers: {
          'x-correlation-id': 'test-404-003'
        }
      });
    } catch (error: any) {
      console.log('✅ 404 error logged:', error.response?.status);
    }

    // Test 4: POST request with body (test sanitization)
    console.log('\nTest 4: POST with sensitive data');
    try {
      await axios.post(`${BASE_URL}/api/auth/login`, {
        email: 'test@example.com',
        password: 'secret123',
        token: 'jwt-token-here'
      }, {
        headers: {
          'x-correlation-id': 'test-post-004',
          'Content-Type': 'application/json'
        }
      });
    } catch (error: any) {
      console.log('✅ Auth request logged (sensitive data should be sanitized):', error.response?.status);
    }

    console.log('\n🎉 Server logging tests completed!');
    console.log('📁 Check the following log files:');
    console.log('  • combined-YYYY-MM-DD.log - All logs');
    console.log('  • requests-YYYY-MM-DD.log - HTTP requests');
    console.log('  • security-YYYY-MM-DD.log - Security events');
    console.log('  • error-YYYY-MM-DD.log - Errors only');

  } catch (error) {
    console.error('❌ Server logging test failed:', error);
    console.log('\nMake sure the AIDIS Command Backend server is running:');
    console.log('  npm run dev');
  }
}

if (require.main === module) {
  testServerLogging().catch(console.error);
}

export { testServerLogging };
