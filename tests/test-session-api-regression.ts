#!/usr/bin/env tsx

/**
 * Test the actual API endpoint for session details regression
 */

import http from 'http';

async function makeRequest(sessionId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: `/api/sessions/${sessionId}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function testSessionDetailsRegression() {
  console.log('🔍 Testing session details API regression fix...\n');

  // Test web session (should work)
  const webSessionId = '34436dc4-fd52-4695-8289-67863a06d039';
  console.log(`🌐 Testing web session: ${webSessionId}`);
  
  try {
    const webResult = await makeRequest(webSessionId) as any;
    console.log(`  Status: ${webResult.status}`);
    
    if (webResult.status === 200 && webResult.data.success) {
      console.log('  ✅ Web session API works!');
      console.log(`  - Project: ${webResult.data.data.session.project_name || 'None'}`);
      console.log(`  - Type: ${webResult.data.data.session.session_type}`);
    } else {
      console.log('  ❌ Web session API failed');
      console.log('  Error:', webResult.data);
    }
  } catch (error) {
    console.log('  ❌ Web session request failed:', error);
  }

  console.log('');

  // Test agent session (was failing before fix)
  const agentSessionId = '5eb39677-fd5a-437a-9a9c-7ae11c6140c4';
  console.log(`🤖 Testing agent session: ${agentSessionId}`);
  
  try {
    const agentResult = await makeRequest(agentSessionId) as any;
    console.log(`  Status: ${agentResult.status}`);
    
    if (agentResult.status === 200 && agentResult.data.success) {
      console.log('  ✅ Agent session API works!');
      console.log(`  - Project: ${agentResult.data.data.session.project_name || 'None'}`);
      console.log(`  - Type: ${agentResult.data.data.session.session_type}`);
    } else {
      console.log('  ❌ Agent session API failed');
      console.log('  Error:', agentResult.data);
    }
  } catch (error) {
    console.log('  ❌ Agent session request failed:', error);
  }

  // Test non-existent session
  console.log('\n🔍 Testing non-existent session...');
  const fakeId = '00000000-0000-0000-0000-000000000000';
  
  try {
    const fakeResult = await makeRequest(fakeId) as any;
    console.log(`  Status: ${fakeResult.status}`);
    
    if (fakeResult.status === 404) {
      console.log('  ✅ Non-existent session correctly returns 404');
    } else {
      console.log('  ⚠️  Non-existent session returned unexpected status');
      console.log('  Response:', fakeResult.data);
    }
  } catch (error) {
    console.log('  ❌ Non-existent session request failed:', error);
  }

  console.log('\n🎯 API regression test complete!');
}

testSessionDetailsRegression().catch(console.error);
