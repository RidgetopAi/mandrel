#!/usr/bin/env node

/**
 * Test the project insights endpoint
 */

import http from 'http';

async function testProjectInsights() {
    console.log('🧪 Testing Project Insights Endpoint...');
    
    // First test MCP tool directly
    console.log('\n1. Testing AIDIS MCP tool directly...');
    
    try {
        const mcpPostData = JSON.stringify({ 
            arguments: { 
                projectId: '4afb236c-00d7-433d-87de-0f489b96acb2' 
            } 
        });
        
        const mcpResult = await makeRequest({
            hostname: 'localhost',
            port: 8080,
            path: '/mcp/tools/project_insights',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(mcpPostData)
            }
        }, mcpPostData);
        
        console.log('✅ MCP Tool Response:', JSON.stringify(mcpResult, null, 2));
    } catch (error) {
        console.error('❌ MCP Tool Error:', error);
    }
    
    // Test the API endpoint
    console.log('\n2. Testing API endpoint...');
    
    try {
        const apiResult = await makeRequest({
            hostname: 'localhost',
            port: 5000,
            path: '/api/projects/4afb236c-00d7-433d-87de-0f489b96acb2/insights',
            method: 'GET',
            headers: {
                'Authorization': 'Bearer test-token-for-development',
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ API Endpoint Response:', JSON.stringify(apiResult, null, 2));
    } catch (error) {
        console.error('❌ API Endpoint Error:', error);
    }
}

function makeRequest(options: any, postData?: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode === 200) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
                    }
                } catch (parseError) {
                    reject(new Error(`Failed to parse response: ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        req.setTimeout(10000);
        
        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}

testProjectInsights().catch(console.error);
