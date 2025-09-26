#!/usr/bin/env npx tsx

/**
 * Phase 5 Integration Test - Verify QA Fixes
 * Tests that the actual integrations work in the running system
 */

import * as http from 'http';

console.log('🔧 Testing Phase 5 QA Fixes Integration...');

interface TestResult {
  name: string;
  success: boolean;
  details: string;
}

const results: TestResult[] = [];

/**
 * Make HTTP request to test endpoints
 */
function makeRequest(url: string, method: string = 'GET', data?: any): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 8080,
      path: urlObj.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Version': '2.0.0'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const responseData = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode || 0, data: responseData });
        } catch (error) {
          resolve({ status: res.statusCode || 0, data: { rawBody: body } });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data && method !== 'GET') {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Test QA Fix #1: V2 API endpoints are exposed
 */
async function testV2ApiExposed(): Promise<TestResult> {
  try {
    console.log('🧪 Testing V2 API endpoints...');

    // Test V2 health endpoint
    const healthResponse = await makeRequest('http://localhost:8080/v2/mcp/health');

    if (healthResponse.status === 200 && healthResponse.data.version === '2.0.0') {
      return {
        name: 'V2 API Exposed',
        success: true,
        details: `V2 health endpoint working. Status: ${healthResponse.status}, Version: ${healthResponse.data.version}`
      };
    } else {
      return {
        name: 'V2 API Exposed',
        success: false,
        details: `V2 health endpoint failed. Status: ${healthResponse.status}, Response: ${JSON.stringify(healthResponse.data)}`
      };
    }

  } catch (error) {
    return {
      name: 'V2 API Exposed',
      success: false,
      details: `V2 API test failed: ${error.message}`
    };
  }
}

/**
 * Test QA Fix #2: Enhanced validation is used in V2 endpoints
 */
async function testEnhancedValidation(): Promise<TestResult> {
  try {
    console.log('🧪 Testing enhanced validation...');

    // Test with malicious input to see if IngressValidator catches it
    const maliciousInput = {
      arguments: {
        content: '<script>alert("xss")</script>',
        type: 'code'
      }
    };

    const response = await makeRequest(
      'http://localhost:8080/v2/mcp/tools/context_store',
      'POST',
      maliciousInput
    );

    // Should either sanitize the input or reject it
    if (response.status === 400 ||
        (response.status === 200 && response.data.warnings)) {
      return {
        name: 'Enhanced Validation',
        success: true,
        details: `Validation working. Status: ${response.status}. XSS input handled properly.`
      };
    } else {
      return {
        name: 'Enhanced Validation',
        success: false,
        details: `Validation may not be working. Status: ${response.status}, Response: ${JSON.stringify(response.data)}`
      };
    }

  } catch (error) {
    return {
      name: 'Enhanced Validation',
      success: false,
      details: `Enhanced validation test failed: ${error.message}`
    };
  }
}

/**
 * Test QA Fix #3: Parser working properly
 */
async function testParserIntegration(): Promise<TestResult> {
  try {
    console.log('🧪 Testing parser integration...');

    // Test with normal input
    const normalInput = {
      arguments: {
        content: 'Test content for parser verification',
        type: 'code'
      }
    };

    const response = await makeRequest(
      'http://localhost:8080/v2/mcp/tools/context_store',
      'POST',
      normalInput
    );

    if (response.status === 200 && response.data.success === true) {
      return {
        name: 'Parser Integration',
        success: true,
        details: `Parser working. Status: ${response.status}, Version: ${response.data.version}`
      };
    } else {
      return {
        name: 'Parser Integration',
        success: false,
        details: `Parser test failed. Status: ${response.status}, Response: ${JSON.stringify(response.data)}`
      };
    }

  } catch (error) {
    return {
      name: 'Parser Integration',
      success: false,
      details: `Parser test failed: ${error.message}`
    };
  }
}

/**
 * Test QA Fix #4: Response handler integration
 */
async function testResponseHandler(): Promise<TestResult> {
  try {
    console.log('🧪 Testing response handler...');

    // Test a tool that should return structured response
    const response = await makeRequest('http://localhost:8080/v2/mcp/tools/project_list', 'POST', {});

    if (response.status === 200 &&
        response.data.requestId &&
        response.data.processingTime !== undefined) {
      return {
        name: 'Response Handler',
        success: true,
        details: `Response handler working. Request ID: ${response.data.requestId}, Processing time: ${response.data.processingTime}ms`
      };
    } else {
      return {
        name: 'Response Handler',
        success: false,
        details: `Response handler test failed. Status: ${response.status}, Response: ${JSON.stringify(response.data)}`
      };
    }

  } catch (error) {
    return {
      name: 'Response Handler',
      success: false,
      details: `Response handler test failed: ${error.message}`
    };
  }
}

/**
 * Run all tests
 */
async function runAllTests(): Promise<void> {
  console.log('🚀 Starting Phase 5 Integration Tests...');
  console.log('====================================');

  // Check if server is running first
  try {
    await makeRequest('http://localhost:8080/healthz');
    console.log('✅ AIDIS server is running');
  } catch (error) {
    console.log('❌ AIDIS server is not running. Please start it first with: ./start-aidis.sh');
    process.exit(1);
  }

  // Run all tests
  const tests = [
    testV2ApiExposed,
    testEnhancedValidation,
    testParserIntegration,
    testResponseHandler
  ];

  for (const test of tests) {
    const result = await test();
    results.push(result);

    if (result.success) {
      console.log(`✅ ${result.name}: ${result.details}`);
    } else {
      console.log(`❌ ${result.name}: ${result.details}`);
    }
  }

  // Summary
  console.log('\n📊 Integration Test Summary:');
  console.log('============================');

  const passed = results.filter(r => r.success).length;
  const total = results.length;

  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);

  if (passed === total) {
    console.log('\n🎉 All Phase 5 integrations are working correctly!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some integrations are not working properly. Check the details above.');
    process.exit(1);
  }
}

// Run the tests
runAllTests().catch(error => {
  console.error('💥 Fatal error during testing:', error.message);
  process.exit(2);
});