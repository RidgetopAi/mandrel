import { EmbeddingService } from './mcp-server/src/services/embedding.js';

async function testEmbeddingService() {
  const service = new EmbeddingService();
  const result = await service.generateEmbedding({ text: 'This is a test string for embedding generation.' });
  console.log('Dimensions:', result.embedding.length);
  console.log('Expected: 1536');
  console.log('Match:', result.embedding.length === 1536 ? '✅' : '❌');
}

testEmbeddingService().catch(console.error);
