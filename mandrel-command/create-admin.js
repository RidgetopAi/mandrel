const bcrypt = require('bcrypt');
const { Pool } = require('pg');

async function createAdminUser() {
  // Try different common PostgreSQL configurations
  const configs = [
    { user: 'ridgetop', password: 'password', database: 'aidis_development' },
    { user: 'ridgetop', password: '', database: 'aidis_development' },
    { user: 'postgres', password: 'postgres', database: 'aidis' },
    { user: process.env.DB_USER || 'ridgetop', password: process.env.DB_PASSWORD || 'password', database: process.env.DB_NAME || 'aidis_development' }
  ];

  for (const config of configs) {
    try {
      console.log(`Trying connection with user: ${config.user}, database: ${config.database}`);
      
      const pool = new Pool({
        host: 'localhost',
        port: 5432,
        ...config
      });

      // Test connection
      await pool.query('SELECT 1');
      console.log('✅ Database connection successful!');

      // Check if admin user exists
      const userCheck = await pool.query('SELECT username FROM admin_users WHERE username = $1', ['admin']);
      
      if (userCheck.rows.length > 0) {
        console.log('✅ Admin user already exists!');
        console.log('Try logging in with: admin / admin123!');
        await pool.end();
        return;
      }

      // Create admin user
      const hashedPassword = await bcrypt.hash('admin123!', 12);
      const userId = require('crypto').randomUUID();

      await pool.query(`
        INSERT INTO admin_users (id, username, email, password_hash, role, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      `, [userId, 'admin', 'admin@aidis.local', hashedPassword, 'admin']);

      console.log('✅ Admin user created successfully!');
      console.log('Login credentials:');
      console.log('  Username: admin');
      console.log('  Password: admin123!');

      await pool.end();
      return;

    } catch (error) {
      console.log(`❌ Failed with ${config.user}: ${error.message}`);
      continue;
    }
  }

  console.log('❌ Could not connect to database with any configuration');
  console.log('Please check your PostgreSQL setup and credentials');
}

createAdminUser().catch(console.error);
