const axios = require('axios');

async function testContextAPI() {
    console.log('🔍 Testing Context API Issue...');
    
    try {
        // Step 1: Login to get valid token
        console.log('Step 1: Attempting login...');
        const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
            username: 'admin',
            password: 'admin123!'
        });
        
        if (loginResponse.data.success) {
            const token = loginResponse.data.data.token;
            console.log('✅ Login successful');
            console.log(`Token: ${token.substring(0, 20)}...`);
            
            // Step 2: Test contexts API with valid token
            console.log('\nStep 2: Testing contexts API...');
            const contextResponse = await axios.get('http://localhost:5000/api/contexts', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            console.log('✅ Context API Response:');
            console.log(`Status: ${contextResponse.status}`);
            console.log(`Data: ${JSON.stringify(contextResponse.data, null, 2)}`);
            
        } else {
            console.error('❌ Login failed:', loginResponse.data);
        }
        
    } catch (error) {
        console.error('❌ Error occurred:');
        if (error.response) {
            console.error(`HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            if (error.response.status === 429) {
                console.error('Rate limited - waiting 30 seconds...');
            }
        } else {
            console.error(error.message);
        }
    }
}

// Run the test
testContextAPI();
