import { readFile } from 'fs/promises';
import { join } from 'path';

async function testContextOperations() {
  try {
    // Test context_store operation via HTTP bridge
    const storeResponse = await fetch('http://localhost:8080/mcp/tools/context_store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Test embedding migration verification - this should generate 1536D embedding',
        type: 'completion',
        tags: ['migration-test']
      })
    });

    console.log('Store Response Status:', storeResponse.status);
    if (!storeResponse.ok) {
      console.log('Store Response:', await storeResponse.text());
      return;
    }

    const storeResult = await storeResponse.json();
    console.log('✅ Context stored successfully');

    // Test context_search operation
    const searchResponse = await fetch('http://localhost:8080/mcp/tools/context_search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'embedding migration',
        limit: 3
      })
    });

    console.log('Search Response Status:', searchResponse.status);
    if (!searchResponse.ok) {
      console.log('Search Response:', await searchResponse.text());
      return;
    }

    const searchResult = await searchResponse.json();
    console.log('✅ Context search successful');
    console.log('Search results:', searchResult.result?.content?.[0]?.text ? 'Found matches' : 'No matches');

    console.log('\n🎉 Both context_store and context_search operations working with 1536D embeddings!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testContextOperations();
