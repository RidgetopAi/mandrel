#!/usr/bin/env tsx

// Test session assignment API directly
const testAssignment = async () => {
  console.log('🧪 Testing Session Assignment API...\n');
  
  try {
    // First, get an auth token (we'll use a dummy for now)
    const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'admin'
      })
    });
    
    if (!loginResponse.ok) {
      console.error('❌ Failed to authenticate');
      return;
    }
    
    const { token } = await loginResponse.json();
    console.log('✅ Authenticated successfully');
    
    // Test session assignment
    const assignResponse = await fetch('http://localhost:5000/api/sessions/assign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ projectName: 'test-project' })
    });
    
    console.log('📊 Assignment Response Status:', assignResponse.status);
    
    if (assignResponse.ok) {
      const result = await assignResponse.json();
      console.log('✅ Assignment successful:', JSON.stringify(result, null, 2));
    } else {
      const error = await assignResponse.text();
      console.error('❌ Assignment failed:', error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

testAssignment();
