import { Pool } from 'pg';

// Test connection to postgres database first (not aidis_development)
const db = new Pool({
  user: 'ridgetop',
  host: 'localhost',
  database: 'postgres',  // Connect to main postgres database
  password: 'bandy',
  port: 5432,
});

async function debugConnection() {
  try {
    console.log('🔄 Testing connection to postgres database...');
    
    const client = await db.connect();
    console.log('✅ Connection successful!');
    
    // Check what databases exist
    const databases = await client.query(`
      SELECT datname FROM pg_database 
      WHERE datname NOT IN ('template0', 'template1')
      ORDER BY datname;
    `);
    console.log('🗃️  Databases:');
    databases.rows.forEach(db => console.log(`   ${db.datname}`));
    
    // Check what users exist
    const users = await client.query(`
      SELECT rolname, rolsuper FROM pg_roles 
      WHERE rolname IN ('postgres', 'ridgetop')
      ORDER BY rolname;
    `);
    console.log('👥 Users:');
    users.rows.forEach(user => console.log(`   ${user.rolname} (super: ${user.rolsuper})`));
    
    client.release();
    
  } catch (error) {
    console.error('❌ Debug test failed:', error.message);
  } finally {
    await db.end();
  }
}

debugConnection();
