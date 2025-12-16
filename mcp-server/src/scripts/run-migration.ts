import { db } from '../config/database.js';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  const migrationPath = path.join(__dirname, '../migrations/2025_09_09_enforce_session_project_fk.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  try {
    await db.query(sql);
    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
  process.exit(0);
}

runMigration();
