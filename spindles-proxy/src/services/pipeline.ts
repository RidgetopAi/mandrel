/**
 * Processing Pipeline - Orchestrates Analysis of Spindles
 * Phase 2.1 - Foundation
 * Tasks: TS-027, TS-028, TS-029
 *
 * Pipeline stages:
 * 1. Claim spindle (SKIP LOCKED for concurrency)
 * 2. Pattern analysis (8 patterns)
 * 3. Embedding generation (384-dim vectors)
 * 4. Mark as 'done'
 *
 * Design (Oracle guidance):
 * - Postgres SKIP LOCKED instead of Redis/BullMQ
 * - Inline processing (no worker processes needed at current scale)
 * - Error recovery with status tracking
 * - Idempotent operations
 */

import { pool } from '../db/client.js';
import { patternAnalyzer } from '../analyzers/PatternAnalyzer.js';
import { embeddingGenerator } from '../analyzers/EmbeddingGenerator.js';

export interface ProcessingResult {
  spindleId: string;
  patternsDetected: number;
  embeddingGenerated: boolean;
  duration: number;
  status: 'success' | 'error';
  error?: string;
}

export interface PipelineStats {
  totalProcessed: number;
  successful: number;
  failed: number;
  averageDuration: number;
  totalPatterns: number;
}

export class ProcessingPipeline {
  private stats: PipelineStats = {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    averageDuration: 0,
    totalPatterns: 0,
  };

  /**
   * Claim next pending spindle atomically
   * Uses SKIP LOCKED to prevent race conditions
   */
  async claimNext(): Promise<any | null> {
    const client = await pool.connect();

    try {
      const result = await client.query(`
        UPDATE spindles
        SET processing_status = 'running', updated_at = now()
        WHERE id = (
          SELECT id FROM spindles
          WHERE processing_status IN ('pending', 'error')
          ORDER BY captured_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `);

      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  /**
   * Process a single spindle through all analyzers
   */
  async processSpindle(spindle: any): Promise<ProcessingResult> {
    const startTime = Date.now();

    try {
      // Stage 1: Pattern Analysis
      console.log(`  [1/2] Analyzing patterns for ${spindle.id.substring(0, 8)}...`);
      const patternResult = await patternAnalyzer.analyzeAndSave(spindle.id, spindle.content);
      console.log(`        ✅ Found ${patternResult.patterns.length} patterns`);

      // Stage 2: Embedding Generation
      console.log(`  [2/2] Generating embedding...`);
      await embeddingGenerator.generateAndSave(spindle.id, spindle.content);
      console.log(`        ✅ Embedding saved`);

      // Mark as done
      await pool.query(
        `UPDATE spindles
         SET processing_status = 'done', processed_at = now(), updated_at = now()
         WHERE id = $1`,
        [spindle.id]
      );

      const duration = Date.now() - startTime;

      return {
        spindleId: spindle.id,
        patternsDetected: patternResult.patterns.length,
        embeddingGenerated: true,
        duration,
        status: 'success',
      };
    } catch (err: any) {
      // Mark as error
      await pool.query(
        `UPDATE spindles
         SET processing_status = 'error',
             processing_error = $2,
             updated_at = now()
         WHERE id = $1`,
        [spindle.id, err.message]
      );

      const duration = Date.now() - startTime;

      return {
        spindleId: spindle.id,
        patternsDetected: 0,
        embeddingGenerated: false,
        duration,
        status: 'error',
        error: err.message,
      };
    }
  }

  /**
   * Process all pending spindles
   */
  async processAll(maxSpindles?: number): Promise<PipelineStats> {
    console.log('🚀 Starting Processing Pipeline\n');

    // Reset stats
    this.stats = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      averageDuration: 0,
      totalPatterns: 0,
    };

    let totalDuration = 0;
    let processed = 0;

    while (true) {
      // Check max limit
      if (maxSpindles && processed >= maxSpindles) {
        console.log(`\n⚠️  Reached max spindles limit (${maxSpindles})`);
        break;
      }

      // Claim next spindle
      const spindle = await this.claimNext();

      if (!spindle) {
        console.log('\n✅ No more pending spindles');
        break;
      }

      processed++;
      console.log(`\n[${processed}] Processing ${spindle.id.substring(0, 8)}... (${spindle.model.includes('sonnet') ? 'Sonnet' : 'Opus'})`);

      // Process spindle
      const result = await this.processSpindle(spindle);

      // Update stats
      this.stats.totalProcessed++;
      totalDuration += result.duration;

      if (result.status === 'success') {
        this.stats.successful++;
        this.stats.totalPatterns += result.patternsDetected;
        console.log(`  ✅ Success in ${result.duration}ms`);
      } else {
        this.stats.failed++;
        console.log(`  ❌ Failed: ${result.error}`);
      }
    }

    // Calculate average
    this.stats.averageDuration = this.stats.totalProcessed > 0
      ? totalDuration / this.stats.totalProcessed
      : 0;

    return this.stats;
  }

  /**
   * Get current statistics
   */
  getStats(): PipelineStats {
    return { ...this.stats };
  }

  /**
   * Get processing status from database
   */
  static async getProcessingStatus(): Promise<any> {
    const result = await pool.query(`
      SELECT
        processing_status,
        COUNT(*) as count
      FROM spindles
      GROUP BY processing_status
      ORDER BY processing_status
    `);

    const status: any = {};
    result.rows.forEach(row => {
      status[row.processing_status] = parseInt(row.count);
    });

    return status;
  }

  /**
   * Reset all spindles to pending (for reprocessing)
   */
  static async resetAll(): Promise<number> {
    const result = await pool.query(`
      UPDATE spindles
      SET processing_status = 'pending',
          processing_error = NULL,
          processed_at = NULL
      WHERE processing_status IN ('done', 'error', 'running')
      RETURNING id
    `);

    return result.rowCount || 0;
  }
}

export const pipeline = new ProcessingPipeline();
