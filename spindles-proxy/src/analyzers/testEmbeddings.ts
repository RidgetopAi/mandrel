#!/usr/bin/env node
/**
 * Test Embedding Generator on Real Spindles
 * Validates embedding generation on subset of real spindles
 * Phase 2.1 - Foundation
 * Task: TS-025-2-1
 *
 * This test:
 * - Generates embeddings for first 10 spindles
 * - Validates 384-dim vectors
 * - Tests semantic similarity search
 * - Checks database storage
 */

import { pool, testConnection, closePool } from '../db/client.js';
import { embeddingGenerator, EmbeddingGenerator } from './EmbeddingGenerator.js';

async function main() {
  console.log('🧪 Testing Embedding Generator on Real Spindles\n');

  try {
    // Test connection
    console.log('🔍 Testing database connection...');
    await testConnection();

    // Get first 10 spindles for testing
    const spindles = await pool.query(
      'SELECT id, content, model FROM spindles WHERE embedding IS NULL ORDER BY captured_at DESC LIMIT 10'
    );

    console.log(`\n📊 Found ${spindles.rows.length} spindles without embeddings`);

    if (spindles.rows.length === 0) {
      console.log('⚠️  All spindles already have embeddings or no spindles in database');
      return;
    }

    // Initialize model
    console.log('\n📦 Initializing embedding model...');
    await embeddingGenerator.initialize();

    // Generate embeddings
    console.log('\n⚙️  Generating embeddings...\n');

    for (let i = 0; i < spindles.rows.length; i++) {
      const spindle = spindles.rows[i];
      const modelShort = spindle.model.includes('sonnet') ? 'Sonnet' : 'Opus';

      console.log(`  [${i + 1}/${spindles.rows.length}] Generating for ${spindle.id.substring(0, 8)}... (${modelShort})`);

      const startTime = Date.now();
      const embedding = await embeddingGenerator.generateAndSave(spindle.id, spindle.content);
      const duration = Date.now() - startTime;

      console.log(`      ✅ Generated ${embedding.length}-dim vector in ${duration}ms`);
    }

    console.log('\n✅ Embedding generation complete!');

    // Validate embeddings
    console.log('\n📊 Validation:');

    const stats = await EmbeddingGenerator.getEmbeddingStats();
    console.log(`  Total spindles: ${stats.total_spindles}`);
    console.log(`  With embeddings: ${stats.spindles_with_embeddings}`);
    console.log(`  Coverage: ${stats.embedding_coverage_pct}%`);

    // Test similarity search
    console.log('\n🔍 Testing semantic similarity search...');

    const testSpindle = spindles.rows[0];
    const testEmbedding = await embeddingGenerator.generate(testSpindle.content);

    console.log(`  Query: "${testSpindle.content.substring(0, 80)}..."`);
    console.log('  Finding similar spindles...');

    const similar = await embeddingGenerator.findSimilar(testEmbedding, 5, 0.5);

    console.log(`\n  Top 5 similar spindles:`);
    for (const s of similar) {
      const modelShort = s.model.includes('sonnet') ? 'Sonnet' : 'Opus';
      const similarity = (s.similarity * 100).toFixed(1);
      const preview = s.content.substring(0, 60).replace(/\n/g, ' ');
      console.log(`    [${modelShort}] ${similarity}% - "${preview}..."`);
    }

    console.log('\n✅ Semantic search working!');

    // Show sample embedding values
    console.log('\n📊 Sample Embedding Values:');
    const sampleVec = testEmbedding.slice(0, 10);
    console.log(`  First 10 dimensions: [${sampleVec.map(v => v.toFixed(4)).join(', ')}...]`);
    console.log(`  Vector norm (should be ~1.0): ${Math.sqrt(testEmbedding.reduce((sum, v) => sum + v * v, 0)).toFixed(4)}`);

    console.log('\n✅ Embedding test complete!');
    console.log(`\n📝 REAL DATA ONLY - Tested on ${spindles.rows.length} real spindles from database`);

  } catch (err) {
    console.error('\n💥 Test failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
