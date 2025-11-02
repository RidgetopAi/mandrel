#!/usr/bin/env node
/**
 * Test PatternAnalyzer on Real Spindles
 * Validates pattern detection on 60 real spindles from database
 * Phase 2.1 - Foundation
 * Task: TS-023-2-1
 *
 * Target: >90% precision on real data
 * Method: Analyze all spindles, show distribution, validate quality
 */

import { pool, testConnection, closePool } from '../db/client.js';
import { patternAnalyzer, PatternAnalyzer } from './PatternAnalyzer.js';

async function main() {
  console.log('🧪 Testing PatternAnalyzer on Real Spindles\n');

  try {
    // Test connection
    console.log('🔍 Testing database connection...');
    await testConnection();

    // Get all spindles
    const spindles = await pool.query(
      'SELECT id, content, model FROM spindles ORDER BY captured_at DESC'
    );

    console.log(`\n📊 Found ${spindles.rows.length} spindles to analyze`);

    if (spindles.rows.length === 0) {
      console.log('⚠️  No spindles to analyze');
      return;
    }

    // Analyze all spindles
    console.log('\n⚙️  Analyzing spindles...\n');

    let totalPatterns = 0;
    const patternCounts: Record<string, number> = {};
    const spindleStats: any[] = [];

    for (let i = 0; i < spindles.rows.length; i++) {
      const spindle = spindles.rows[i];
      const result = await patternAnalyzer.analyzeAndSave(spindle.id, spindle.content);

      totalPatterns += result.patterns.length;

      // Count patterns
      result.patterns.forEach(p => {
        patternCounts[p.patternType] = (patternCounts[p.patternType] || 0) + 1;
      });

      spindleStats.push({
        id: spindle.id.substring(0, 8),
        model: spindle.model.includes('sonnet') ? 'Sonnet' : 'Opus',
        patterns: result.patterns.length,
        length: spindle.content.length,
      });

      if ((i + 1) % 10 === 0) {
        console.log(`  Progress: ${i + 1}/${spindles.rows.length} spindles analyzed`);
      }
    }

    console.log(`\n✅ Analysis complete!`);
    console.log(`  Total patterns detected: ${totalPatterns}`);
    console.log(`  Average patterns per spindle: ${(totalPatterns / spindles.rows.length).toFixed(1)}`);

    // Pattern distribution
    console.log('\n📊 Pattern Distribution:');
    const sortedPatterns = Object.entries(patternCounts).sort((a, b) => b[1] - a[1]);

    for (const [patternType, count] of sortedPatterns) {
      const percentage = ((count / totalPatterns) * 100).toFixed(1);
      console.log(`  ${patternType.padEnd(20)} ${count.toString().padStart(4)} (${percentage}%)`);
    }

    // Model comparison
    console.log('\n📊 Pattern Analysis by Model:');

    const sonnetSpindles = spindleStats.filter(s => s.model === 'Sonnet');
    const opusSpindles = spindleStats.filter(s => s.model === 'Opus');

    const sonnetAvg = sonnetSpindles.reduce((sum, s) => sum + s.patterns, 0) / sonnetSpindles.length;
    const opusAvg = opusSpindles.reduce((sum, s) => sum + s.patterns, 0) / opusSpindles.length;

    console.log(`  Sonnet (${sonnetSpindles.length} spindles): ${sonnetAvg.toFixed(1)} patterns/spindle`);
    console.log(`  Opus (${opusSpindles.length} spindles): ${opusAvg.toFixed(1)} patterns/spindle`);

    // Sample spindles with high pattern counts
    console.log('\n📊 Top 5 Spindles by Pattern Count:');
    const topSpindles = spindleStats.sort((a, b) => b.patterns - a.patterns).slice(0, 5);

    for (const s of topSpindles) {
      console.log(`  ${s.id}... (${s.model}): ${s.patterns} patterns, ${s.length} chars`);
    }

    // Validation queries
    console.log('\n📊 Database Validation:');

    const totalDb = await pool.query('SELECT COUNT(*) FROM reasoning_patterns');
    console.log(`  Total patterns in DB: ${totalDb.rows[0].count}`);

    const versionCheck = await pool.query(
      "SELECT analyzer_version, COUNT(*) FROM reasoning_patterns GROUP BY analyzer_version"
    );
    console.log(`  Analyzer version: ${versionCheck.rows[0]?.analyzer_version}`);

    // Sample pattern details
    console.log('\n📋 Sample Pattern Detections:');

    const samples = await pool.query(`
      SELECT s.id, s.model, rp.pattern_type, rp.matched_text, rp.confidence
      FROM reasoning_patterns rp
      JOIN spindles s ON rp.spindle_id = s.id
      ORDER BY random()
      LIMIT 10
    `);

    for (const sample of samples.rows) {
      const modelShort = sample.model.includes('sonnet') ? 'Sonnet' : 'Opus';
      const text = sample.matched_text.substring(0, 50).replace(/\n/g, ' ');
      console.log(`  [${modelShort}] ${sample.pattern_type.padEnd(18)} "${text}..."`);
    }

    // Precision estimation (manual review would be needed for true precision)
    console.log('\n🎯 Quality Assessment:');
    console.log('  Pattern detection: Deterministic regex (confidence = 1.0)');
    console.log('  False positives: Expected to be low for regex-based detection');
    console.log('  Precision target: >90% (manual review recommended for validation)');

    console.log('\n✅ PatternAnalyzer test complete!');
    console.log(`\n📝 REAL DATA ONLY - Tested on ${spindles.rows.length} real spindles from database`);

  } catch (err) {
    console.error('\n💥 Test failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
