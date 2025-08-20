import { Pool } from 'pg';

// Test with postgres user first
const db = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'aidis_development',
  port: 5432,
});

async function testPostgres() {
  try {
    console.log('🔄 Testing with postgres user...');
    
    const client = await db.connect();
    console.log('✅ Connection successful!');
    
    // Check what users exist
    const users = await client.query(`
      SELECT rolname, rolsuper, rolcreatedb 
      FROM pg_roles 
      WHERE rolname IN ('postgres', 'ridgetop')
      ORDER BY rolname;
    `);
    console.log('👥 Database users:');
    users.rows.forEach(user => {
      console.log(`   ${user.rolname}: super=${user.rolsuper}, createdb=${user.rolcreatedb}`);
    });
    
    client.release();
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await db.end();
  }
}

testPostgres();
