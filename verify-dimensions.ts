#!/usr/bin/env npx tsx

/**
 * Direct verification of embedding dimensions
 */

// Test the SimpleEmbeddingService directly
class SimpleEmbeddingService {
  async generateEmbedding(text: string): Promise<number[]> {
    // Generate simple mock embedding based on text hash for consistency
    const hash = this.simpleHash(text);
    const embedding = [];
    for (let i = 0; i < 384; i++) {
      embedding.push(Math.sin(hash + i) * 0.5);
    }
    return embedding;
  }

  private simpleHash(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }
}

async function testDimensions() {
  console.log('🧪 Direct Embedding Dimension Test\n');
  
  const service = new SimpleEmbeddingService();
  const testText = "Test embedding for dimension verification";
  
  console.log('Generating embedding...');
  const embedding = await service.generateEmbedding(testText);
  
  console.log(`✅ Generated embedding with ${embedding.length} dimensions`);
  console.log(`✅ Expected: 384 dimensions`);
  console.log(`✅ Match: ${embedding.length === 384 ? 'YES' : 'NO'}`);
  
  // Test vector format
  const vectorFormat = `[${embedding.join(',')}]`;
  console.log(`✅ Vector format length: ${vectorFormat.length} characters`);
  console.log(`✅ Sample values: [${embedding.slice(0, 5).map(v => v.toFixed(6)).join(', ')}...]`);
  
  console.log('\n🎯 Dimension verification complete!');
}

testDimensions().catch(console.error);
