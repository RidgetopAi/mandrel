import http from 'http';

// Test the server endpoints
async function testEndpoints() {
  const baseUrl = 'http://localhost:5000';
  
  const endpoints = [
    '/api/health',
    '/api/db-status', 
    '/api/version',
    '/'
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`);
      const data = await response.json();
      console.log(`✅ ${endpoint}:`, JSON.stringify(data, null, 2));
    } catch (error) {
      console.log(`❌ ${endpoint}:`, error);
    }
  }
}

// Start the server first
console.log('Testing AIDIS Command Backend endpoints...');
setTimeout(testEndpoints, 2000);
