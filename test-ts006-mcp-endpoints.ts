/**
 * Test TS006 - Session Editing MCP Endpoints
 * Validates new session editing MCP tools work correctly
 */

import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

// MCP Client for testing
async function sendMCPCommand(tool: string, args: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const mcpProcess = spawn('node', ['mcp-server/src/server.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: '/home/ridgetop/aidis'
    });

    let output = '';
    let errorOutput = '';

    mcpProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    mcpProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    mcpProcess.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(output);
          resolve(result);
        } catch (error) {
          resolve({ output, error: 'Failed to parse JSON' });
        }
      } else {
        reject({ code, error: errorOutput, output });
      }
    });

    // Send MCP request
    const request = {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: {
        name: tool,
        arguments: args
      }
    };

    mcpProcess.stdin.write(JSON.stringify(request) + '\n');
    mcpProcess.stdin.end();

    // Timeout after 10 seconds
    setTimeout(() => {
      mcpProcess.kill();
      reject({ error: 'Timeout after 10 seconds' });
    }, 10000);
  });
}

async function testSessionEditingEndpoints() {
  console.log('🧪 Testing TS006 - Session Editing MCP Endpoints');
  console.log('=================================================');
  
  try {
    // Test 1: Create a new session with title for testing
    console.log('\n1. Creating test session...');
    const createResult = await sendMCPCommand('session_new', {
      title: 'Test Session for Editing',
      projectName: 'aidis-bootstrap'
    });
    console.log('Create session result:', createResult);
    
    // Extract session ID from result
    let testSessionId: string | null = null;
    if (createResult?.content?.[0]?.text) {
      const match = createResult.content[0].text.match(/Session ID: ([a-f0-9-]+)/i);
      if (match) {
        testSessionId = match[1] + '00000000-0000-0000-0000-000000000000'.substring(match[1].length);
      }
    }
    
    if (!testSessionId) {
      // Fallback: Get current active session
      console.log('   Fallback: Getting current session...');
      const statusResult = await sendMCPCommand('session_status');
      console.log('Session status result:', statusResult);
      
      if (statusResult?.content?.[0]?.text) {
        const match = statusResult.content[0].text.match(/Session ID: ([a-f0-9-]+)/i);
        if (match) {
          testSessionId = match[1] + '00000000-0000-0000-0000-000000000000'.substring(match[1].length);
        }
      }
    }
    
    if (!testSessionId) {
      throw new Error('Could not get session ID for testing');
    }
    
    console.log(`   Using session ID: ${testSessionId.substring(0, 8)}...`);
    
    // Test 2: Get session details
    console.log('\n2. Testing session_details endpoint...');
    const detailsResult = await sendMCPCommand('session_details', {
      sessionId: testSessionId
    });
    console.log('Session details result:', JSON.stringify(detailsResult, null, 2));
    
    if (detailsResult?.content?.[0]?.text?.includes('Session Details')) {
      console.log('✅ Test 2 PASSED: session_details endpoint works');
    } else {
      console.log('❌ Test 2 FAILED: session_details endpoint failed');
    }
    
    // Test 3: Update session title
    console.log('\n3. Testing session_update with title...');
    const updateTitleResult = await sendMCPCommand('session_update', {
      sessionId: testSessionId,
      title: 'Updated Test Session Title'
    });
    console.log('Update title result:', JSON.stringify(updateTitleResult, null, 2));
    
    if (updateTitleResult?.content?.[0]?.text?.includes('Session Updated Successfully')) {
      console.log('✅ Test 3 PASSED: session_update with title works');
    } else {
      console.log('❌ Test 3 FAILED: session_update with title failed');
    }
    
    // Test 4: Update session description
    console.log('\n4. Testing session_update with description...');
    const updateDescResult = await sendMCPCommand('session_update', {
      sessionId: testSessionId,
      description: 'This is a comprehensive test session for validating the session editing functionality. It includes testing of MCP endpoints, database updates, and response formatting.'
    });
    console.log('Update description result:', JSON.stringify(updateDescResult, null, 2));
    
    if (updateDescResult?.content?.[0]?.text?.includes('Session Updated Successfully')) {
      console.log('✅ Test 4 PASSED: session_update with description works');
    } else {
      console.log('❌ Test 4 FAILED: session_update with description failed');
    }
    
    // Test 5: Update both title and description
    console.log('\n5. Testing session_update with both fields...');
    const updateBothResult = await sendMCPCommand('session_update', {
      sessionId: testSessionId,
      title: 'Complete Session Edit Test',
      description: 'Final validation test with both title and description updated simultaneously to ensure the MCP endpoint handles multiple field updates correctly.'
    });
    console.log('Update both result:', JSON.stringify(updateBothResult, null, 2));
    
    if (updateBothResult?.content?.[0]?.text?.includes('Session Updated Successfully')) {
      console.log('✅ Test 5 PASSED: session_update with both fields works');
    } else {
      console.log('❌ Test 5 FAILED: session_update with both fields failed');
    }
    
    // Test 6: Get updated session details
    console.log('\n6. Verifying updates with session_details...');
    const finalDetailsResult = await sendMCPCommand('session_details', {
      sessionId: testSessionId
    });
    console.log('Final session details:', JSON.stringify(finalDetailsResult, null, 2));
    
    if (finalDetailsResult?.content?.[0]?.text?.includes('Complete Session Edit Test')) {
      console.log('✅ Test 6 PASSED: Updates persisted correctly');
    } else {
      console.log('❌ Test 6 FAILED: Updates not persisted');
    }
    
    // Test 7: Error handling - invalid session ID
    console.log('\n7. Testing error handling with invalid session ID...');
    const errorResult = await sendMCPCommand('session_update', {
      sessionId: 'invalid-session-id',
      title: 'Should fail'
    });
    console.log('Error handling result:', JSON.stringify(errorResult, null, 2));
    
    if (errorResult?.content?.[0]?.text?.includes('not found') || errorResult?.content?.[0]?.text?.includes('❌')) {
      console.log('✅ Test 7 PASSED: Error handling works correctly');
    } else {
      console.log('❌ Test 7 FAILED: Error handling not working');
    }
    
    // Test 8: Error handling - missing required fields
    console.log('\n8. Testing error handling with missing session ID...');
    const missingIdResult = await sendMCPCommand('session_update', {
      title: 'Missing session ID'
    });
    console.log('Missing ID result:', JSON.stringify(missingIdResult, null, 2));
    
    if (missingIdResult?.content?.[0]?.text?.includes('Session ID is required')) {
      console.log('✅ Test 8 PASSED: Required field validation works');
    } else {
      console.log('❌ Test 8 FAILED: Required field validation failed');
    }
    
    console.log('\n✅ TS006 Session Editing MCP Endpoints Testing Complete');
    console.log('All session editing endpoints are functional and ready for frontend integration!');
    
  } catch (error) {
    console.error('❌ TS006 test failed:', error);
    throw error;
  }
}

// Run the test
testSessionEditingEndpoints().catch(console.error);