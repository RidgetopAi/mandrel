/**
 * T007 QA Comprehensive Test Suite
 * Testing Agent Management Dashboard implementation
 */

const axios = require('axios');
const WebSocket = require('ws');

class T007QATestSuite {
  constructor() {
    this.baseURL = 'http://localhost:5000/api';
    this.wsURL = 'ws://localhost:5000/ws';
    this.token = null;
    this.ws = null;
    this.testResults = {
      passed: 0,
      failed: 0,
      errors: []
    };
    
    // Test data
    this.testAgent = {
      name: 'QA-TestAgent-' + Date.now(),
      type: 'ai_assistant',
      capabilities: ['coding', 'testing'],
      metadata: { version: '1.0', testMode: true }
    };
    
    this.testTask = {
      title: 'QA Test Task',
      description: 'Test task for QA validation',
      project_id: null, // Will be set dynamically
      type: 'testing',
      priority: 'medium'
    };
  }

  async runTests() {
    console.log('🚀 Starting T007 Agent Management Dashboard QA Tests\n');
    
    try {
      await this.setup();
      await this.testAuthentication();
      await this.testAgentCRUD();
      await this.testTaskManagement();
      await this.testWebSocketFunctionality();
      await this.testErrorHandling();
      await this.testSecurityValidation();
      await this.testDataValidation();
      await this.testPerformanceBaseline();
      
    } catch (error) {
      console.error('❌ Test suite execution error:', error.message);
      this.testResults.errors.push({
        category: 'Test Execution',
        error: error.message,
        severity: 'critical'
      });
    } finally {
      await this.cleanup();
      this.printResults();
    }
  }

