import fs from 'fs';
import path from 'path';
import { db as pool } from './connection';

export async function runMigration(migrationFile: string): Promise<void> {
  const migrationPath = path.join(__dirname, 'migrations', migrationFile);
  
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationFile}`);
  }
  
  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  try {
    console.log(`Running migration: ${migrationFile}`);
    await pool.query(sql);
    console.log(`✅ Migration completed: ${migrationFile}`);
  } catch (error) {
    console.error(`❌ Migration failed: ${migrationFile}`, error);
    throw error;
  }
}

export async function runAllMigrations(): Promise<void> {
  const migrationsDir = path.join(__dirname, 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();
  
  for (const file of migrationFiles) {
    await runMigration(file);
  }
}

// CLI usage
if (require.main === module) {
  const migrationFile = process.argv[2];
  
  if (migrationFile) {
    runMigration(migrationFile).catch(console.error);
  } else {
    runAllMigrations().catch(console.error);
  }
}
