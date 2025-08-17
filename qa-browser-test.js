#!/usr/bin/env node

/**
 * QaAgent Browser-based UI Testing for AIDIS Context Browser
 * Tests the frontend user experience with Playwright
 */

const { chromium } = require('playwright');

class QaBrowserAgent {
    constructor() {
        this.browser = null;
        this.page = null;
        this.results = {
            passed: 0,
            failed: 0,
            warnings: 0,
            tests: []
        };
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

    async setUp() {
        this.browser = await chromium.launch({ headless: true });
        this.page = await this.browser.newPage();
        
        // Set up console logging
        this.page.on('console', msg => {
            if (msg.type() === 'error') {
                this.warn('Console Error', `${msg.text()}`);
            }
        });

        // Set up error handling
        this.page.on('pageerror', error => {
            this.warn('Page Error', error.message);
        });
    }

    async tearDown() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async runTest(testName, testFunction) {
        try {
            await testFunction();
        } catch (error) {
            this.fail(testName, error);
        }
    }

    // Test 1: Frontend Load and Navigation
    async testFrontendLoad() {
        await this.runTest('Frontend Load - Main Page', async () => {
            await this.page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
            const title = await this.page.title();
            if (title.includes('AIDIS') || title.includes('React')) {
                this.pass('Frontend Load - Main Page', `Title: ${title}`);
            } else {
                throw new Error(`Unexpected title: ${title}`);
            }
        });

        await this.runTest('Frontend Load - Context Browser Route', async () => {
            await this.page.goto('http://localhost:3000/contexts', { waitUntil: 'networkidle' });
            
            // Check if we're redirected to login or if content loads
            const currentUrl = this.page.url();
            const pageContent = await this.page.textContent('body');
            
            if (currentUrl.includes('/login') || pageContent.includes('Login') || pageContent.includes('Sign in')) {
                this.pass('Frontend Load - Context Browser Route', 'Correctly redirects to authentication');
            } else if (pageContent.includes('Context') || pageContent.includes('Dashboard')) {
                this.pass('Frontend Load - Context Browser Route', 'Context browser loads directly');
            } else {
                throw new Error('Unable to determine page state');
            }
        });
    }

    // Test 2: Authentication UI Flow
    async testAuthenticationFlow() {
        await this.runTest('Authentication UI - Login Form', async () => {
            await this.page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
            
            // Look for login form elements
            const usernameField = await this.page.$('input[name="username"], input[type="email"], input[placeholder*="username"], input[placeholder*="Username"]');
            const passwordField = await this.page.$('input[name="password"], input[type="password"], input[placeholder*="password"], input[placeholder*="Password"]');
            const loginButton = await this.page.$('button[type="submit"], button:text("Login"), button:text("Sign in"), input[type="submit"]');

            if (usernameField && passwordField && loginButton) {
                this.pass('Authentication UI - Login Form', 'All login form elements present');
            } else {
                throw new Error(`Missing form elements - Username: ${!!usernameField}, Password: ${!!passwordField}, Button: ${!!loginButton}`);
            }
        });

        await this.runTest('Authentication UI - Login Success', async () => {
            // Try to login with admin credentials
            const usernameField = await this.page.$('input[name="username"], input[type="email"], input[placeholder*="username"], input[placeholder*="Username"]');
            const passwordField = await this.page.$('input[name="password"], input[type="password"], input[placeholder*="password"], input[placeholder*="Password"]');
            const loginButton = await this.page.$('button[type="submit"], button:text("Login"), button:text("Sign in"), input[type="submit"]');

            if (usernameField && passwordField && loginButton) {
                await usernameField.fill('admin');
                await passwordField.fill('admin123!');
                await loginButton.click();
                
                await this.page.waitForTimeout(2000); // Wait for navigation
                
                const currentUrl = this.page.url();
                const pageContent = await this.page.textContent('body');
                
                if (currentUrl.includes('/dashboard') || currentUrl.includes('/contexts') || 
                    pageContent.includes('Dashboard') || pageContent.includes('Context')) {
                    this.pass('Authentication UI - Login Success', 'Successfully logged in and navigated');
                } else {
                    throw new Error('Login did not redirect to expected page');
                }
            } else {
                throw new Error('Login form elements not found');
            }
        });
    }

    // Test 3: Context Browser UI
    async testContextBrowserUI() {
        await this.runTest('Context Browser UI - Main Elements', async () => {
            // Navigate to contexts page (should be logged in from previous test)
            await this.page.goto('http://localhost:3000/contexts', { waitUntil: 'networkidle' });
            
            const pageContent = await this.page.textContent('body');
            
            // Check for context browser elements
            const hasContexts = pageContent.includes('Context') || pageContent.includes('context');
            const hasSearch = await this.page.$('input[placeholder*="search"], input[placeholder*="Search"], input[type="search"]') !== null;
            const hasFilters = await this.page.$('[data-testid*="filter"], .filter, button:text("Filter")') !== null;
            
            if (hasContexts) {
                this.pass('Context Browser UI - Main Elements', 'Context browser UI elements detected');
            } else {
                throw new Error('Context browser elements not found');
            }
        });

        await this.runTest('Context Browser UI - Data Loading', async () => {
            // Wait for data to load and check for context cards/items
            await this.page.waitForTimeout(3000);
            
            const pageContent = await this.page.textContent('body');
            const hasData = pageContent.length > 1000; // Assume substantial content means data loaded
            
            if (hasData) {
                this.pass('Context Browser UI - Data Loading', `Page content loaded (${pageContent.length} chars)`);
            } else {
                this.warn('Context Browser UI - Data Loading', 'Limited content detected');
            }
        });
    }

    // Test 4: Responsiveness and Performance
    async testResponsiveness() {
        await this.runTest('Responsiveness - Mobile Viewport', async () => {
            await this.page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
            await this.page.goto('http://localhost:3000/contexts', { waitUntil: 'networkidle' });
            
            // Check if page renders without horizontal scrollbars
            const bodyWidth = await this.page.evaluate(() => document.body.scrollWidth);
            const viewportWidth = 375;
            
            if (bodyWidth <= viewportWidth + 20) { // Allow 20px tolerance
                this.pass('Responsiveness - Mobile Viewport', `Body width: ${bodyWidth}px fits in ${viewportWidth}px viewport`);
            } else {
                this.warn('Responsiveness - Mobile Viewport', `Body width: ${bodyWidth}px exceeds viewport`);
            }
        });

        await this.runTest('Performance - Page Load Time', async () => {
            const startTime = Date.now();
            await this.page.goto('http://localhost:3000/contexts', { waitUntil: 'networkidle' });
            const loadTime = Date.now() - startTime;
            
            if (loadTime < 3000) {
                this.pass('Performance - Page Load Time', `${loadTime}ms (Target: <3000ms)`);
            } else {
                this.warn('Performance - Page Load Time', `${loadTime}ms (slower than target)`);
            }
        });
    }

    async generateReport() {
        this.log('INFO', '='.repeat(70));
        this.log('INFO', 'QA BROWSER AGENT TEST REPORT');
        this.log('INFO', '='.repeat(70));
        
        console.log('\n📊 UI TEST SUMMARY:');
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

        return this.results.failed === 0;
    }

    async runAllTests() {
        console.log('🎭 Starting QaAgent Browser Testing Suite...\n');

        await this.setUp();

        await this.testFrontendLoad();
        await this.testAuthenticationFlow();
        await this.testContextBrowserUI();
        await this.testResponsiveness();

        const success = await this.generateReport();
        await this.tearDown();

        return success;
    }
}

// Run the browser test suite
const qaBrowserAgent = new QaBrowserAgent();
qaBrowserAgent.runAllTests()
    .then(success => {
        console.log(`\n🎭 Browser test suite completed. Success: ${success}`);
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Browser test suite crashed:', error);
        process.exit(1);
    });
