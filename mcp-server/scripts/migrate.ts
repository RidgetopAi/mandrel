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

/**
 * Consolidated golden-image baseline (rebaseline, 2026-06-11).
 *
 * 000_baseline_schema.sql is a cleaned schema-only snapshot of PROD and is the
 * single source of truth for a FRESH database's schema. The historical
 * incremental migrations (001..BASELINE_THROUGH) are RETAINED in the tree for
 * history but no longer reproduce the real schema, so on a fresh DB they are
 * STAMPED as already-applied (never re-run) once the baseline is installed.
 *
 * Migrations numbered ABOVE BASELINE_THROUGH (e.g. 043+) are NOT folded into the
 * baseline and continue to run normally on top of it — both on fresh builds and
 * on existing (already-baselined) instances.
 */
const BASELINE_FILE = '000_baseline_schema.sql';
const BASELINE_THROUGH = 42; // highest migration number folded into the baseline

class MigrationRunner {
  private migrationsPath: string;

  constructor() {
    this.migrationsPath = path.join(__dirname, '..', 'database', 'migrations');
  }

  /**
   * Whether the _aidis_migrations tracking table already exists. Its absence is
   * how we detect a brand-new, never-provisioned database (fresh-volume boot).
   */
  private async migrationsTableExists(): Promise<boolean> {
    const result = await db.query(
      "SELECT to_regclass('public._aidis_migrations') IS NOT NULL AS exists"
    );
    return result.rows[0]?.exists === true;
  }

  /**
   * Create migrations tracking table if it doesn't exist.
   *
   * NOTE: on a fresh DB the baseline (000_baseline_schema.sql) creates the real
   * prod _aidis_migrations (with its sequence/PK/unique/index) itself, so this
   * is only used on the NON-fresh path (existing DBs that predate the baseline,
   * or as a no-op safety net). The IF NOT EXISTS guards keep it harmless.
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
   * Record a migration filename as applied WITHOUT running its SQL (used to
   * "stamp" the historical incremental migrations after the consolidated
   * baseline has been installed on a fresh DB, so they never run on top of it).
   */
  private async stampMigration(migration: Migration): Promise<void> {
    await db.query(
      `INSERT INTO _aidis_migrations (filename, migration_number)
       VALUES ($1, $2)
       ON CONFLICT (filename) DO NOTHING`,
      [migration.filename, migration.number]
    );
  }

  /**
   * Fresh-DB rebaseline path: apply the consolidated baseline, then stamp the
   * baseline itself plus every historical migration up to BASELINE_THROUGH as
   * already-applied. Returns the set of filenames now considered applied so the
   * caller can skip them in the normal pending loop.
   */
  private async applyBaseline(allMigrations: Migration[]): Promise<Set<string>> {
    const baseline = allMigrations.find(m => m.filename === BASELINE_FILE);
    if (!baseline) {
      throw new Error(
        `Fresh database detected but baseline ${BASELINE_FILE} is missing from ` +
        `${this.migrationsPath}. Cannot provision schema.`
      );
    }

    console.log(`🌱 Fresh database detected — installing consolidated baseline: ${BASELINE_FILE}`);
    await db.query(baseline.content);
    console.log(`✅ Baseline schema installed`);

    // The baseline itself creates the real _aidis_migrations table but does not
    // insert its own tracking row, so stamp it now along with the superseded
    // incremental migrations (<= BASELINE_THROUGH).
    const stamped = new Set<string>();
    await this.stampMigration(baseline);
    stamped.add(baseline.filename);

    const superseded = allMigrations.filter(
      m => m.filename !== BASELINE_FILE && m.number <= BASELINE_THROUGH
    );
    for (const m of superseded) {
      await this.stampMigration(m);
      stamped.add(m.filename);
    }
    console.log(
      `📌 Stamped baseline + ${superseded.length} historical migrations ` +
      `(<= ${String(BASELINE_THROUGH).padStart(3, '0')}) as applied.`
    );

    return stamped;
  }

  /**
   * Fresh-DB ONLY: seed the operational `dual_write_config` feature-flag rows.
   *
   * The legacy P2.3 dual-write trigger fires on writes to these 5 tables and, if a
   * table has NO config row, `record_dual_write_failure()` hits an ambiguous
   * `max_failures` and raises — 500-ing the very first write to that table on an
   * otherwise-clean fresh DB. The consolidated baseline carries the table's SCHEMA
   * but not its DATA rows, so we seed them here.
   *
   * Values mirror prod's post-cutover config rows (verified against prod
   * 2026-06-11): all five tables present with enabled=FALSE and emergency_stop=
   * FALSE; every other column uses the table's own DEFAULTs, which already match
   * prod (sync_mode='async', max_failures=5, failure_count=0,
   * performance_threshold_ms=1000). So the dual-write path is fully wired but
   * INERT on a fresh instance — exactly prod's steady state.
   *
   * Idempotent via ON CONFLICT DO NOTHING (PK is table_name). Runs ONLY on the
   * fresh path so existing/already-baselined DBs (whose real rows we must not
   * clobber) are never touched.
   */
  private async seedDualWriteConfig(): Promise<void> {
    const triggerTables = [
      'projects',
      'sessions',
      'contexts',
      'analytics_events',
      'tasks',
    ];

    const result = await db.query(
      `INSERT INTO dual_write_config (table_name, enabled, emergency_stop)
       SELECT t, FALSE, FALSE
       FROM unnest($1::text[]) AS t
       ON CONFLICT (table_name) DO NOTHING`,
      [triggerTables]
    );

    console.log(
      `🌱 Seeded dual_write_config (${result.rowCount}/${triggerTables.length} ` +
      `rows inserted; enabled=FALSE, emergency_stop=FALSE) — dual-write path inert on fresh DB.`
    );
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

      // Detect a fresh (never-provisioned) database BEFORE creating any tracking
      // table, so we can install the consolidated baseline on the fresh path.
      const isFreshDb = !(await this.migrationsTableExists());

      // Get all migration files up front (needed by both the fresh and normal paths).
      const allMigrations = await this.getMigrationFiles();

      if (isFreshDb) {
        // Fresh DB: install the prod-snapshot baseline and stamp the historical
        // incremental migrations (000..BASELINE_THROUGH) as already-applied.
        await this.applyBaseline(allMigrations);

        // Fresh DB: seed operational dual_write_config rows so the legacy P2.3
        // dual-write trigger is inert (not absent) and the first write to each of
        // the 5 trigger tables does not 500. Fresh path ONLY — never touches
        // existing/already-baselined DBs.
        await this.seedDualWriteConfig();
      } else {
        // Existing DB: ensure the tracking table exists (no-op if it already
        // does) and proceed with the normal incremental path. An already-
        // baselined DB will have 000..BASELINE_THROUGH stamped, so they're skipped.
        await this.createMigrationsTable();
      }

      // Get list of already applied migrations (now includes anything just stamped).
      const appliedMigrations = await this.getAppliedMigrations();

      console.log(`📋 Found ${allMigrations.length} migration files`);
      console.log(`📋 ${appliedMigrations.size} migrations already applied\n`);

      // Find pending migrations (e.g. 043+ on a fresh build, or any genuinely
      // unapplied file on an existing instance).
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
