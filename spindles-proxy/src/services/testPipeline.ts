#!/usr/bin/env node
/**
 * Test Processing Pipeline End-to-End
 * Processes all pending spindles through complete pipeline
 * Phase 2.1 - Foundation
 * Task: TS-029-2-1
 *
 * This test:
 * - Processes all pending spindles (60 expected)
 * - Runs pattern analysis + embedding generation
 * - Validates results
 * - Shows comprehensive statistics
 */

import { pool, testConnection, closePool } from '../db/client.js';
import { pipeline, ProcessingPipeline } from './pipeline.js';
import { embeddingGenerator } from '../analyzers/EmbeddingGenerator.js';

async function main() {
  console.log('🧪 Testing Processing Pipeline End-to-End\n');

  try {
    // Test connection
    console.log('🔍 Testing database connection...');
    await testConnection();

    // Initialize embedding model (pre-load to avoid delays)
    console.log('\n📦 Pre-loading embedding model...');
    await embeddingGenerator.initialize();

    // Check initial status
    console.log('\n📊 Initial Status:');
    const initialStatus = await ProcessingPipeline.getProcessingStatus();
    Object.entries(initialStatus).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    const totalPending = initialStatus['pending'] || 0;
    console.log(`\n⚙️  Processing ${totalPending} pending spindles...\n`);

    // Process all spindles
    const stats = await pipeline.processAll();

    // Show results
    console.log('\n' + '='.repeat(60));
    console.log('📊 Pipeline Execution Summary');
    console.log('='.repeat(60));
    console.log(`  Total processed:    ${stats.totalProcessed}`);
    console.log(`  Successful:         ${stats.successful} (${((stats.successful / stats.totalProcessed) * 100).toFixed(1)}%)`);
    console.log(`  Failed:             ${stats.failed}`);
    console.log(`  Average duration:   ${stats.averageDuration.toFixed(0)}ms per spindle`);
    console.log(`  Total patterns:     ${stats.totalPatterns}`);
    console.log(`  Patterns/spindle:   ${(stats.totalPatterns / stats.successful).toFixed(1)}`);
    console.log('='.repeat(60));

    // Final status
    console.log('\n📊 Final Status:');
    const finalStatus = await ProcessingPipeline.getProcessingStatus();
    Object.entries(finalStatus).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    // Detailed validation
    console.log('\n📊 Detailed Validation:');

    // Pattern distribution
    const patternDist = await pool.query(`
      SELECT pattern_type, COUNT(*) as count
      FROM reasoning_patterns
      GROUP BY pattern_type
      ORDER BY count DESC
    `);

    console.log('\n  Pattern Distribution:');
    patternDist.rows.forEach(row => {
      console.log(`    ${row.pattern_type.padEnd(20)} ${row.count}`);
    });

    // Embedding coverage
    const embeddingStats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(embedding) as with_embedding,
        COUNT(*) - COUNT(embedding) as without_embedding
      FROM spindles
    `);

    const embStats = embeddingStats.rows[0];
    const coverage = (embStats.with_embedding / embStats.total * 100).toFixed(1);
    console.log('\n  Embedding Coverage:');
    console.log(`    Total spindles:      ${embStats.total}`);
    console.log(`    With embeddings:     ${embStats.with_embedding} (${coverage}%)`);
    console.log(`    Without embeddings:  ${embStats.without_embedding}`);

    // Processing status breakdown
    const statusBreakdown = await pool.query(`
      SELECT
        model,
        processing_status,
        COUNT(*) as count
      FROM spindles
      GROUP BY model, processing_status
      ORDER BY model, processing_status
    `);

    console.log('\n  Status by Model:');
    statusBreakdown.rows.forEach(row => {
      const modelShort = row.model.includes('sonnet') ? 'Sonnet' : 'Opus';
      console.log(`    ${modelShort.padEnd(8)} ${row.processing_status.padEnd(10)} ${row.count}`);
    });

    // Performance metrics
    const perfMetrics = await pool.query(`
      SELECT
        AVG(content_length) as avg_content_length,
        AVG(thinking_duration_ms) as avg_thinking_duration
      FROM spindles
      WHERE processing_status = 'done'
    `);

    const perf = perfMetrics.rows[0];
    console.log('\n  Performance Metrics:');
    console.log(`    Avg content length:     ${Math.round(perf.avg_content_length)} chars`);
    console.log(`    Avg thinking duration:  ${Math.round(perf.avg_thinking_duration)}ms`);

    console.log('\n✅ Pipeline test complete!');
    console.log('\n📝 REAL DATA ONLY - Processed all real spindles from database');

    // Success criteria
    console.log('\n🎯 Success Criteria Validation:');
    const allProcessed = finalStatus['done'] === stats.totalProcessed;
    const highSuccessRate = stats.successful / stats.totalProcessed >= 0.95;
    const patternsDetected = stats.totalPatterns > 0;
    const embeddingsGenerated = embStats.with_embedding > 0;

    console.log(`  ✅ All spindles processed: ${allProcessed ? 'PASS' : 'FAIL'}`);
    console.log(`  ✅ Success rate >95%: ${highSuccessRate ? 'PASS' : 'FAIL'}`);
    console.log(`  ✅ Patterns detected: ${patternsDetected ? 'PASS' : 'FAIL'}`);
    console.log(`  ✅ Embeddings generated: ${embeddingsGenerated ? 'PASS' : 'FAIL'}`);

  } catch (err) {
    console.error('\n💥 Test failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
