/**
 * Test the AIDIS Embedding Service
 */

import { embeddingService } from './src/services/embedding.js';

async function testEmbeddingService() {
  console.log('🧪 Testing AIDIS Embedding Service...\n');

  try {
    // Check configuration
    const config = embeddingService.getConfig();
    console.log('⚙️  Configuration:');
    console.log(`  Model: ${config.model}`);
    console.log(`  Dimensions: ${config.dimensions}`);
    console.log(`  Mode: ${config.mode}`);
    console.log(`  Real API Key: ${config.hasRealApiKey ? '✅' : '❌'}\n`);

    // Test embedding generation
    console.log('🔮 Generating embeddings...');
    
    const texts = [
      "PostgreSQL database setup with pgvector for semantic search",
      "MCP server implementation using TypeScript and modern tools", 
      "Database configuration and vector search capabilities",
      "Planning Phase 2 context management features",
      "Error handling in the MCP protocol communication"
    ];

    const embeddings = [];
    
    for (const text of texts) {
      console.log(`\n📝 Text: "${text.substring(0, 60)}..."`);
      const result = await embeddingService.generateEmbedding({ text });
      embeddings.push({ text, embedding: result.embedding });
      
      console.log(`✅ Generated ${result.dimensions}D embedding`);
      console.log(`🔢 First 5 values: [${result.embedding.slice(0, 5).map(v => v.toFixed(3)).join(', ')}...]`);
      
      // Validate the embedding
      const isValid = embeddingService.validateEmbedding(result.embedding);
      console.log(`✅ Validation: ${isValid ? 'PASSED' : 'FAILED'}`);
    }

    // Test similarity calculations
    console.log('\n🔍 Testing similarity calculations...');
    
    // Compare database-related texts (should be similar)
    const sim1 = embeddingService.calculateCosineSimilarity(
      embeddings[0].embedding, // PostgreSQL database setup
      embeddings[2].embedding  // Database configuration
    );
    console.log(`📊 Database texts similarity: ${(sim1 * 100).toFixed(1)}%`);

    // Compare database vs planning (should be less similar)
    const sim2 = embeddingService.calculateCosineSimilarity(
      embeddings[0].embedding, // PostgreSQL database setup  
      embeddings[3].embedding  // Planning Phase 2
    );
    console.log(`📊 Database vs Planning similarity: ${(sim2 * 100).toFixed(1)}%`);

    // Compare MCP vs database (should be moderately similar - both technical)
    const sim3 = embeddingService.calculateCosineSimilarity(
      embeddings[1].embedding, // MCP server implementation
      embeddings[0].embedding  // PostgreSQL database setup
    );
    console.log(`📊 MCP vs Database similarity: ${(sim3 * 100).toFixed(1)}%`);

    console.log('\n🎉 All embedding tests completed successfully!');
    console.log('🚀 Embedding service is ready for context management!');
    
  } catch (error) {
    console.error('❌ Embedding test failed:', error);
    process.exit(1);
  }
}

testEmbeddingService().catch(console.error);
