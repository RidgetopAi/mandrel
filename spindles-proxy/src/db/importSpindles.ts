#!/usr/bin/env node
/**
 * Import Spindles from JSONL to Database
 * Migrates existing Phase 1 spindles to PostgreSQL
 * Phase 2.1 - Foundation
 * Task: TS-009-2-1
 *
 * IMPORTANT: NO MOCK DATA - Only imports real spindles from logs/spindles.jsonl
 *
 * Usage:
 *   npm run import-spindles
 *   npx tsx src/db/importSpindles.ts
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { pool, testConnection, closePool } from './client.js';

const JSONL_FILE = path.join(__dirname, '../../logs/spindles.jsonl');
const LEGACY_SESSION_ID = '00000000-0000-0000-0000-000000000001';

interface SpindleJSONL {
  spindle: {
    id: string;
    sessionId: string | null;
    timestamp: string;
    type: string;
    content: string;
    metadata: {
      model: string;
      startedAt: string;
      confidence?: string;
      tags?: string[];
    };
  };
  capturedAt: string;
}

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function computeDuration(startedAt: string, capturedAt: string): number | null {
  try {
    const start = new Date(startedAt).getTime();
    const end = new Date(capturedAt).getTime();
    return end - start;
  } catch {
    return null;
  }
}

async function loadSpindlesFromJSONL(): Promise<SpindleJSONL[]> {
  console.log(`📂 Reading spindles from: ${JSONL_FILE}`);

  const content = await fs.readFile(JSONL_FILE, 'utf-8');
  const lines = content.trim().split('\n').filter(line => line.trim());

  console.log(`📄 Found ${lines.length} lines in JSONL file`);

  const spindles: SpindleJSONL[] = [];
  let errors = 0;

  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i]);
      spindles.push(parsed);
    } catch (err) {
      console.error(`⚠️  Line ${i + 1} parse error:`, err);
      errors++;
    }
  }

  console.log(`✅ Parsed ${spindles.length} spindles successfully`);
  if (errors > 0) {
    console.log(`⚠️  ${errors} lines failed to parse`);
  }

  return spindles;
}

async function importSpindle(spindle: SpindleJSONL): Promise<void> {
  const { spindle: s, capturedAt } = spindle;

  const contentHash = computeHash(s.content);
  const contentLength = s.content.length;
  const thinkingDuration = computeDuration(s.metadata.startedAt, capturedAt);

  // Use legacy session if sessionId is null (all Phase 1 spindles)
  const sessionId = s.sessionId || LEGACY_SESSION_ID;

  const rawMetadata = {
    confidence: s.metadata.confidence,
    tags: s.metadata.tags,
    startedAt: s.metadata.startedAt,
  };

  await pool.query(
    `INSERT INTO spindles (
      id,
      session_id,
      captured_at,
      content,
      content_hash,
      content_length,
      model,
      thinking_duration_ms,
      processing_status,
      raw_metadata,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (id) DO NOTHING`,
    [
      s.id,
      sessionId,
      capturedAt,
      s.content,
      contentHash,
      contentLength,
      s.metadata.model,
      thinkingDuration,
      'pending', // Ready for processing
      JSON.stringify(rawMetadata),
      capturedAt,
      capturedAt,
    ]
  );
}

async function main() {
  console.log('🚀 Spindles Import from JSONL\n');

  try {
    // Test connection
    console.log('🔍 Testing database connection...');
    await testConnection();

    // Verify legacy session exists
    console.log('\n🔍 Verifying legacy session exists...');
    const sessionCheck = await pool.query(
      'SELECT id, title FROM sessions WHERE id = $1',
      [LEGACY_SESSION_ID]
    );

    if (sessionCheck.rows.length === 0) {
      console.error('❌ Legacy session not found!');
      console.error('   Run migration 007_create_legacy_session.sql first');
      process.exit(1);
    }

    console.log(`✅ Legacy session found: ${sessionCheck.rows[0].title}`);

    // Load spindles from JSONL
    console.log('\n📚 Loading spindles from JSONL...');
    const spindles = await loadSpindlesFromJSONL();

    if (spindles.length === 0) {
      console.log('⚠️  No spindles to import');
      return;
    }

    // Import spindles
    console.log(`\n⚙️  Importing ${spindles.length} spindles...`);
    let imported = 0;
    let skipped = 0;

    for (const spindle of spindles) {
      try {
        const result = await pool.query('SELECT id FROM spindles WHERE id = $1', [spindle.spindle.id]);
        if (result.rows.length > 0) {
          skipped++;
        } else {
          await importSpindle(spindle);
          imported++;
        }

        if ((imported + skipped) % 10 === 0) {
          console.log(`  Progress: ${imported} imported, ${skipped} skipped`);
        }
      } catch (err) {
        console.error(`❌ Failed to import spindle ${spindle.spindle.id}:`, err);
      }
    }

    console.log(`\n✨ Import complete!`);
    console.log(`  ✅ Imported: ${imported} spindles`);
    console.log(`  ⏭️  Skipped: ${skipped} spindles (already exist)`);

    // Validation queries
    console.log('\n📊 Validation:');

    const totalCount = await pool.query('SELECT COUNT(*) FROM spindles');
    console.log(`  Total spindles in database: ${totalCount.rows[0].count}`);

    const legacyCount = await pool.query(
      'SELECT COUNT(*) FROM spindles WHERE session_id = $1',
      [LEGACY_SESSION_ID]
    );
    console.log(`  Spindles linked to legacy session: ${legacyCount.rows[0].count}`);

    const modelDist = await pool.query(`
      SELECT model, COUNT(*) as count
      FROM spindles
      GROUP BY model
      ORDER BY count DESC
    `);
    console.log('\n  Model distribution:');
    modelDist.rows.forEach(row => {
      console.log(`    - ${row.model}: ${row.count}`);
    });

    const statusDist = await pool.query(`
      SELECT processing_status, COUNT(*) as count
      FROM spindles
      GROUP BY processing_status
      ORDER BY count DESC
    `);
    console.log('\n  Processing status:');
    statusDist.rows.forEach(row => {
      console.log(`    - ${row.processing_status}: ${row.count}`);
    });

    console.log('\n✅ All spindles imported successfully!');
    console.log('\n📝 REAL DATA ONLY - No mock data used');
    console.log(`   Source: ${JSONL_FILE}`);

  } catch (err) {
    console.error('\n💥 Import failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
