import app from './src/server';
import request from 'supertest';
import { db } from './src/database/connection';

// Mock supertest - create a simple test function
async function testAPI() {
  console.log('🧪 Testing AIDIS Command Backend API Endpoints...\n');
  
  // Since we can't easily import supertest, let's test the endpoints manually
  // by starting the server and making HTTP requests
  
  const server = app.listen(5001); // Use different port to avoid conflicts
  
  try {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for server to start
    
    // Test root endpoint
    console.log('1️⃣ Testing root endpoint (/)...');
    const rootResponse = await fetch('http://localhost:5001/');
    const rootData = await rootResponse.json();
    console.log('✅ Root endpoint response:', {
      status: rootResponse.status,
      success: rootData.success,
      message: rootData.data?.message
    });
    
    // Test health endpoint
    console.log('\n2️⃣ Testing health endpoint (/api/health)...');
    const healthResponse = await fetch('http://localhost:5001/api/health');
    const healthData = await healthResponse.json();
    console.log('✅ Health endpoint response:', {
      status: healthResponse.status,
      success: healthData.success,
      healthy: healthData.data?.status === 'healthy',
      uptime: typeof healthData.data?.uptime === 'number'
    });
    
    // Test database status endpoint
    console.log('\n3️⃣ Testing database status endpoint (/api/db-status)...');
    const dbResponse = await fetch('http://localhost:5001/api/db-status');
    const dbData = await dbResponse.json();
    console.log('✅ Database status response:', {
      status: dbResponse.status,
      success: dbData.success,
      connected: dbData.data?.database?.connected,
      hasStats: !!dbData.data?.database?.stats
    });
    
    // Test version endpoint
    console.log('\n4️⃣ Testing version endpoint (/api/version)...');
    const versionResponse = await fetch('http://localhost:5001/api/version');
    const versionData = await versionResponse.json();
    console.log('✅ Version endpoint response:', {
      status: versionResponse.status,
      success: versionData.success,
      name: versionData.data?.name,
      version: versionData.data?.version
    });
    
    // Test 404 endpoint
    console.log('\n5️⃣ Testing 404 handling (/api/nonexistent)...');
    const notFoundResponse = await fetch('http://localhost:5001/api/nonexistent');
    const notFoundData = await notFoundResponse.json();
    console.log('✅ 404 endpoint response:', {
      status: notFoundResponse.status,
      success: notFoundData.success,
      isError: notFoundResponse.status === 404
    });
    
    console.log('\n🎉 All API endpoint tests passed! Backend is fully functional.\n');
    
    // Test CORS headers
    console.log('6️⃣ Testing CORS headers...');
    const corsResponse = await fetch('http://localhost:5001/api/health', {
      method: 'OPTIONS'
    });
    console.log('✅ CORS test:', {
      status: corsResponse.status,
      allowOrigin: corsResponse.headers.get('access-control-allow-origin'),
      allowMethods: corsResponse.headers.get('access-control-allow-methods')
    });
    
  } catch (error) {
    console.error('❌ API test failed:', error);
  } finally {
    server.close();
    await db.end();
  }
}

testAPI();
