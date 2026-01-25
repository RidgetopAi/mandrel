#!/usr/bin/env npx tsx
/**
 * Backfill NULL embeddings in the contexts table
 * This script generates embeddings for contexts that don't have them
 */

import pkg from 'pg';
const { Pool } = pkg;
import { EmbeddingService } from '../mcp-server/src/services/embedding.js';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'mandrel',
  user: process.env.DB_USER || 'ridgetop',
});

async function backfillNullEmbeddings() {
  const embeddingService = new EmbeddingService();
  
  try {
    // Find contexts with NULL embeddings
    const result = await pool.query(
      'SELECT id, content FROM contexts WHERE embedding IS NULL ORDER BY created_at DESC'
    );
    
    const nullContexts = result.rows;
    console.log(`📊 Found ${nullContexts.length} contexts with NULL embeddings`);
    
    if (nullContexts.length === 0) {
      console.log('✅ No NULL embeddings to backfill!');
      return;
    }
    
    let successCount = 0;
    let failCount = 0;
    
    for (const context of nullContexts) {
      try {
        console.log(`\n🔄 Processing context ${context.id}...`);
        console.log(`   Content: ${context.content.substring(0, 60)}...`);
        
        // Generate embedding
        const embeddingResult = await embeddingService.generateEmbedding({
          text: context.content.substring(0, 8000) // Limit to max text length
        });
        
        // Validate dimensions
        if (embeddingResult.dimensions !== 1536) {
          console.error(`❌ Wrong dimensions: ${embeddingResult.dimensions} (expected 1536)`);
          failCount++;
          continue;
        }
        
        // Update the database
        const embeddingArray = `[${embeddingResult.embedding.join(',')}]`;
        await pool.query(
          'UPDATE contexts SET embedding = $1::vector WHERE id = $2',
          [embeddingArray, context.id]
        );
        
        console.log(`✅ Successfully updated context ${context.id} with ${embeddingResult.dimensions}D embedding`);
        successCount++;
        
      } catch (error) {
        console.error(`❌ Failed to process context ${context.id}:`, error);
        failCount++;
      }
    }
    
    console.log(`\n📊 Backfill complete!`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   📝 Total: ${nullContexts.length}`);
    
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the script
backfillNullEmbeddings()
  .then(() => {
    console.log('\n✅ Backfill script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Backfill script failed:', error);
    process.exit(1);
  });
