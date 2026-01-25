#!/usr/bin/env tsx
/**
 * Batch Vector Coordinate Mapping Script
 * 
 * Maps all existing 1536D vectors in the contexts table to 3D coordinates
 * using UMAP dimensionality reduction.
 */

import pkg from 'pg';
const { Pool } = pkg;
import { dimensionalityReductionService } from './src/services/dimensionality-reduction.js';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'mandrel',
  user: 'ridgetop',
});

interface ContextRow {
  id: string;
  embedding: number[];
}

async function mapVectors(batchSize: number = 1000) {
  console.log('🗺️  Starting vector coordinate mapping...\n');

  try {
    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM contexts WHERE embedding IS NOT NULL AND vector_x IS NULL'
    );
    const total = parseInt(countResult.rows[0].total);
    
    if (total === 0) {
      console.log('✅ No vectors to map. All vectors already have coordinates.');
      return;
    }

    console.log(`📊 Found ${total} vectors to map\n`);

    let processed = 0;

    while (processed < total) {
      // Fetch batch of vectors (no OFFSET needed - we filter by vector_x IS NULL)
      const result = await pool.query<ContextRow>(
        `SELECT id, embedding FROM contexts
         WHERE embedding IS NOT NULL AND vector_x IS NULL
         ORDER BY created_at
         LIMIT $1`,
        [batchSize]
      );

      if (result.rows.length === 0) break;

      const batchNum = Math.floor(processed / batchSize) + 1;
      console.log(`\n📦 Processing batch ${batchNum}...`);
      console.log(`   Vectors: ${processed + 1}-${processed + result.rows.length} of ${total}`);

      // Extract vectors and IDs
      const vectors: number[][] = [];
      const ids: string[] = [];

      for (const row of result.rows) {
        // Parse vector from PostgreSQL format (comes as string like "[-0.026,0.034,...]")
        const embedding = typeof row.embedding === 'string'
          ? JSON.parse(row.embedding)
          : row.embedding;

        vectors.push(embedding);
        ids.push(row.id);
      }

      // Reduce to 3D coordinates
      console.log('   🔄 Running UMAP reduction...');
      const coordinates = await dimensionalityReductionService.reduceVectors(vectors, {
        dimensions: 3,
        nNeighbors: 15,
        minDist: 0.1,
        spread: 1.0,
      });

      // Normalize coordinates to [-10, 10] range
      const normalized = dimensionalityReductionService.normalizeCoordinates(coordinates, {
        min: -10,
        max: 10,
      });

      // Update database
      console.log('   💾 Saving coordinates to database...');
      
      for (let i = 0; i < ids.length; i++) {
        await pool.query(
          `UPDATE contexts 
           SET vector_x = $1, 
               vector_y = $2, 
               vector_z = $3, 
               mapping_method = 'umap',
               mapped_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [normalized[i][0], normalized[i][1], normalized[i][2], ids[i]]
        );
      }

      processed += result.rows.length;

      const progress = ((processed / total) * 100).toFixed(1);
      console.log(`   ✅ Batch complete! Progress: ${processed}/${total} (${progress}%)`);
    }

    console.log('\n🎉 Vector mapping complete!\n');
    console.log('📊 Summary:');
    console.log(`   Total vectors mapped: ${processed}`);
    console.log(`   Coordinate range: [-10, 10]`);
    console.log(`   Method: UMAP (3D)`);
    console.log('\n✨ All vectors now have spatial coordinates for visualization!\n');

  } catch (error) {
    console.error('❌ Error mapping vectors:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const batchSize = process.argv[2] ? parseInt(process.argv[2]) : 1000;
  
  console.log('═══════════════════════════════════════════════════');
  console.log('  Vector Coordinate Mapping Script');
  console.log('═══════════════════════════════════════════════════\n');
  
  mapVectors(batchSize)
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

export { mapVectors };
