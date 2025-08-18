import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables like our real app
dotenv.config();

console.log('🔍 Environment check:');
console.log('DATABASE_HOST:', process.env.DATABASE_HOST);
console.log('DATABASE_USER:', process.env.DATABASE_USER);
console.log('DATABASE_NAME:', process.env.DATABASE_NAME);
console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);

// Test with individual config fields
const db1 = new Pool({
  user: process.env.DATABASE_USER,
  host: process.env.DATABASE_HOST,
  database: process.env.DATABASE_NAME,
  password: process.env.DATABASE_PASSWORD,
  port: parseInt(process.env.DATABASE_PORT || '5432'),
});

async function testWithEnv() {
  try {
    console.log('\n🔄 Testing with individual env vars...');
    const client = await db1.connect();
    console.log('✅ Connection successful!');
    
    const result = await client.query('SELECT current_user, current_database()');
    console.log('👤 Connected as:', result.rows[0].current_user);
    console.log('🗃️  Database:', result.rows[0].current_database);
    
    client.release();
    
  } catch (error) {
    console.error('❌ Individual vars test failed:', error.message);
  }
  
  // Test with DATABASE_URL
  if (process.env.DATABASE_URL) {
    try {
      console.log('\n🔄 Testing with DATABASE_URL...');
      const db2 = new Pool({ connectionString: process.env.DATABASE_URL });
      const client = await db2.connect();
      console.log('✅ DATABASE_URL connection successful!');
      
      const result = await client.query('SELECT current_user, current_database()');
      console.log('👤 Connected as:', result.rows[0].current_user);
      console.log('🗃️  Database:', result.rows[0].current_database);
      
      client.release();
      await db2.end();
      
    } catch (error) {
      console.error('❌ DATABASE_URL test failed:', error.message);
    }
  }
  
  await db1.end();
}

testWithEnv();
