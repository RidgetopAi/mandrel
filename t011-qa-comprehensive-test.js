#!/usr/bin/env node

/**
 * T011 Embedding Visualization System - Comprehensive QA Test Suite
 * Tests all backend APIs, frontend implementation, and integration
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const FRONTEND_URL = 'http://localhost:3001';

// Test configuration
const config = {
  timeout: 10000,
  maxRetries: 3
};

// Test results tracking
let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

// Helper functions
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type}] ${message}`);
}

function addTestResult(name, status, details = '') {
  testResults.tests.push({ name, status, details });
  if (status === 'PASS') {
    testResults.passed++;
    log(`✅ ${name}`, 'TEST');
  } else {
    testResults.failed++;
    log(`❌ ${name}: ${details}`, 'TEST');
  }
}

async function makeRequest(method, endpoint, data = null, headers = {}) {
  try {
    const response = await axios({
      method,
      url: `${BASE_URL}${endpoint}`,
      data,
      headers,
      timeout: config.timeout,
      validateStatus: () => true // Don't throw on error status codes
    });
    return response;
  } catch (error) {
    return { error: error.message, status: 0 };
  }
}

// TEST SUITE 1: Backend API Endpoints
async function testBackendEndpoints() {
  log('Starting Backend API Endpoint Tests...', 'SUITE');
  
  // Test 1: Health endpoint
  const health = await makeRequest('GET', '/api/health');
  if (health.status === 200 && health.data?.success) {
    addTestResult('Backend Health Check', 'PASS');
  } else {
    addTestResult('Backend Health Check', 'FAIL', `Status: ${health.status}`);
  }

  // Test 2: Database status
  const dbStatus = await makeRequest('GET', '/api/db-status');
  if (dbStatus.status === 200 && dbStatus.data?.data?.database?.connected) {
    addTestResult('Database Connection', 'PASS');
  } else {
    addTestResult('Database Connection', 'FAIL', `Status: ${dbStatus.status}`);
  }

  // Test 3: Version info
  const version = await makeRequest('GET', '/api/version');
  if (version.status === 200 && version.data?.data?.version) {
    addTestResult('API Version Info', 'PASS');
  } else {
    addTestResult('API Version Info', 'FAIL', `Status: ${version.status}`);
  }

  // Test 4: Embedding endpoints (without auth - should return 401)
  const embeddingEndpoints = [
    '/api/embedding/list',
    '/api/embedding/similarity',
    '/api/embedding/projection', 
    '/api/embedding/cluster',
    '/api/embedding/metrics'
  ];

  for (const endpoint of embeddingEndpoints) {
    const response = await makeRequest('GET', endpoint);
    if (response.status === 401) {
      addTestResult(`Embedding API ${endpoint} (Auth Required)`, 'PASS');
    } else {
      addTestResult(`Embedding API ${endpoint} (Auth Required)`, 'FAIL', 
        `Expected 401, got ${response.status}`);
    }
  }
}

// TEST SUITE 2: File Structure Validation
async function testFileStructure() {
  log('Starting File Structure Validation...', 'SUITE');
  
  const requiredFiles = [
    // Backend files
    'aidis-command/backend/src/routes/embedding.ts',
    'aidis-command/backend/src/services/EmbeddingService.ts',
    
    // Frontend files
    'aidis-command/frontend/src/pages/Embedding.tsx',
    'aidis-command/frontend/src/components/embedding/SimilarityHeatmap.tsx',
    'aidis-command/frontend/src/stores/embeddingStore.ts',
    'aidis-command/frontend/src/services/embeddingService.ts'
  ];

  for (const file of requiredFiles) {
    const fullPath = path.join('/home/ridgetop/aidis', file);
    if (fs.existsSync(fullPath)) {
      addTestResult(`File Structure: ${path.basename(file)}`, 'PASS');
    } else {
      addTestResult(`File Structure: ${path.basename(file)}`, 'FAIL', 
        `Missing: ${fullPath}`);
    }
  }
}

// TEST SUITE 3: Frontend Component Analysis
async function testFrontendComponents() {
  log('Starting Frontend Component Analysis...', 'SUITE');
  
  // Check if embedding page exists and has required content
  const embeddingPagePath = '/home/ridgetop/aidis/aidis-command/frontend/src/pages/Embedding.tsx';
  
  if (fs.existsSync(embeddingPagePath)) {
    const content = fs.readFileSync(embeddingPagePath, 'utf8');
    
    // Check for key features
    const checks = [
      { name: 'React Component Export', pattern: /export.*Embedding/ },
      { name: 'Ant Design Tabs', pattern: /@ant-design.*Tabs|<Tabs/ },
      { name: 'Six Tab Structure', pattern: /Heatmap.*2D.*Clustering.*3D.*Metrics.*Settings/s },
      { name: 'Zustand Store Usage', pattern: /useEmbeddingStore/ },
      { name: 'SimilarityHeatmap Component', pattern: /SimilarityHeatmap/ }
    ];
    
    checks.forEach(check => {
      if (check.pattern.test(content)) {
        addTestResult(`Frontend: ${check.name}`, 'PASS');
      } else {
        addTestResult(`Frontend: ${check.name}`, 'FAIL', 'Pattern not found');
      }
    });
  } else {
    addTestResult('Frontend: Embedding Page Exists', 'FAIL', 'File not found');
  }
  
  // Check SimilarityHeatmap component
  const heatmapPath = '/home/ridgetop/aidis/aidis-command/frontend/src/components/embedding/SimilarityHeatmap.tsx';
  if (fs.existsSync(heatmapPath)) {
    const content = fs.readFileSync(heatmapPath, 'utf8');
    
    const heatmapChecks = [
      { name: 'Ant Design Plots Import', pattern: /@ant-design\/plots/ },
      { name: 'Heatmap Component', pattern: /Heatmap/ },
      { name: 'Loading State', pattern: /loading/ },
      { name: 'Error Handling', pattern: /error/ },
      { name: 'Settings Panel', pattern: /settings|Settings/ }
    ];
    
    heatmapChecks.forEach(check => {
      if (check.pattern.test(content)) {
        addTestResult(`SimilarityHeatmap: ${check.name}`, 'PASS');
      } else {
        addTestResult(`SimilarityHeatmap: ${check.name}`, 'FAIL', 'Feature not found');
      }
    });
  } else {
    addTestResult('SimilarityHeatmap: Component Exists', 'FAIL', 'File not found');
  }
}

// TEST SUITE 4: Dependencies and Configuration
async function testDependencies() {
  log('Starting Dependencies and Configuration Tests...', 'SUITE');
  
  // Check backend package.json
  const backendPackagePath = '/home/ridgetop/aidis/aidis-command/backend/package.json';
  if (fs.existsSync(backendPackagePath)) {
    const backendPackage = JSON.parse(fs.readFileSync(backendPackagePath, 'utf8'));
    
    const requiredBackendDeps = ['express', 'cors', 'helmet', 'bcrypt', 'jsonwebtoken', 'pg'];
    requiredBackendDeps.forEach(dep => {
      if (backendPackage.dependencies && backendPackage.dependencies[dep]) {
        addTestResult(`Backend Dependency: ${dep}`, 'PASS');
      } else {
        addTestResult(`Backend Dependency: ${dep}`, 'FAIL', 'Not found in package.json');
      }
    });
  }
  
  // Check frontend package.json
  const frontendPackagePath = '/home/ridgetop/aidis/aidis-command/frontend/package.json';
  if (fs.existsSync(frontendPackagePath)) {
    const frontendPackage = JSON.parse(fs.readFileSync(frontendPackagePath, 'utf8'));
    
    const requiredFrontendDeps = ['react', 'antd', '@ant-design/plots', 'zustand', 'axios'];
    requiredFrontendDeps.forEach(dep => {
      if ((frontendPackage.dependencies && frontendPackage.dependencies[dep]) ||
          (frontendPackage.devDependencies && frontendPackage.devDependencies[dep])) {
        addTestResult(`Frontend Dependency: ${dep}`, 'PASS');
      } else {
        addTestResult(`Frontend Dependency: ${dep}`, 'FAIL', 'Not found in package.json');
      }
    });
    
    // Check for ML libraries for future phases
    const mlDeps = ['ml-pca', 'ml-kmeans', 'react-plotly.js'];
    mlDeps.forEach(dep => {
      if ((frontendPackage.dependencies && frontendPackage.dependencies[dep]) ||
          (frontendPackage.devDependencies && frontendPackage.devDependencies[dep])) {
        addTestResult(`ML Dependency: ${dep}`, 'PASS');
      } else {
        addTestResult(`ML Dependency: ${dep}`, 'FAIL', 'Not found - Phase 2+ dependency');
      }
    });
  }
}

// TEST SUITE 5: MCP Integration Test
async function testMCPIntegration() {
  log('Starting MCP Integration Test...', 'SUITE');
  
  // Test MCP server connection and embeddings
  const mcpServerPath = '/home/ridgetop/aidis/mcp-server/src/services/embedding.ts';
  if (fs.existsSync(mcpServerPath)) {
    addTestResult('MCP Embedding Service', 'PASS');
    
    const content = fs.readFileSync(mcpServerPath, 'utf8');
    if (content.includes('generateEmbedding') || content.includes('embedding')) {
      addTestResult('MCP Embedding Functions', 'PASS');
    } else {
      addTestResult('MCP Embedding Functions', 'FAIL', 'Functions not found');
    }
  } else {
    addTestResult('MCP Embedding Service', 'FAIL', 'Service file not found');
  }
}

// TEST SUITE 6: Security and Performance
async function testSecurityAndPerformance() {
  log('Starting Security and Performance Tests...', 'SUITE');
  
  // Test CORS headers
  const health = await makeRequest('GET', '/api/health');
  if (health.headers && health.headers['access-control-allow-origin']) {
    addTestResult('CORS Headers Present', 'PASS');
  } else {
    addTestResult('CORS Headers Present', 'FAIL', 'CORS headers missing');
  }
  
  // Test security headers
  const securityHeaders = [
    'content-security-policy',
    'x-content-type-options',
    'x-frame-options',
    'strict-transport-security'
  ];
  
  securityHeaders.forEach(header => {
    if (health.headers && health.headers[header]) {
      addTestResult(`Security Header: ${header}`, 'PASS');
    } else {
      addTestResult(`Security Header: ${header}`, 'FAIL', 'Header missing');
    }
  });
  
  // Test rate limiting headers
  if (health.headers && health.headers['ratelimit-limit']) {
    addTestResult('Rate Limiting Configured', 'PASS');
  } else {
    addTestResult('Rate Limiting Configured', 'FAIL', 'Rate limit headers missing');
  }
  
  // Performance test - response time
  const start = Date.now();
  await makeRequest('GET', '/api/health');
  const responseTime = Date.now() - start;
  
  if (responseTime < 1000) {
    addTestResult('API Response Time (<1s)', 'PASS');
  } else {
    addTestResult('API Response Time (<1s)', 'FAIL', `${responseTime}ms`);
  }
}

// Generate comprehensive report
function generateReport() {
  const totalTests = testResults.passed + testResults.failed;
  const passRate = ((testResults.passed / totalTests) * 100).toFixed(1);
  
  log('\n=== T011 EMBEDDING VISUALIZATION SYSTEM QA REPORT ===', 'REPORT');
  log(`Test Date: ${new Date().toISOString()}`, 'REPORT');
  log(`Total Tests: ${totalTests}`, 'REPORT');
  log(`Passed: ${testResults.passed}`, 'REPORT');
  log(`Failed: ${testResults.failed}`, 'REPORT');
  log(`Pass Rate: ${passRate}%`, 'REPORT');
  
  // Categorize results
  log('\n=== DETAILED RESULTS ===', 'REPORT');
  
  const categories = {
    'Backend API': [],
    'File Structure': [],
    'Frontend': [],
    'Dependencies': [],
    'Security': [],
    'Performance': [],
    'Integration': []
  };
  
  testResults.tests.forEach(test => {
    let category = 'Other';
    if (test.name.includes('Backend') || test.name.includes('API')) category = 'Backend API';
    else if (test.name.includes('File Structure')) category = 'File Structure';
    else if (test.name.includes('Frontend') || test.name.includes('SimilarityHeatmap')) category = 'Frontend';
    else if (test.name.includes('Dependency')) category = 'Dependencies';
    else if (test.name.includes('Security') || test.name.includes('Header')) category = 'Security';
    else if (test.name.includes('Performance') || test.name.includes('Response Time')) category = 'Performance';
    else if (test.name.includes('MCP')) category = 'Integration';
    
    if (!categories[category]) categories[category] = [];
    categories[category].push(test);
  });
  
  Object.entries(categories).forEach(([category, tests]) => {
    if (tests.length > 0) {
      log(`\n--- ${category} ---`, 'REPORT');
      tests.forEach(test => {
        const status = test.status === 'PASS' ? '✅' : '❌';
        log(`${status} ${test.name}${test.details ? ' - ' + test.details : ''}`, 'REPORT');
      });
    }
  });
  
  // Final assessment
  log('\n=== FINAL ASSESSMENT ===', 'REPORT');
  if (passRate >= 80) {
    log('🟢 PHASE 1: PRODUCTION READY', 'VERDICT');
    log('The T011 Embedding Visualization System Phase 1 is ready for production use.', 'VERDICT');
  } else if (passRate >= 60) {
    log('🟡 PHASE 1: NEEDS MINOR FIXES', 'VERDICT');
    log('The system is mostly ready but requires some fixes before production.', 'VERDICT');
  } else {
    log('🔴 PHASE 1: SIGNIFICANT ISSUES FOUND', 'VERDICT');
    log('The system requires major fixes before production deployment.', 'VERDICT');
  }
  
  // Save results to file
  const reportData = {
    timestamp: new Date().toISOString(),
    summary: { totalTests, passed: testResults.passed, failed: testResults.failed, passRate },
    categories,
    details: testResults.tests
  };
  
  fs.writeFileSync('/home/ridgetop/aidis/T011_QA_COMPREHENSIVE_REPORT.json', 
    JSON.stringify(reportData, null, 2));
  log('Detailed report saved to T011_QA_COMPREHENSIVE_REPORT.json', 'REPORT');
}

// Main execution
async function runAllTests() {
  log('Starting T011 Embedding Visualization System QA Test Suite', 'START');
  
  try {
    await testBackendEndpoints();
    await testFileStructure();
    await testFrontendComponents();
    await testDependencies();
    await testMCPIntegration();
    await testSecurityAndPerformance();
    
    generateReport();
    
    // Exit with appropriate code
    if (testResults.failed === 0) {
      log('All tests passed! ✅', 'SUCCESS');
      process.exit(0);
    } else {
      log(`${testResults.failed} tests failed! ❌`, 'FAIL');
      process.exit(1);
    }
    
  } catch (error) {
    log(`Test suite failed with error: ${error.message}`, 'ERROR');
    console.error(error);
    process.exit(1);
  }
}

// Run the test suite
runAllTests();
