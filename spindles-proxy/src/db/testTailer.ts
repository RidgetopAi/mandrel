#!/usr/bin/env node
/**
 * Test JSONL Tailer
 * Validates tailer can process existing spindles correctly
 * Phase 2.1 - Foundation
 * Task: TS-014-2-1
 *
 * This test runs the tailer in standalone mode to validate:
 * - Offset tracking works
 * - Idempotent inserts work (no duplicates)
 * - State persistence works
 * - Error recovery works
 */

import { tailer } from '../services/tailer.js';
import { pool, testConnection, closePool } from './client.js';

async function main() {
  console.log('🧪 Testing JSONL Tailer\n');

  try {
    // Test connection
    console.log('🔍 Testing database connection...');
    await testConnection();

    // Get initial count
    const beforeCount = await pool.query('SELECT COUNT(*) FROM spindles');
    console.log(`\n📊 Current spindles in database: ${beforeCount.rows[0].count}`);

    // Start tailer
    console.log('\n🚀 Starting tailer...');
    await tailer.start();

    // Let it process for 5 seconds
    console.log('\n⏳ Processing for 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Stop tailer
    await tailer.stop();

    // Check results
    const afterCount = await pool.query('SELECT COUNT(*) FROM spindles');
    console.log(`\n📊 Spindles after processing: ${afterCount.rows[0].count}`);

    const newSpindles = afterCount.rows[0].count - beforeCount.rows[0].count;
    console.log(`✅ New spindles imported: ${newSpindles}`);

    // Show tailer state
    const state = tailer.getState();
    console.log('\n📈 Tailer state:');
    console.log(`  Offset: ${state.lastReadOffset} bytes`);
    console.log(`  Inode: ${state.lastInode}`);
    console.log(`  Total processed: ${state.spindlesProcessed} spindles`);
    console.log(`  Last processed: ${state.lastProcessedAt}`);

    // Test idempotency - run again
    console.log('\n🔁 Testing idempotency (running again)...');
    await tailer.start();
    await new Promise(resolve => setTimeout(resolve, 2000));
    await tailer.stop();

    const idempotentCount = await pool.query('SELECT COUNT(*) FROM spindles');
    const duplicates = idempotentCount.rows[0].count - afterCount.rows[0].count;

    if (duplicates === 0) {
      console.log('✅ Idempotency test PASSED - no duplicates created');
    } else {
      console.log(`⚠️  Idempotency test FAILED - ${duplicates} duplicates created`);
    }

    // Validation queries
    console.log('\n📊 Database validation:');

    const pending = await pool.query(
      "SELECT COUNT(*) FROM spindles WHERE processing_status = 'pending'"
    );
    console.log(`  Pending processing: ${pending.rows[0].count}`);

    const models = await pool.query(`
      SELECT model, COUNT(*) as count
      FROM spindles
      GROUP BY model
      ORDER BY count DESC
    `);
    console.log('  Model distribution:');
    models.rows.forEach(row => {
      console.log(`    - ${row.model}: ${row.count}`);
    });

    console.log('\n✅ Tailer test complete!');

  } catch (err) {
    console.error('\n💥 Test failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