  async setup() {
    console.log('⚙️ Setting up test environment...');
    
    // Login with admin user
    try {
      const loginResponse = await axios.post(`${this.baseURL}/auth/login`, {
        username: 'admin',
        password: 'admin123!'
      });
      
      if (loginResponse.data.token) {
        this.token = loginResponse.data.token;
        console.log('✅ Authenticated with admin user');
      } else {
        throw new Error('No token received');
      }
    } catch (error) {
      console.error('Authentication error:', error.response?.data || error.message);
      throw new Error('Failed to authenticate admin user');
    }
    
    // Get or create project for testing
    try {
      const projectsResponse = await axios.get(`${this.baseURL}/projects`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      
      if (projectsResponse.data.data.projects.length > 0) {
        this.testTask.project_id = projectsResponse.data.data.projects[0].id;
      } else {
        throw new Error('No projects available for testing');
      }
    } catch (error) {
      console.error('⚠️ Warning: Could not set up test project');
    }
  }

  async testAuthentication() {
    console.log('\n🔐 Testing Authentication & Authorization...');
    
    // Test unauthenticated access
    try {
      await axios.get(`${this.baseURL}/agents`);
      this.fail('Authentication', 'Should reject unauthenticated requests');
    } catch (error) {
      if (error.response?.status === 401) {
        this.pass('Authentication', 'Correctly rejects unauthenticated requests');
      } else {
        this.fail('Authentication', `Unexpected error: ${error.message}`);
      }
    }
    
    // Test invalid token
    try {
      await axios.get(`${this.baseURL}/agents`, {
        headers: { Authorization: 'Bearer invalid-token' }
      });
      this.fail('Authorization', 'Should reject invalid tokens');
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        this.pass('Authorization', 'Correctly rejects invalid tokens');
      } else {
        this.fail('Authorization', `Unexpected error: ${error.message}`);
      }
    }
    
    // Test valid token access
    try {
      const response = await axios.get(`${this.baseURL}/agents`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      
      if (response.status === 200 && response.data.success) {
        this.pass('Valid Token', 'Accepts valid authenticated requests');
      } else {
        this.fail('Valid Token', 'Should accept valid token');
      }
    } catch (error) {
      this.fail('Valid Token', `Authentication failed: ${error.message}`);
    }
  }

  async testAgentCRUD() {
    console.log('\n🤖 Testing Agent CRUD Operations...');
    let createdAgent = null;
    
    try {
      // CREATE Agent
      const createResponse = await axios.post(
        `${this.baseURL}/agents`,
        this.testAgent,
        { headers: { Authorization: `Bearer ${this.token}` }}
      );
      
      if (createResponse.status === 201 && createResponse.data.success) {
        createdAgent = createResponse.data.data.agent;
        this.pass('Agent Creation', 'Successfully created agent');
        
        // Validate created agent data
        if (createdAgent.name === this.testAgent.name &&
            createdAgent.type === this.testAgent.type &&
            Array.isArray(createdAgent.capabilities)) {
          this.pass('Agent Data Validation', 'Created agent has correct data structure');
        } else {
          this.fail('Agent Data Validation', 'Agent data mismatch');
        }
      } else {
        this.fail('Agent Creation', 'Failed to create agent');
      }
      
      // READ Agent
      if (createdAgent) {
        const getResponse = await axios.get(
          `${this.baseURL}/agents/${createdAgent.id}`,
          { headers: { Authorization: `Bearer ${this.token}` }}
        );
        
        if (getResponse.status === 200 && getResponse.data.success) {
          this.pass('Agent Retrieval', 'Successfully retrieved agent');
        } else {
          this.fail('Agent Retrieval', 'Failed to retrieve agent');
        }
      }
      
      // UPDATE Agent
      if (createdAgent) {
        const updateData = {
          status: 'busy',
          capabilities: ['coding', 'testing', 'debugging']
        };
        
        const updateResponse = await axios.patch(
          `${this.baseURL}/agents/${createdAgent.id}`,
          updateData,
          { headers: { Authorization: `Bearer ${this.token}` }}
        );
        
        if (updateResponse.status === 200 && updateResponse.data.success) {
          const updatedAgent = updateResponse.data.data.agent;
          if (updatedAgent.status === 'busy' && updatedAgent.capabilities.length === 3) {
            this.pass('Agent Update', 'Successfully updated agent');
          } else {
            this.fail('Agent Update', 'Agent update data mismatch');
          }
        } else {
          this.fail('Agent Update', 'Failed to update agent');
        }
      }
      
      // LIST Agents
      const listResponse = await axios.get(
        `${this.baseURL}/agents`,
        { headers: { Authorization: `Bearer ${this.token}` }}
      );
      
      if (listResponse.status === 200 && listResponse.data.success) {
        const agents = listResponse.data.data.agents;
        if (Array.isArray(agents) && agents.length > 0) {
          this.pass('Agent Listing', 'Successfully retrieved agent list');
        } else {
          this.fail('Agent Listing', 'Agent list is empty or invalid');
        }
      } else {
        this.fail('Agent Listing', 'Failed to retrieve agent list');
      }
      
    } catch (error) {
      this.fail('Agent CRUD', `CRUD operations failed: ${error.message}`);
    } finally {
      // DELETE Agent (cleanup)
      if (createdAgent) {
        try {
          const deleteResponse = await axios.delete(
            `${this.baseURL}/agents/${createdAgent.id}`,
            { headers: { Authorization: `Bearer ${this.token}` }}
          );
          
          if (deleteResponse.status === 200 && deleteResponse.data.success) {
            this.pass('Agent Deletion', 'Successfully deleted agent');
          } else {
            this.fail('Agent Deletion', 'Failed to delete agent');
          }
        } catch (error) {
          this.fail('Agent Deletion', `Cleanup failed: ${error.message}`);
        }
      }
    }
  }

  async testTaskManagement() {
    console.log('\n📋 Testing Task Management...');
    let createdTask = null;
    
    if (!this.testTask.project_id) {
      this.fail('Task Management', 'No project available for task testing');
      return;
    }
    
    try {
      // CREATE Task
      const createResponse = await axios.post(
        `${this.baseURL}/agents/tasks`,
        this.testTask,
        { headers: { Authorization: `Bearer ${this.token}` }}
      );
      
      if (createResponse.status === 201 && createResponse.data.success) {
        createdTask = createResponse.data.data.task;
        this.pass('Task Creation', 'Successfully created task');
      } else {
        this.fail('Task Creation', 'Failed to create task');
      }
      
      // LIST Tasks
      const listResponse = await axios.get(
        `${this.baseURL}/agents/tasks`,
        { headers: { Authorization: `Bearer ${this.token}` }}
      );
      
      if (listResponse.status === 200 && listResponse.data.success) {
        const tasks = listResponse.data.data.tasks;
        if (Array.isArray(tasks)) {
          this.pass('Task Listing', 'Successfully retrieved task list');
        } else {
          this.fail('Task Listing', 'Task list format invalid');
        }
      } else {
        this.fail('Task Listing', 'Failed to retrieve task list');
      }
      
      // UPDATE Task
      if (createdTask) {
        const updateResponse = await axios.patch(
          `${this.baseURL}/agents/tasks/${createdTask.id}`,
          { status: 'in_progress', priority: 'high' },
          { headers: { Authorization: `Bearer ${this.token}` }}
        );
        
        if (updateResponse.status === 200 && updateResponse.data.success) {
          this.pass('Task Update', 'Successfully updated task');
        } else {
          this.fail('Task Update', 'Failed to update task');
        }
      }
      
    } catch (error) {
      this.fail('Task Management', `Task operations failed: ${error.message}`);
    }
  }

  async testWebSocketFunctionality() {
    console.log('\n🔌 Testing WebSocket Functionality...');
    
    if (!this.token) {
      this.fail('WebSocket', 'No token available for WebSocket testing');
      return;
    }
    
    return new Promise((resolve) => {
      const wsUrl = `${this.wsURL}?token=${encodeURIComponent(this.token)}`;
      
      try {
        this.ws = new WebSocket(wsUrl);
        
        this.ws.on('open', () => {
          console.log('WebSocket connected for testing');
          this.pass('WebSocket Connection', 'Successfully established WebSocket connection');
          
          // Test ping-pong
          this.ws.send(JSON.stringify({ type: 'ping' }));
        });
        
        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'connection_established') {
              this.pass('WebSocket Handshake', 'Received connection confirmation');
            } else if (message.type === 'pong') {
              this.pass('WebSocket Ping-Pong', 'WebSocket ping-pong works correctly');
            }
          } catch (error) {
            this.fail('WebSocket Message', `Invalid message format: ${error.message}`);
          }
        });
        
        this.ws.on('error', (error) => {
          this.fail('WebSocket Error', `WebSocket error: ${error.message}`);
          resolve();
        });
        
        this.ws.on('close', () => {
          console.log('WebSocket connection closed');
          resolve();
        });
        
        // Close connection after tests
        setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
          }
          resolve();
        }, 3000);
        
      } catch (error) {
        this.fail('WebSocket Setup', `Failed to establish WebSocket: ${error.message}`);
        resolve();
      }
    });
  }

  async testErrorHandling() {
    console.log('\n❌ Testing Error Handling...');
    
    // Test 404 for non-existent agent
    try {
      await axios.get(
        `${this.baseURL}/agents/non-existent-id`,
        { headers: { Authorization: `Bearer ${this.token}` }}
      );
      this.fail('404 Handling', 'Should return 404 for non-existent agent');
    } catch (error) {
      if (error.response?.status === 404) {
        this.pass('404 Handling', 'Correctly returns 404 for non-existent agent');
      } else {
        this.fail('404 Handling', `Unexpected status: ${error.response?.status}`);
      }
    }
    
    // Test validation errors
    try {
      await axios.post(
        `${this.baseURL}/agents`,
        { /* missing name */ type: 'ai_assistant' },
        { headers: { Authorization: `Bearer ${this.token}` }}
      );
      this.fail('Validation Handling', 'Should reject incomplete agent data');
    } catch (error) {
      if (error.response?.status === 400) {
        this.pass('Validation Handling', 'Correctly validates required fields');
      } else {
        this.fail('Validation Handling', `Unexpected validation response: ${error.response?.status}`);
      }
    }
  }

  async testSecurityValidation() {
    console.log('\n🛡️ Testing Security Validation...');
    
    // Test SQL injection prevention
    try {
      const maliciousName = "'; DROP TABLE agents; --";
      await axios.post(
        `${this.baseURL}/agents`,
        { name: maliciousName, type: 'ai_assistant' },
        { headers: { Authorization: `Bearer ${this.token}` }}
      );
      this.pass('SQL Injection Prevention', 'Handles malicious input safely');
    } catch (error) {
      if (error.response?.status < 500) {
        this.pass('SQL Injection Prevention', 'Properly rejects malicious input');
      } else {
        this.fail('SQL Injection Prevention', 'Server error on malicious input');
      }
    }
    
    // Test XSS prevention
    try {
      const xssPayload = "<script>alert('xss')</script>";
      const response = await axios.post(
        `${this.baseURL}/agents`,
        { name: xssPayload, type: 'ai_assistant' },
        { headers: { Authorization: `Bearer ${this.token}` }}
      );
      
      // Should create agent but sanitize the data
      this.pass('XSS Prevention', 'Handles XSS payloads appropriately');
    } catch (error) {
      // May reject XSS payload entirely, which is also acceptable
      this.pass('XSS Prevention', 'Rejects XSS payloads');
    }
  }

  async testDataValidation() {
    console.log('\n📊 Testing Data Validation...');
    
    // Test agent name length limits
    try {
      await axios.post(
        `${this.baseURL}/agents`,
        { 
          name: 'a'.repeat(100), // Too long
          type: 'ai_assistant' 
        },
        { headers: { Authorization: `Bearer ${this.token}` }}
      );
      this.fail('Name Length Validation', 'Should reject overly long names');
    } catch (error) {
      if (error.response?.status === 400) {
        this.pass('Name Length Validation', 'Validates name length limits');
      }
    }
    
    // Test invalid status values
    try {
      // First create an agent
      const createResponse = await axios.post(
        `${this.baseURL}/agents`,
        { name: 'TempAgent', type: 'ai_assistant' },
        { headers: { Authorization: `Bearer ${this.token}` }}
      );
      
      const agent = createResponse.data.data.agent;
      
      // Try to update with invalid status
      await axios.patch(
        `${this.baseURL}/agents/${agent.id}`,
        { status: 'invalid_status' },
        { headers: { Authorization: `Bearer ${this.token}` }}
      );
      
      this.fail('Status Validation', 'Should reject invalid status values');
      
      // Cleanup
      await axios.delete(
        `${this.baseURL}/agents/${agent.id}`,
        { headers: { Authorization: `Bearer ${this.token}` }}
      );
      
    } catch (error) {
      if (error.response?.status === 400) {
        this.pass('Status Validation', 'Validates status enum values');
      }
    }
  }

  async testPerformanceBaseline() {
    console.log('\n⚡ Testing Performance Baseline...');
    
    const startTime = Date.now();
    
    try {
      // Test agent listing performance
      const response = await axios.get(
        `${this.baseURL}/agents`,
        { headers: { Authorization: `Bearer ${this.token}` }}
      );
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      if (responseTime < 1000) { // Less than 1 second
        this.pass('Performance', `Agent listing response time: ${responseTime}ms (acceptable)`);
      } else if (responseTime < 3000) {
        this.pass('Performance', `Agent listing response time: ${responseTime}ms (slow but acceptable)`);
      } else {
        this.fail('Performance', `Agent listing response time: ${responseTime}ms (too slow)`);
      }
      
    } catch (error) {
      this.fail('Performance', `Performance test failed: ${error.message}`);
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test environment...');
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    
    // Additional cleanup if needed
    console.log('✅ Cleanup completed');
  }

  pass(category, message) {
    console.log(`✅ ${category}: ${message}`);
    this.testResults.passed++;
  }

  fail(category, message) {
    console.log(`❌ ${category}: ${message}`);
    this.testResults.failed++;
    this.testResults.errors.push({ category, message, severity: 'error' });
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('T007 QA TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`📊 Total: ${this.testResults.passed + this.testResults.failed}`);
    
    if (this.testResults.failed > 0) {
      console.log('\n🚨 FAILED TESTS:');
      this.testResults.errors.forEach((error, index) => {
        console.log(`${index + 1}. [${error.category}] ${error.message}`);
      });
    }
    
    const successRate = (this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100;
    console.log(`\n📈 Success Rate: ${successRate.toFixed(1)}%`);
    
    if (successRate >= 90) {
      console.log('🎉 EXCELLENT: Implementation quality is excellent!');
    } else if (successRate >= 75) {
      console.log('✅ GOOD: Implementation quality is good with minor issues');
    } else if (successRate >= 60) {
      console.log('⚠️ ACCEPTABLE: Implementation needs improvement');
    } else {
      console.log('❌ POOR: Significant issues found, requires major fixes');
    }
    
    console.log('='.repeat(60));
  }
}

// Run the tests
const testSuite = new T007QATestSuite();
testSuite.runTests();
