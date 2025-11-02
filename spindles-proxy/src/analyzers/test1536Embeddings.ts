#!/usr/bin/env node
/**
 * Test 1536-dim Embedding Generator
 * Validates new nomic-embed-text-v1.5 model
 * Phase 2.1 - Critical Fix
 */

import { pool, testConnection, closePool } from '../db/client.js';
import { embeddingGenerator } from './EmbeddingGenerator.js';

async function main() {
  console.log('🧪 Testing 1536-dim Embedding Generator\n');

  try {
    // Test connection
    console.log('🔍 Testing database connection...');
    await testConnection();

    // Get one spindle for testing
    const result = await pool.query('SELECT id, content FROM spindles LIMIT 1');

    if (result.rows.length === 0) {
      console.log('⚠️  No spindles found');
      return;
    }

    const spindle = result.rows[0];
    console.log(`\n📝 Test spindle: ${spindle.id.substring(0, 8)}...`);
    console.log(`   Content length: ${spindle.content.length} chars`);

    // Initialize model
    console.log('\n📦 Initializing 1536-dim embedding model...');
    console.log('   Model: Xenova/nomic-embed-text-v1.5');
    console.log('   (First run will download model - may take 1-2 minutes)');

    await embeddingGenerator.initialize();

    // Generate embedding
    console.log('\n⚙️  Generating 1536-dim embedding...');
    const startTime = Date.now();
    const embedding = await embeddingGenerator.generate(spindle.content);
    const duration = Date.now() - startTime;

    console.log(`\n✅ Embedding generated in ${duration}ms`);
    console.log(`   Dimensions: ${embedding.length}`);
    console.log(`   First 10 values: [${embedding.slice(0, 10).map(v => v.toFixed(4)).join(', ')}...]`);

    // Calculate norm
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    console.log(`   Vector norm: ${norm.toFixed(6)} (should be ~1.0 if normalized)`);

    // Validate dimensions
    if (embedding.length === 1536) {
      console.log('\n✅ PASS: Embedding has correct 1536 dimensions (matches Mandrel)');
    } else {
      console.log(`\n❌ FAIL: Expected 1536 dimensions, got ${embedding.length}`);
      process.exit(1);
    }

    // Save to database
    console.log('\n💾 Saving to database...');
    await embeddingGenerator.saveEmbedding(spindle.id, embedding);

    // Verify saved
    const verify = await pool.query('SELECT embedding FROM spindles WHERE id = $1', [spindle.id]);
    if (verify.rows[0]?.embedding) {
      console.log('✅ Embedding saved successfully to database');
    } else {
      console.log('❌ Failed to save embedding');
      process.exit(1);
    }

    console.log('\n✅ 1536-dim embedding test complete!');
    console.log('\n📊 Summary:');
    console.log(`   ✅ Model: nomic-embed-text-v1.5`);
    console.log(`   ✅ Dimensions: 1536 (Mandrel compatible)`);
    console.log(`   ✅ Generation time: ${duration}ms`);
    console.log(`   ✅ Database storage: Working`);

  } catch (err) {
    console.error('\n💥 Test failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
