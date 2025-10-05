/**
 * Test Session Update Implementation
 * 
 * This script tests the complete updateSession flow:
 * 1. Tests MCP session_update tool directly
 * 2. Tests the backend controller via HTTP
 * 
 * Usage: npx tsx test-session-update-implementation.ts
 */

import http from 'http';

interface McpResult {
  success: boolean;
  data?: any;
  error?: string;
}

// MCP service for testing the tool directly
class McpService {
  private static readonly REQUEST_TIMEOUT = 10000;

  static async callTool(toolName: string, params: any): Promise<McpResult> {
    console.log(`[MCP] Calling ${toolName} with params:`, params);
    
    try {
      const result = await this.makeRequest(toolName, params);
      console.log(`[MCP] ${toolName} result:`, result);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error(`[MCP] ${toolName} failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private static async makeRequest(toolName: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({ arguments: params });
      
      const options = {
        hostname: 'localhost',
        port: process.env.AIDIS_MCP_PORT || 8080,
        path: `/mcp/tools/${toolName}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const parsed = JSON.parse(data);
              
              if (parsed.isError) {
                reject(new Error(parsed.message || 'AIDIS MCP tool error'));
              } else {
                let result = parsed.result !== undefined ? parsed.result : parsed;
                
                if (result && result.content && result.content[0] && result.content[0].text) {
                  result = result.content[0].text;
                }
                
                resolve(result);
              }
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse response: ${parseError}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.setTimeout(this.REQUEST_TIMEOUT);
      req.write(postData);
      req.end();
    });
  }
}

async function testSessionUpdate() {
  console.log('🧪 Testing Session Update Implementation\n');

  try {
    // Get current session first
    console.log('1. Getting current session status...');
    const sessionStatus = await McpService.callTool('session_status', {});
    
    if (!sessionStatus.success) {
      console.error('❌ Failed to get session status:', sessionStatus.error);
      return;
    }
    
    console.log('✅ Got current session status');
    
    // Extract session ID from the status response
    let sessionId = '';
    if (typeof sessionStatus.data === 'string') {
      // Parse the session ID from text response
      const sessionIdMatch = sessionStatus.data.match(/Session ID:\s*([a-f0-9-]+)/);
      if (sessionIdMatch) {
        sessionId = sessionIdMatch[1];
      }
    }
    
    if (!sessionId) {
      console.error('❌ Could not extract session ID from response');
      console.log('Response data:', sessionStatus.data);
      return;
    }
    
    console.log(`✅ Current session ID: ${sessionId}\n`);
    
    // Test 1: Update title only
    console.log('2. Testing session_update with title only...');
    const titleResult = await McpService.callTool('session_update', {
      sessionId,
      title: 'Test Session - Title Update'
    });
    
    if (titleResult.success) {
      console.log('✅ Title update successful');
    } else {
      console.log('❌ Title update failed:', titleResult.error);
    }
    
    // Test 2: Update description only
    console.log('\n3. Testing session_update with description only...');
    const descResult = await McpService.callTool('session_update', {
      sessionId,
      description: 'Test description for session update validation'
    });
    
    if (descResult.success) {
      console.log('✅ Description update successful');
    } else {
      console.log('❌ Description update failed:', descResult.error);
    }
    
    // Test 3: Update both title and description
    console.log('\n4. Testing session_update with both title and description...');
    const bothResult = await McpService.callTool('session_update', {
      sessionId,
      title: 'TS002-1: Session Update Implementation Test',
      description: 'Complete test of updateSession method implementation'
    });
    
    if (bothResult.success) {
      console.log('✅ Both fields update successful');
    } else {
      console.log('❌ Both fields update failed:', bothResult.error);
    }
    
    // Test 4: Verify session_details shows the updates
    console.log('\n5. Verifying updates with session_details...');
    const detailsResult = await McpService.callTool('session_details', {
      sessionId
    });
    
    if (detailsResult.success) {
      console.log('✅ Session details retrieved successfully');
      console.log('Updated session details:', detailsResult.data);
    } else {
      console.log('❌ Failed to retrieve session details:', detailsResult.error);
    }
    
    console.log('\n🎉 All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

async function testInvalidCases() {
  console.log('\n🧪 Testing Invalid Cases\n');
  
  // Test 1: Invalid session ID
  console.log('1. Testing with invalid session ID...');
  const invalidResult = await McpService.callTool('session_update', {
    sessionId: 'invalid-session-id',
    title: 'Test Title'
  });
  
  if (!invalidResult.success) {
    console.log('✅ Correctly rejected invalid session ID');
  } else {
    console.log('❌ Should have rejected invalid session ID');
  }
  
  // Test 2: Missing session ID
  console.log('\n2. Testing with missing session ID...');
  const missingResult = await McpService.callTool('session_update', {
    title: 'Test Title'
  });
  
  if (!missingResult.success) {
    console.log('✅ Correctly rejected missing session ID');
  } else {
    console.log('❌ Should have rejected missing session ID');
  }
  
  // Test 3: Empty update (no title or description)
  console.log('\n3. Testing with empty update...');
  const emptyResult = await McpService.callTool('session_update', {
    sessionId: 'any-session-id'
  });
  
  if (!emptyResult.success) {
    console.log('✅ Correctly handled empty update');
  } else {
    console.log('❌ Should have handled empty update differently');
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting Session Update Implementation Tests\n');
  
  await testSessionUpdate();
  await testInvalidCases();
  
  console.log('\n✨ Test suite completed!\n');
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}
