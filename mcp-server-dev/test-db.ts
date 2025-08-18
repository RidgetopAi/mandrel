import { initializeDatabase, db, closeDatabase } from './src/config/database.js';

async function testDatabase() {
  try {
    console.log('🔄 Testing AIDIS database connection...');
    
    // Initialize and test connection
    await initializeDatabase();
    
    // Test a simple query
    const result = await db.query('SELECT NOW() as current_time');
    console.log('⏰ Database time:', result.rows[0].current_time);
    
    // Test vector capability
    const vectorTest = await db.query(`
      SELECT '[0.1,0.2,0.3]'::vector(3) as test_vector
    `);
    console.log('🔢 Vector test:', vectorTest.rows[0].test_vector);
    
    console.log('🎉 Database connection successful!');
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
  } finally {
    await closeDatabase();
  }
}

testDatabase();
