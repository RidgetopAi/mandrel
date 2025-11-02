#!/usr/bin/env node
/**
 * Reprocess All Spindles with 1536-dim Embeddings
 * Regenerates embeddings for all spindles with new gte-large model
 * Phase 2.1 - Critical Fix
 */

import { pool, testConnection, closePool } from '../db/client.js';
import { embeddingGenerator } from '../analyzers/EmbeddingGenerator.js';

async function main() {
  console.log('🔄 Reprocessing All Spindles with 1536-dim Embeddings\n');

  try {
    // Test connection
    console.log('🔍 Testing database connection...');
    await testConnection();

    // Get all spindles
    const spindles = await pool.query(
      'SELECT id, content FROM spindles ORDER BY captured_at ASC'
    );

    console.log(`\n📊 Found ${spindles.rows.length} spindles to reprocess`);

    // Initialize model
    console.log('\n📦 Loading gte-large embedding model...');
    await embeddingGenerator.initialize();

    // Process all spindles
    console.log('\n⚙️  Reprocessing embeddings...\n');

    let processed = 0;
    let errors = 0;
    const startTime = Date.now();

    for (const spindle of spindles.rows) {
      try {
        await embeddingGenerator.generateAndSave(spindle.id, spindle.content);
        processed++;

        if (processed % 10 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`  Progress: ${processed}/${spindles.rows.length} (${elapsed}s)`);
        }
      } catch (err) {
        console.error(`  ❌ Failed: ${spindle.id.substring(0, 8)}`);
        errors++;
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const avgTime = (Date.now() - startTime) / spindles.rows.length;

    console.log(`\n✅ Reprocessing complete!`);
    console.log(`   Processed: ${processed}/${spindles.rows.length}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total time: ${totalTime}s`);
    console.log(`   Average: ${avgTime.toFixed(0)}ms per spindle`);

    // Validate
    console.log('\n📊 Validation:');
    const validation = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(embedding) as with_embedding,
        COUNT(*) - COUNT(embedding) as without_embedding
      FROM spindles
    `);

    const stats = validation.rows[0];
    const coverage = ((stats.with_embedding / stats.total) * 100).toFixed(1);

    console.log(`   Total spindles: ${stats.total}`);
    console.log(`   With 1536-dim embeddings: ${stats.with_embedding} (${coverage}%)`);
    console.log(`   Missing embeddings: ${stats.without_embedding}`);

    if (stats.with_embedding === stats.total) {
      console.log('\n✅ SUCCESS: All spindles have 1536-dim embeddings!');
      console.log('   Compatible with Mandrel vector space');
    } else {
      console.log(`\n⚠️  WARNING: ${stats.without_embedding} spindles missing embeddings`);
    }

  } catch (err) {
    console.error('\n💥 Reprocessing failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
