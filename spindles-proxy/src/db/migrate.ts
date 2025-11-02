#!/usr/bin/env node
/**
 * Database Migration Runner
 * Executes SQL migrations in order
 * Phase 2.1 - Foundation
 *
 * Usage:
 *   npm run migrate          # Run all migrations
 *   npx tsx src/db/migrate.ts
 */

import fs from 'fs/promises';
import path from 'path';
import { pool, testConnection, closePool } from './client.js';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

interface Migration {
  filename: string;
  sql: string;
}

async function loadMigrations(): Promise<Migration[]> {
  const files = await fs.readdir(MIGRATIONS_DIR);
  const sqlFiles = files
    .filter(f => f.endsWith('.sql'))
    .sort(); // Alphabetical order (001_, 002_, etc.)

  const migrations: Migration[] = [];
  for (const filename of sqlFiles) {
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, filename), 'utf-8');
    migrations.push({ filename, sql });
  }

  return migrations;
}

async function runMigration(migration: Migration): Promise<void> {
  console.log(`\n📄 Running migration: ${migration.filename}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(migration.sql);
    await client.query('COMMIT');
    console.log(`✅ Migration completed: ${migration.filename}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`❌ Migration failed: ${migration.filename}`);
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  console.log('🚀 Spindles Database Migration\n');
  console.log('Target database:', process.env.POSTGRES_DB || 'aidis_production');
  console.log('Host:', process.env.POSTGRES_HOST || 'localhost');

  try {
    // Test connection
    console.log('\n🔍 Testing database connection...');
    await testConnection();

    // Load migrations
    console.log('\n📚 Loading migrations...');
    const migrations = await loadMigrations();
    console.log(`Found ${migrations.length} migrations:`);
    migrations.forEach(m => console.log(`  - ${m.filename}`));

    // Run migrations
    console.log('\n⚙️  Running migrations...');
    for (const migration of migrations) {
      await runMigration(migration);
    }

    console.log('\n✨ All migrations completed successfully!');
    console.log('\n📊 Verifying tables...');

    // Verify tables created
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('sessions', 'spindles', 'analyzer_versions', 'reasoning_patterns', 'decision_metrics', 'complexity_metrics')
      ORDER BY table_name
    `);

    console.log('✅ Tables created:');
    result.rows.forEach(row => console.log(`  - ${row.table_name}`));

    // Check analyzer_versions data
    const versions = await pool.query('SELECT analyzer_name, version FROM analyzer_versions ORDER BY analyzer_name');
    console.log('\n🔧 Analyzer versions initialized:');
    versions.rows.forEach(row => console.log(`  - ${row.analyzer_name}: ${row.version}`));

  } catch (err) {
    console.error('\n💥 Migration failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
