#!/usr/bin/env node

/**
 * QaAgent Comprehensive Test Suite for AIDIS Context Browser
 * Tests all functionality before production approval
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Simple HTTP client helper
function httpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;
        
        const req = client.request({
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const jsonData = res.headers['content-type']?.includes('json') ? JSON.parse(data) : data;
                    resolve({ status: res.statusCode, data: jsonData, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, data, headers: res.headers });
                }
            });
        });
        
        req.on('error', reject);
        
        if (options.data) {
            req.write(typeof options.data === 'string' ? options.data : JSON.stringify(options.data));
        }
        req.end();
    });
}

const axios = {
    get: (url, config = {}) => httpRequest(url, { method: 'GET', headers: config.headers }),
    post: (url, data, config = {}) => httpRequest(url, { method: 'POST', data, headers: config.headers })
};

class QaAgent {
    constructor() {
        this.results = {
            passed: 0,
            failed: 0,
            warnings: 0,
            tests: []
        };
        this.token = null;
        this.baseURL = 'http://localhost:5000/api';
        this.frontendURL = 'http://localhost:3000';
    }

    log(type, message) {
        const timestamp = new Date().toISOString().substring(11, 19);
        console.log(`${timestamp} [${type}] ${message}`);
    }

    pass(testName, details = '') {
        this.results.passed++;
        this.results.tests.push({ name: testName, status: 'PASS', details });
        this.log('PASS', `${testName} ${details}`);
    }

    fail(testName, error) {
        this.results.failed++;
        this.results.tests.push({ name: testName, status: 'FAIL', error: error.message || error });
        this.log('FAIL', `${testName}: ${error.message || error}`);
    }

    warn(testName, warning) {
        this.results.warnings++;
        this.results.tests.push({ name: testName, status: 'WARN', warning });
        this.log('WARN', `${testName}: ${warning}`);
    }

    async runTest(testName, testFunction) {
        try {
            await testFunction();
        } catch (error) {
            this.fail(testName, error);
        }
    }

    // Test 1: Backend Server Health
    async testBackendHealth() {
        await this.runTest('Backend Health Check', async () => {
            const response = await axios.get(this.baseURL.replace('/api', '') + '/health');
            if (response.status === 200) {
                this.pass('Backend Health Check', `Status: ${response.status}`);
            }
        });
    }

    // Test 2: Authentication Flow
    async testAuthenticationFlow() {
        await this.runTest('Authentication - Valid Login', async () => {
            const response = await axios.post(`${this.baseURL}/auth/login`, {
                username: 'admin',
                password: 'admin123!'
            });
            
            if (response.status === 200 && response.data.token) {
                this.token = response.data.token;
                this.pass('Authentication - Valid Login', `Token received: ${this.token.substring(0, 20)}...`);
            } else {
                throw new Error('No token received');
            }
        });

        await this.runTest('Authentication - Invalid Login', async () => {
            try {
                await axios.post(`${this.baseURL}/auth/login`, {
                    username: 'admin',
                    password: 'wrongpassword'
                });
                throw new Error('Should have failed with invalid credentials');
            } catch (error) {
                if (error.response && error.response.status === 401) {
                    this.pass('Authentication - Invalid Login', 'Correctly rejected invalid credentials');
                } else {
                    throw error;
                }
            }
        });

        await this.runTest('Authentication - Missing Credentials', async () => {
            try {
                await axios.post(`${this.baseURL}/auth/login`, {});
                throw new Error('Should have failed with missing credentials');
            } catch (error) {
                if (error.response && (error.response.status === 400 || error.response.status === 401)) {
                    this.pass('Authentication - Missing Credentials', 'Correctly rejected missing credentials');
                } else {
                    throw error;
                }
            }
        });
    }

    // Test 3: Context API Functionality
    async testContextAPI() {
        const authHeaders = { 'Authorization': `Bearer ${this.token}` };

        await this.runTest('Context API - List Contexts', async () => {
            const response = await axios.get(`${this.baseURL}/contexts?limit=10`, { headers: authHeaders });
            if (response.status === 200 && response.data.data) {
                const contexts = response.data.data;
                this.pass('Context API - List Contexts', `Found ${contexts.total} contexts, showing ${contexts.contexts.length}`);
            }
        });

        await this.runTest('Context API - Context Stats', async () => {
            const response = await axios.get(`${this.baseURL}/contexts/stats`, { headers: authHeaders });
            if (response.status === 200 && response.data.data) {
                const stats = response.data.data;
                this.pass('Context API - Context Stats', `Projects: ${stats.totalProjects}, Types: ${Object.keys(stats.byType || {}).length}`);
            }
        });

        await this.runTest('Context API - Semantic Search', async () => {
            const response = await axios.post(`${this.baseURL}/contexts/search`, {
                query: 'context browser implementation',
                limit: 5
            }, { headers: authHeaders });
            
            if (response.status === 200 && response.data.data) {
                const results = response.data.data;
                this.pass('Context API - Semantic Search', `Found ${results.total} semantic matches`);
            }
        });

        await this.runTest('Context API - Unauthorized Access', async () => {
            try {
                await axios.get(`${this.baseURL}/contexts`, {});
                throw new Error('Should have failed without token');
            } catch (error) {
                if (error.response && error.response.status === 401) {
                    this.pass('Context API - Unauthorized Access', 'Correctly blocked unauthorized access');
                } else {
                    throw error;
                }
            }
        });
    }

    // Test 4: Frontend Accessibility
    async testFrontendAccessibility() {
        await this.runTest('Frontend - Main Page Load', async () => {
            const response = await axios.get(this.frontendURL);
            if (response.status === 200 && response.data.includes('AIDIS')) {
                this.pass('Frontend - Main Page Load', 'Frontend loads correctly');
            }
        });

        await this.runTest('Frontend - Context Browser Route', async () => {
            const response = await axios.get(`${this.frontendURL}/contexts`);
            if (response.status === 200) {
                this.pass('Frontend - Context Browser Route', 'Context browser route accessible');
            }
        });
    }

    // Test 5: Error Handling
    async testErrorHandling() {
        const authHeaders = { 'Authorization': `Bearer ${this.token}` };

        await this.runTest('Error Handling - Invalid Endpoint', async () => {
            try {
                await axios.get(`${this.baseURL}/nonexistent`, { headers: authHeaders });
                throw new Error('Should have returned 404');
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    this.pass('Error Handling - Invalid Endpoint', 'Correctly returns 404 for invalid endpoints');
                } else {
                    throw error;
                }
            }
        });

        await this.runTest('Error Handling - Invalid Context ID', async () => {
            try {
                await axios.get(`${this.baseURL}/contexts/999999`, { headers: authHeaders });
                throw new Error('Should have returned 404');
            } catch (error) {
                if (error.response && (error.response.status === 404 || error.response.status === 400)) {
                    this.pass('Error Handling - Invalid Context ID', 'Correctly handles invalid context ID');
                } else {
                    throw error;
                }
            }
        });
    }

    // Test 6: Performance Metrics
    async testPerformance() {
        const authHeaders = { 'Authorization': `Bearer ${this.token}` };

        await this.runTest('Performance - Context List Response Time', async () => {
            const startTime = Date.now();
            const response = await axios.get(`${this.baseURL}/contexts?limit=20`, { headers: authHeaders });
            const responseTime = Date.now() - startTime;
            
            if (response.status === 200) {
                if (responseTime < 1000) {
                    this.pass('Performance - Context List Response Time', `${responseTime}ms (Target: <1000ms)`);
                } else {
                    this.warn('Performance - Context List Response Time', `${responseTime}ms (slower than target)`);
                }
            }
        });

        await this.runTest('Performance - Search Response Time', async () => {
            const startTime = Date.now();
            const response = await axios.post(`${this.baseURL}/contexts/search`, {
                query: 'test search performance',
                limit: 10
            }, { headers: authHeaders });
            const responseTime = Date.now() - startTime;
            
            if (response.status === 200) {
                if (responseTime < 2000) {
                    this.pass('Performance - Search Response Time', `${responseTime}ms (Target: <2000ms)`);
                } else {
                    this.warn('Performance - Search Response Time', `${responseTime}ms (slower than target)`);
                }
            }
        });
    }

    // Test 7: Data Integrity
    async testDataIntegrity() {
        const authHeaders = { 'Authorization': `Bearer ${this.token}` };

        await this.runTest('Data Integrity - Context Structure', async () => {
            const response = await axios.get(`${this.baseURL}/contexts?limit=5`, { headers: authHeaders });
            if (response.status === 200) {
                const contexts = response.data.data.contexts;
                if (contexts.length > 0) {
                    const context = contexts[0];
                    const requiredFields = ['id', 'type', 'content', 'project_id', 'created_at'];
                    const missingFields = requiredFields.filter(field => !context.hasOwnProperty(field));
                    
                    if (missingFields.length === 0) {
                        this.pass('Data Integrity - Context Structure', 'All required fields present');
                    } else {
                        throw new Error(`Missing fields: ${missingFields.join(', ')}`);
                    }
                } else {
                    this.warn('Data Integrity - Context Structure', 'No contexts found to validate structure');
                }
            }
        });
    }

    async generateReport() {
        this.log('INFO', '='.repeat(70));
        this.log('INFO', 'QA AGENT COMPREHENSIVE TEST REPORT');
        this.log('INFO', '='.repeat(70));
        
        console.log('\n📊 TEST SUMMARY:');
        console.log(`✅ PASSED: ${this.results.passed}`);
        console.log(`❌ FAILED: ${this.results.failed}`);
        console.log(`⚠️  WARNINGS: ${this.results.warnings}`);
        console.log(`📋 TOTAL: ${this.results.tests.length}`);

        console.log('\n📝 DETAILED RESULTS:');
        this.results.tests.forEach(test => {
            const status = test.status === 'PASS' ? '✅' : test.status === 'FAIL' ? '❌' : '⚠️';
            console.log(`${status} ${test.name}`);
            if (test.details) console.log(`   ${test.details}`);
            if (test.error) console.log(`   Error: ${test.error}`);
            if (test.warning) console.log(`   Warning: ${test.warning}`);
        });

        // Final recommendation
        console.log('\n🎯 FINAL RECOMMENDATION:');
        if (this.results.failed === 0) {
            if (this.results.warnings === 0) {
                console.log('✅ APPROVE FOR PRODUCTION - All tests passed');
            } else {
                console.log('⚠️  APPROVE WITH MONITORING - All tests passed but performance warnings noted');
            }
        } else if (this.results.failed <= 2 && this.results.passed >= 10) {
            console.log('⚠️  CONDITIONAL APPROVE - Minor issues found, recommend fixes before production');
        } else {
            console.log('❌ NEEDS FIXES - Critical issues found, do not deploy to production');
        }

        return this.results.failed === 0;
    }

    async runAllTests() {
        console.log('🚀 Starting QaAgent Comprehensive Testing Suite...\n');

        await this.testBackendHealth();
        await this.testAuthenticationFlow();
        await this.testContextAPI();
        await this.testFrontendAccessibility();
        await this.testErrorHandling();
        await this.testPerformance();
        await this.testDataIntegrity();

        return await this.generateReport();
    }
}

// Run the test suite
const qaAgent = new QaAgent();
qaAgent.runAllTests()
    .then(success => {
        console.log(`\n🏁 Test suite completed. Success: ${success}`);
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Test suite crashed:', error);
        process.exit(1);
    });
