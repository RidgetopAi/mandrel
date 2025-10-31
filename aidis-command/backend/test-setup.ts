import { initializeDatabase, checkDatabaseHealth, getDatabaseStats, db } from './src/database/connection';

async function testDatabaseSetup() {
  console.log('🧪 Testing AIDIS Command Backend Database Setup...\n');
  
  try {
    // Test 1: Initialize database connection
    console.log('1️⃣ Testing database initialization...');
    await initializeDatabase();
    console.log('✅ Database initialization successful\n');
    
    // Test 2: Check database health
    console.log('2️⃣ Testing database health check...');
    const health = await checkDatabaseHealth();
    console.log('✅ Database health:', JSON.stringify(health, null, 2));
    console.log('');
    
    // Test 3: Get database stats
    console.log('3️⃣ Testing database statistics...');
    const stats = await getDatabaseStats();
    console.log('✅ Database stats:', JSON.stringify(stats, null, 2));
    console.log('');
    
    // Test 4: Test basic query on AIDIS tables
    console.log('4️⃣ Testing AIDIS table access...');
    const client = await db.connect();
    
    // Check if projects table exists and get count
    const projectsResult = await client.query('SELECT COUNT(*) as count FROM projects');
    console.log('✅ Projects table accessible, count:', projectsResult.rows[0].count);
    
    // Check if contexts table exists and get count  
    const contextsResult = await client.query('SELECT COUNT(*) as count FROM contexts');
    console.log('✅ Contexts table accessible, count:', contextsResult.rows[0].count);
    
    client.release();
    console.log('');
    
    console.log('🎉 All database tests passed! Backend is ready for API endpoints.\n');
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

if (process.env.AIDIS_SKIP_DB_TESTS === 'true') {
  console.log('⚠️ Skipping database setup tests (AIDIS_SKIP_DB_TESTS=true).');
} else {
  void testDatabaseSetup();
}
