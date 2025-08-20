#!/usr/bin/env node

/**
 * AIDIS Database Migration Runner
 * 
 * This script runs SQL migrations in order to set up and update
 * the AIDIS database schema.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, initializeDatabase } from '../src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Migration {
  filename: string;
  content: string;
  number: number;
}

class MigrationRunner {
  private migrationsPath: string;

  constructor() {
    this.migrationsPath = path.join(__dirname, '..', 'database', 'migrations');
  }

  /**
   * Create migrations tracking table if it doesn't exist
   */
  private async createMigrationsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS _aidis_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        migration_number INTEGER NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        checksum VARCHAR(64)
      );
      
      CREATE INDEX IF NOT EXISTS idx_migrations_number 
      ON _aidis_migrations(migration_number);
    `;
    
    await db.query(sql);
    console.log('✅ Migration tracking table ready');
  }

  /**
   * Get list of migration files
   */
  private async getMigrationFiles(): Promise<Migration[]> {
    const files = await fs.readdir(this.migrationsPath);
    const migrations: Migration[] = [];

    for (const filename of files) {
      if (filename.endsWith('.sql')) {
        const filepath = path.join(this.migrationsPath, filename);
        const content = await fs.readFile(filepath, 'utf-8');
        
        // Extract migration number from filename (e.g., "001_create_projects.sql" -> 1)
        const numberMatch = filename.match(/^(\d+)/);
        const number = numberMatch ? parseInt(numberMatch[1]) : 0;
        
        migrations.push({ filename, content, number });
      }
    }

    return migrations.sort((a, b) => a.number - b.number);
  }

  /**
   * Get list of already applied migrations
   */
  private async getAppliedMigrations(): Promise<Set<string>> {
    const result = await db.query(
      'SELECT filename FROM _aidis_migrations ORDER BY migration_number'
    );
    
    return new Set(result.rows.map(row => row.filename));
  }

  /**
   * Apply a single migration
   */
  private async applyMigration(migration: Migration): Promise<void> {
    console.log(`🔄 Applying migration: ${migration.filename}`);
    
    try {
      // Run the migration SQL
      await db.query(migration.content);
      
      // Record in migrations table
      await db.query(
        'INSERT INTO _aidis_migrations (filename, migration_number) VALUES ($1, $2)',
        [migration.filename, migration.number]
      );
      
      console.log(`✅ Applied migration: ${migration.filename}`);
    } catch (error) {
      console.error(`❌ Failed to apply migration: ${migration.filename}`);
      throw error;
    }
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<void> {
    console.log('🚀 Starting AIDIS database migrations...\n');

    try {
      // Initialize database connection
      await initializeDatabase();
      
      // Create migrations tracking table
      await this.createMigrationsTable();
      
      // Get all migrations and applied migrations
      const allMigrations = await this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations();
      
      console.log(`📋 Found ${allMigrations.length} migration files`);
      console.log(`📋 ${appliedMigrations.size} migrations already applied\n`);
      
      // Find pending migrations
      const pendingMigrations = allMigrations.filter(
        migration => !appliedMigrations.has(migration.filename)
      );
      
      if (pendingMigrations.length === 0) {
        console.log('✅ All migrations are up to date!');
        return;
      }
      
      console.log(`🔄 Applying ${pendingMigrations.length} pending migrations:\n`);
      
      // Apply each pending migration
      for (const migration of pendingMigrations) {
        await this.applyMigration(migration);
      }
      
      console.log('\n🎉 All migrations completed successfully!');
      
      // Show final status
      const finalCount = await db.query('SELECT COUNT(*) as count FROM _aidis_migrations');
      console.log(`📊 Total migrations applied: ${finalCount.rows[0].count}`);
      
    } catch (error) {
      console.error('\n❌ Migration failed:', error);
      throw error;
    }
  }
}

// Run migrations if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new MigrationRunner();
  runner.runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { MigrationRunner };
