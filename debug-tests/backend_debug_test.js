#!/usr/bin/env node

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

// Database configuration matching backend
const dbConfig = {
  user: 'ridgetop',
  host: 'localhost', 
  database: 'aidis_development',
  password: 'bandy',
  port: 5432,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

const JWT_SECRET = 'aidis-secret-key-change-in-production';

async function debugBackendIssues() {
  console.log('🔍 BACKEND DEBUG AGENT - Investigating API Issues');
  console.log('=====================================================');
  
  const pool = new Pool(dbConfig);
  
  try {
    // Test 1: Database Connection
    console.log('\n1️⃣ Testing database connection...');
    const client = await pool.connect();
    console.log('✅ Database connection successful');
    
    // Test 2: Check admin_users table
    console.log('\n2️⃣ Checking admin_users table...');
    const usersResult = await client.query('SELECT id, username, email, role, is_active, created_at FROM admin_users');
    console.log(`✅ Found ${usersResult.rows.length} users:`);
    usersResult.rows.forEach(user => {
      console.log(`   - ${user.username} (${user.role}) - Active: ${user.is_active}`);
    });
    
    // Test 3: Check contexts table
    console.log('\n3️⃣ Checking contexts table...');
    const contextsResult = await client.query('SELECT COUNT(*) as count FROM contexts');
    console.log(`✅ Found ${contextsResult.rows[0].count} contexts in database`);
    
    // Test 4: Check sample context data
    console.log('\n4️⃣ Sample contexts...');
    const sampleContexts = await client.query(`
      SELECT id, project_id, context_type, content, tags, relevance_score, created_at
      FROM contexts 
      ORDER BY created_at DESC 
      LIMIT 3
    `);
    console.log(`✅ Latest contexts:`);
    sampleContexts.rows.forEach(ctx => {
      console.log(`   - ${ctx.context_type}: ${ctx.content.substring(0, 50)}...`);
      console.log(`     Tags: [${ctx.tags ? ctx.tags.join(', ') : 'none'}]`);
    });
    
    // Test 5: Generate a test JWT token
    console.log('\n5️⃣ Generating test JWT token...');
    const testUser = usersResult.rows.find(u => u.username === 'admin');
    if (testUser) {
      const tokenId = require('crypto').randomUUID();
      
      const payload = {
        userId: testUser.id,
        username: testUser.username,
        email: testUser.email,
        role: testUser.role,
        tokenId
      };
      
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
      console.log('✅ Test JWT generated');
      console.log(`   Token: ${token.substring(0, 50)}...`);
      
      // Test token verification
      const decoded = jwt.verify(token, JWT_SECRET);
      console.log('✅ Token verification successful');
      console.log(`   User: ${decoded.username} (${decoded.role})`);
      
      // Test 6: Create session record
      console.log('\n6️⃣ Creating test session...');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      
      await client.query(
        'INSERT INTO user_sessions (user_id, token_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (token_id) DO UPDATE SET expires_at = $3',
        [testUser.id, tokenId, expiresAt]
      );
      console.log('✅ Test session created');
      
      console.log('\n🧪 Manual API test commands:');
      console.log('curl -s -H "Authorization: Bearer ' + token + '" http://localhost:5000/api/contexts/ | head -200');
      console.log('curl -s -H "Authorization: Bearer ' + token + '" http://localhost:5000/api/contexts/stats');
      console.log('curl -s -H "Authorization: Bearer ' + token + '" http://localhost:5000/api/auth/profile');
    }
    
    // Test 7: Check user_sessions table
    console.log('\n7️⃣ Checking active sessions...');
    const sessionsResult = await client.query(`
      SELECT us.*, au.username 
      FROM user_sessions us 
      JOIN admin_users au ON us.user_id = au.id 
      WHERE us.is_active = true AND us.expires_at > NOW()
      ORDER BY us.created_at DESC
      LIMIT 5
    `);
    console.log(`✅ Found ${sessionsResult.rows.length} active sessions`);
    
    client.release();
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
  } finally {
    await pool.end();
  }
}

debugBackendIssues().catch(console.error);
