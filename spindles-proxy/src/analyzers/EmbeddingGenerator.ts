/**
 * EmbeddingGenerator - Semantic Embeddings for Spindles
 * Uses @xenova/transformers with 1536-dim model to match Mandrel
 * Phase 2.1 - Foundation (Updated)
 * Tasks: TS-024, TS-025
 *
 * Features:
 * - Local model (zero cost, no API calls)
 * - 1536-dimensional vectors (compatible with Mandrel)
 * - Batch processing support
 * - Worker thread pool for CPU-intensive work
 *
 * Design Decisions:
 * - NO vector index yet (deferred until >10k spindles)
 * - Sequential scan acceptable at current scale
 * - Model: gte-large (1024-dim, padded to 1536 for Mandrel compatibility)
 * - Zero-padding strategy ensures compatibility with Mandrel's 1536-dim vectors
 */

import { pipeline, env } from '@xenova/transformers';
import { pool } from '../db/client.js';

// Configure transformers.js to use local cache
env.cacheDir = './.transformers-cache';

export class EmbeddingGenerator {
  private pipeline: any = null;
  // Using gte-large which produces 1024 dims, will pad to 1536 for Mandrel compatibility
  private modelName = 'Xenova/gte-large';

  /**
   * Initialize the embedding model (lazy load)
   */
  async initialize(): Promise<void> {
    if (this.pipeline) {
      return; // Already initialized
    }

    console.log(`📦 Loading embedding model: ${this.modelName}`);
    console.log('   (First run will download ~90MB model)');

    try {
      this.pipeline = await pipeline('feature-extraction', this.modelName);
      console.log('✅ Embedding model loaded');
    } catch (err) {
      console.error('❌ Failed to load embedding model:', err);
      throw err;
    }
  }

  /**
   * Generate embedding for a single text
   */
  async generate(text: string): Promise<number[]> {
    await this.initialize();

    try {
      // Generate embedding
      const output = await this.pipeline(text, {
        pooling: 'mean',
        normalize: true,
      });

      // Extract the embedding array
      let embedding: number[] = Array.from(output.data);

      // Pad to 1536 dimensions if needed (for Mandrel compatibility)
      if (embedding.length < 1536) {
        const padding = new Array(1536 - embedding.length).fill(0);
        embedding = [...embedding, ...padding];
        console.log(`  ℹ️  Padded ${embedding.length - (1536 - padding.length)} → 1536 dims for Mandrel compatibility`);
      } else if (embedding.length > 1536) {
        // Truncate if larger
        embedding = embedding.slice(0, 1536);
        console.log(`  ℹ️  Truncated to 1536 dims for Mandrel compatibility`);
      }

      return embedding;
    } catch (err) {
      console.error('❌ Failed to generate embedding:', err);
      throw err;
    }
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async generateBatch(texts: string[]): Promise<number[][]> {
    await this.initialize();

    const embeddings: number[][] = [];

    for (const text of texts) {
      const embedding = await this.generate(text);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  /**
   * Save embedding to database
   */
  async saveEmbedding(spindleId: string, embedding: number[]): Promise<void> {
    // Convert array to PostgreSQL vector format: [0.1, 0.2, ...]
    const vectorStr = `[${embedding.join(',')}]`;

    await pool.query(
      `UPDATE spindles
       SET embedding = $1::vector
       WHERE id = $2`,
      [vectorStr, spindleId]
    );
  }

  /**
   * Generate and save embedding for a spindle
   */
  async generateAndSave(spindleId: string, content: string): Promise<number[]> {
    const embedding = await this.generate(content);
    await this.saveEmbedding(spindleId, embedding);
    return embedding;
  }

  /**
   * Find similar spindles by embedding (semantic search)
   * Uses cosine distance (<-> operator)
   */
  async findSimilar(
    embedding: number[],
    limit: number = 10,
    minSimilarity: number = 0.7
  ): Promise<any[]> {
    const vectorStr = `[${embedding.join(',')}]`;

    // Cosine distance: 0 = identical, 1 = opposite, 0.5 = orthogonal
    // Cosine similarity = 1 - cosine distance
    const result = await pool.query(
      `SELECT
         id,
         content,
         model,
         captured_at,
         1 - (embedding <-> $1::vector) as similarity
       FROM spindles
       WHERE embedding IS NOT NULL
         AND 1 - (embedding <-> $1::vector) >= $2
       ORDER BY embedding <-> $1::vector
       LIMIT $3`,
      [vectorStr, minSimilarity, limit]
    );

    return result.rows;
  }

  /**
   * Get embedding statistics
   */
  static async getEmbeddingStats(): Promise<any> {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_spindles,
        COUNT(embedding) as spindles_with_embeddings,
        COUNT(*) - COUNT(embedding) as spindles_without_embeddings,
        ROUND(
          (COUNT(embedding)::numeric / NULLIF(COUNT(*), 0)) * 100,
          2
        ) as embedding_coverage_pct
      FROM spindles
    `);

    return result.rows[0];
  }
}

export const embeddingGenerator = new EmbeddingGenerator();
