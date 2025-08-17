const { chromium } = require('playwright');
const path = require('path');

async function debugContextClick401Error() {
    console.log('🔍 DEBUGGING 401 ERROR ON CONTEXT CLICK');
    console.log('==========================================');
    
    const browser = await chromium.launch({ 
        headless: false,  // Show browser for debugging
        slowMo: 1000     // Slow down actions
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Enable request/response logging
    page.on('request', request => {
        console.log(`🔵 REQUEST: ${request.method()} ${request.url()}`);
        if (request.url().includes('/api/')) {
            console.log(`   Headers: ${JSON.stringify(request.headers(), null, 2)}`);
        }
    });
    
    page.on('response', response => {
        if (response.url().includes('/api/')) {
            console.log(`🟡 RESPONSE: ${response.status()} ${response.url()}`);
            if (response.status() === 401) {
                console.log(`❌ 401 UNAUTHORIZED ERROR DETECTED!`);
                console.log(`   URL: ${response.url()}`);
                console.log(`   Status: ${response.status()}`);
            }
        }
    });
    
    page.on('console', msg => {
        console.log(`🖥️  CONSOLE: ${msg.text()}`);
    });
    
    try {
        console.log('\n1️⃣ Navigating to AIDIS Command UI...');
        await page.goto('http://localhost:3000');
        await page.waitForLoadState('networkidle');
        
        console.log('\n2️⃣ Looking for login form or authentication state...');
        
        // Check if we're on login page
        const loginForm = await page.locator('form').first().isVisible().catch(() => false);
        
        if (loginForm) {
            console.log('📝 Login form detected, attempting to login...');
            
            // Try to login with test credentials
            await page.fill('input[name="username"], input[type="text"]', 'admin');
            await page.fill('input[name="password"], input[type="password"]', 'admin123');
            await page.click('button[type="submit"], button:has-text("Login")');
            await page.waitForLoadState('networkidle');
        }
        
        console.log('\n3️⃣ Looking for Context button...');
        
        // Wait a bit for the page to fully load
        await page.waitForTimeout(2000);
        
        // Try multiple selectors for the context button/link
        const contextSelectors = [
            'a:has-text("Context")',
            'button:has-text("Context")',
            '[href*="context"]',
            'nav a:has-text("Context")',
            '.nav-link:has-text("Context")',
            '*[data-testid="context"]'
        ];
        
        let contextButton = null;
        for (const selector of contextSelectors) {
            try {
                const element = page.locator(selector).first();
                if (await element.isVisible()) {
                    contextButton = element;
                    console.log(`✅ Found context button with selector: ${selector}`);
                    break;
                }
            } catch (e) {
                // Continue trying other selectors
            }
        }
        
        if (!contextButton) {
            console.log('❌ Could not find Context button. Available elements:');
            const allLinks = await page.locator('a, button').all();
            for (const link of allLinks) {
                try {
                    const text = await link.textContent();
                    if (text && text.trim()) {
                        console.log(`   - ${text.trim()}`);
                    }
                } catch (e) {
                    // Skip elements that can't be accessed
                }
            }
            return;
        }
        
        console.log('\n4️⃣ Clicking Context button and monitoring network...');
        
        // Click the context button and monitor for 401 errors
        await contextButton.click();
        
        // Wait for any network requests to complete
        await page.waitForTimeout(3000);
        
        console.log('\n5️⃣ Checking for errors in localStorage...');
        const token = await page.evaluate(() => localStorage.getItem('aidis_token'));
        console.log(`   Token in localStorage: ${token ? 'Present' : 'Missing'}`);
        
        if (token) {
            console.log(`   Token value: ${token.substring(0, 20)}...`);
        }
        
        console.log('\n6️⃣ Taking screenshot for visual debugging...');
        await page.screenshot({ path: '/home/ridgetop/aidis/debug-401-screenshot.png' });
        
        console.log('\n✅ Debug complete! Check console output above for 401 errors.');
        
    } catch (error) {
        console.error('❌ Error during debugging:', error);
    } finally {
        await browser.close();
    }
}

// Check if Playwright is available
async function checkPlaywright() {
    try {
        const { chromium } = require('playwright');
        console.log('✅ Playwright is available');
        return true;
    } catch (error) {
        console.log('❌ Playwright not available:', error.message);
        return false;
    }
}

async function main() {
    const playwrightAvailable = await checkPlaywright();
    
    if (playwrightAvailable) {
        await debugContextClick401Error();
    } else {
        console.log('\n📦 Installing Playwright...');
        console.log('Run: npm install playwright');
        console.log('Then: npx playwright install');
    }
}

main().catch(console.error);
