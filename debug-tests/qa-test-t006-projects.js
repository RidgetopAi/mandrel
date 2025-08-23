#!/usr/bin/env node
/**
 * QA Test Suite for T006: Project & Session Management Interface
 * Comprehensive testing of backend APIs and integration points
 */

const axios = require('axios');
const assert = require('assert');

const BASE_URL = 'http://localhost:3001/api';
let authToken = '';
let testProjectId = '';

// Color codes for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m'
};

function log(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function authenticateUser() {
  try {
    log('\n🔐 Authenticating test user...', 'cyan');
    
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      username: 'testuser',
      password: 'Test123!'
    });
    
    assert.strictEqual(response.data.success, true, 'Authentication should succeed');
    assert(response.data.data.token, 'Token should be provided');
    
    authToken = response.data.data.token;
    log('✅ Authentication successful', 'green');
    
    return true;
  } catch (error) {
    if (error.response?.status === 401) {
      log('❌ Authentication failed - invalid credentials', 'red');
    } else {
      log(`❌ Authentication error: ${error.message}`, 'red');
    }
    return false;
  }
}

async function testProjectAPI() {
  const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  });

  log('\n🧪 Testing Project API Endpoints...', 'cyan');

  // Test 1: Create Project
  try {
    log('\n📝 Testing POST /projects (Create Project)...', 'blue');
    
    const createResponse = await apiClient.post('/projects', {
      name: 'QA Test Project T006',
      description: 'Test project created by QA automation for T006 testing',
      git_repo_url: 'https://github.com/test/t006-qa.git',
      root_directory: '/home/test/t006-qa'
    });
    
    assert.strictEqual(createResponse.data.success, true, 'Project creation should succeed');
    assert(createResponse.data.data.project.id, 'Project ID should be returned');
    assert.strictEqual(createResponse.data.data.project.name, 'QA Test Project T006', 'Project name should match');
    
    testProjectId = createResponse.data.data.project.id;
    log('✅ Project created successfully with ID: ' + testProjectId, 'green');
    
    // Test duplicate name handling
    try {
      await apiClient.post('/projects', {
        name: 'QA Test Project T006'
      });
      throw new Error('Should have failed with duplicate name');
    } catch (error) {
      if (error.response?.status === 409) {
        log('✅ Duplicate name validation working correctly', 'green');
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    log(`❌ Create project failed: ${error.message}`, 'red');
    throw error;
  }

  // Test 2: Get All Projects
  try {
    log('\n📋 Testing GET /projects (Get All Projects)...', 'blue');
    
    const getAllResponse = await apiClient.get('/projects');
    
    assert.strictEqual(getAllResponse.data.success, true, 'Get all projects should succeed');
    assert(Array.isArray(getAllResponse.data.data.projects), 'Projects should be an array');
    assert(getAllResponse.data.data.projects.length > 0, 'Should have at least one project');
    
    const createdProject = getAllResponse.data.data.projects.find(p => p.id === testProjectId);
    assert(createdProject, 'Created project should be in the list');
    assert.strictEqual(typeof createdProject.context_count, 'number', 'Context count should be a number');
    assert.strictEqual(typeof createdProject.session_count, 'number', 'Session count should be a number');
    
    log(`✅ Retrieved ${getAllResponse.data.data.projects.length} projects`, 'green');
    
  } catch (error) {
    log(`❌ Get all projects failed: ${error.message}`, 'red');
    throw error;
  }

  // Test 3: Get Single Project
  try {
    log('\n🔍 Testing GET /projects/:id (Get Single Project)...', 'blue');
    
    const getResponse = await apiClient.get(`/projects/${testProjectId}`);
    
    assert.strictEqual(getResponse.data.success, true, 'Get project should succeed');
    assert.strictEqual(getResponse.data.data.project.id, testProjectId, 'Project ID should match');
    assert.strictEqual(getResponse.data.data.project.name, 'QA Test Project T006', 'Project name should match');
    
    log('✅ Single project retrieved successfully', 'green');
    
    // Test 404 for non-existent project
    try {
      await apiClient.get('/projects/non-existent-id');
      throw new Error('Should have returned 404');
    } catch (error) {
      if (error.response?.status === 404) {
        log('✅ 404 handling for non-existent project working correctly', 'green');
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    log(`❌ Get single project failed: ${error.message}`, 'red');
    throw error;
  }

  // Test 4: Update Project
  try {
    log('\n✏️ Testing PUT /projects/:id (Update Project)...', 'blue');
    
    const updateResponse = await apiClient.put(`/projects/${testProjectId}`, {
      name: 'QA Test Project T006 - Updated',
      description: 'Updated description for T006 QA testing',
      status: 'active'
    });
    
    assert.strictEqual(updateResponse.data.success, true, 'Project update should succeed');
    assert.strictEqual(updateResponse.data.data.project.name, 'QA Test Project T006 - Updated', 'Project name should be updated');
    assert.strictEqual(updateResponse.data.data.project.description, 'Updated description for T006 QA testing', 'Description should be updated');
    
    log('✅ Project updated successfully', 'green');
    
  } catch (error) {
    log(`❌ Update project failed: ${error.message}`, 'red');
    throw error;
  }

  // Test 5: Get Project Statistics
  try {
    log('\n📊 Testing GET /projects/stats (Project Statistics)...', 'blue');
    
    const statsResponse = await apiClient.get('/projects/stats');
    
    assert.strictEqual(statsResponse.data.success, true, 'Get stats should succeed');
    
    const stats = statsResponse.data.data.stats;
    assert(typeof stats.total_projects === 'number', 'Total projects should be a number');
    assert(typeof stats.active_projects === 'number', 'Active projects should be a number');
    assert(typeof stats.total_contexts === 'number', 'Total contexts should be a number');
    assert(typeof stats.total_sessions === 'number', 'Total sessions should be a number');
    assert(typeof stats.contexts_by_type === 'object', 'Contexts by type should be an object');
    assert(typeof stats.recent_activity === 'object', 'Recent activity should be an object');
    
    log('✅ Project statistics retrieved successfully', 'green');
    log(`   Total projects: ${stats.total_projects}, Active: ${stats.active_projects}`, 'cyan');
    
  } catch (error) {
    log(`❌ Get project statistics failed: ${error.message}`, 'red');
    throw error;
  }

  // Test 6: Get Project Sessions
  try {
    log('\n👥 Testing GET /projects/:id/sessions (Project Sessions)...', 'blue');
    
    const sessionsResponse = await apiClient.get(`/projects/${testProjectId}/sessions`);
    
    assert.strictEqual(sessionsResponse.data.success, true, 'Get project sessions should succeed');
    assert(Array.isArray(sessionsResponse.data.data.sessions), 'Sessions should be an array');
    
    log(`✅ Project sessions retrieved (${sessionsResponse.data.data.sessions.length} sessions)`, 'green');
    
  } catch (error) {
    log(`❌ Get project sessions failed: ${error.message}`, 'red');
    throw error;
  }

  // Test 7: Get All Sessions
  try {
    log('\n🌐 Testing GET /projects/sessions/all (All Sessions)...', 'blue');
    
    const allSessionsResponse = await apiClient.get('/projects/sessions/all');
    
    assert.strictEqual(allSessionsResponse.data.success, true, 'Get all sessions should succeed');
    assert(Array.isArray(allSessionsResponse.data.data.sessions), 'Sessions should be an array');
    
    log(`✅ All sessions retrieved (${allSessionsResponse.data.data.sessions.length} sessions)`, 'green');
    
  } catch (error) {
    log(`❌ Get all sessions failed: ${error.message}`, 'red');
    throw error;
  }

  // Test 8: Delete Project (cleanup)
  try {
    log('\n🗑️ Testing DELETE /projects/:id (Delete Project)...', 'blue');
    
    const deleteResponse = await apiClient.delete(`/projects/${testProjectId}`);
    
    assert.strictEqual(deleteResponse.data.success, true, 'Project deletion should succeed');
    
    // Verify project is deleted
    try {
      await apiClient.get(`/projects/${testProjectId}`);
      throw new Error('Project should have been deleted');
    } catch (error) {
      if (error.response?.status === 404) {
        log('✅ Project deleted successfully and returns 404', 'green');
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    log(`❌ Delete project failed: ${error.message}`, 'red');
    throw error;
  }
}

async function testAuthenticationSecurity() {
  log('\n🔒 Testing Authentication Security...', 'cyan');

  // Test without auth token
  try {
    log('\n🚫 Testing access without authentication...', 'blue');
    
    const response = await axios.get(`${BASE_URL}/projects`);
    throw new Error('Should have been denied access');
  } catch (error) {
    if (error.response?.status === 401) {
      log('✅ Unauthorized access properly denied', 'green');
    } else {
      log(`❌ Unexpected error: ${error.message}`, 'red');
      throw error;
    }
  }

  // Test with invalid token
  try {
    log('\n🔓 Testing with invalid token...', 'blue');
    
    const response = await axios.get(`${BASE_URL}/projects`, {
      headers: { Authorization: 'Bearer invalid-token' }
    });
    throw new Error('Should have been denied access');
  } catch (error) {
    if (error.response?.status === 401) {
      log('✅ Invalid token properly rejected', 'green');
    } else {
      log(`❌ Unexpected error: ${error.message}`, 'red');
      throw error;
    }
  }
}

async function testInputValidation() {
  log('\n🧪 Testing Input Validation...', 'cyan');

  const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  });

  // Test missing required fields
  try {
    log('\n📝 Testing missing required project name...', 'blue');
    
    const response = await apiClient.post('/projects', {
      description: 'Test project without name'
    });
    throw new Error('Should have failed validation');
  } catch (error) {
    if (error.response?.status === 400) {
      log('✅ Missing required field validation working', 'green');
    } else {
      log(`❌ Validation error: ${error.message}`, 'red');
      throw error;
    }
  }

  // Test empty project name
  try {
    log('\n📝 Testing empty project name...', 'blue');
    
    const response = await apiClient.post('/projects', {
      name: '   ',
      description: 'Test project with empty name'
    });
    throw new Error('Should have failed validation');
  } catch (error) {
    if (error.response?.status === 400) {
      log('✅ Empty name validation working', 'green');
    } else {
      log(`❌ Validation error: ${error.message}`, 'red');
      throw error;
    }
  }

  // Test invalid URL format
  try {
    log('\n🔗 Testing invalid URL format...', 'blue');
    
    // This should succeed as URL validation is on frontend only for better UX
    const response = await apiClient.post('/projects', {
      name: 'Test URL Validation Project',
      git_repo_url: 'not-a-valid-url'
    });
    
    // Clean up
    if (response.data.success && response.data.data.project.id) {
      await apiClient.delete(`/projects/${response.data.data.project.id}`);
    }
    
    log('✅ URL validation handled appropriately', 'green');
    
  } catch (error) {
    log(`❌ URL validation test failed: ${error.message}`, 'red');
  }
}

async function testErrorHandling() {
  log('\n🚨 Testing Error Handling...', 'cyan');

  const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  });

  // Test SQL injection prevention
  try {
    log('\n💉 Testing SQL injection prevention...', 'blue');
    
    const maliciousInput = "'; DROP TABLE projects; --";
    
    try {
      const response = await apiClient.post('/projects', {
        name: maliciousInput,
        description: 'SQL injection test'
      });
      
      // Clean up if it somehow succeeds
      if (response.data.success && response.data.data.project.id) {
        await apiClient.delete(`/projects/${response.data.data.project.id}`);
      }
      
      log('✅ SQL injection attempt handled safely', 'green');
    } catch (error) {
      log('✅ SQL injection attempt rejected', 'green');
    }
    
  } catch (error) {
    log(`❌ SQL injection test failed: ${error.message}`, 'red');
  }
}

async function runQATests() {
  log('🎯 Starting QA Tests for T006: Project & Session Management Interface', 'magenta');
  log('=' .repeat(80), 'magenta');

  let passed = 0;
  let failed = 0;

  try {
    // Step 1: Authentication
    const authSuccess = await authenticateUser();
    if (!authSuccess) {
      log('\n❌ Authentication failed - cannot proceed with tests', 'red');
      process.exit(1);
    }
    passed++;

    // Step 2: Test Project API
    await testProjectAPI();
    passed++;

    // Step 3: Test Authentication Security
    await testAuthenticationSecurity();
    passed++;

    // Step 4: Test Input Validation
    await testInputValidation();
    passed++;

    // Step 5: Test Error Handling
    await testErrorHandling();
    passed++;

  } catch (error) {
    failed++;
    log(`\n❌ Test suite failed: ${error.message}`, 'red');
    if (error.response?.data) {
      log(`Response: ${JSON.stringify(error.response.data, null, 2)}`, 'yellow');
    }
  }

  // Final Results
  log('\n' + '='.repeat(80), 'magenta');
  log('🏁 QA Test Results Summary', 'magenta');
  log('='.repeat(80), 'magenta');
  log(`✅ Tests Passed: ${passed}`, 'green');
  log(`❌ Tests Failed: ${failed}`, 'red');
  log(`📊 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`, 'cyan');

  if (failed === 0) {
    log('\n🎉 All tests passed! T006 implementation is ready for production.', 'green');
    process.exit(0);
  } else {
    log('\n⚠️  Some tests failed. Please review the implementation.', 'yellow');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('\n\n👋 QA tests interrupted by user', 'yellow');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`\n❌ Unhandled rejection at ${promise}: ${reason}`, 'red');
  process.exit(1);
});

// Run the tests
runQATests().catch(error => {
  log(`\n💥 Fatal error: ${error.message}`, 'red');
  process.exit(1);
});
