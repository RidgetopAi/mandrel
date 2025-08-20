import { Pool } from 'pg';

// Simple test with direct connection config
const db = new Pool({
  user: 'ridgetop',
  host: 'localhost',
  database: 'aidis_development',
  port: 5432,
});

async function testSimple() {
  try {
    console.log('🔄 Testing simple database connection...');
    
    const client = await db.connect();
    console.log('✅ Connection successful!');
    
    // Test basic query
    const result = await client.query('SELECT NOW() as current_time, current_user, current_database()');
    console.log('⏰ Database time:', result.rows[0].current_time);
    console.log('👤 User:', result.rows[0].current_user);
    console.log('🗃️  Database:', result.rows[0].current_database);
    
    // Test pgvector
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    const vectorTest = await client.query(`SELECT '[0.1,0.2,0.3]'::vector(3) as test_vector`);
    console.log('🔢 Vector test:', vectorTest.rows[0].test_vector);
    
    client.release();
    console.log('🎉 All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await db.end();
  }
}

testSimple();
