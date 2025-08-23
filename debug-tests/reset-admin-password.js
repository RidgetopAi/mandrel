#!/usr/bin/env node

/**
 * Reset admin password for testing T010
 */

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// Same config as backend
const pool = new Pool({
  user: 'ridgetop',
  host: 'localhost', 
  database: 'aidis_ui_dev',
  password: 'bandy',
  port: 5432,
});

async function resetPassword() {
  try {
    const newPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    const result = await pool.query(
      'UPDATE admin_users SET password_hash = $1 WHERE username = $2 RETURNING username',
      [hashedPassword, 'admin']
    );
    
    if (result.rows.length > 0) {
      console.log(`✅ Password reset for user: ${result.rows[0].username}`);
      console.log(`🔑 New password: ${newPassword}`);
      console.log('🧪 Ready for T010 authentication testing');
    } else {
      console.log('❌ Admin user not found');
    }
    
  } catch (error) {
    console.error('❌ Error resetting password:', error);
  } finally {
    await pool.end();
  }
}

resetPassword();
