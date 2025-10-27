/**
 * AIDIS Embedding Service
 * 
 * This service converts text content into vector embeddings for semantic search.
 * It handles the magic of turning human language into mathematical vectors that
 * capture semantic meaning.
 * 
 * Supports multiple embedding backends:
 * 1. Local models via Transformers.js (FREE, runs offline!)
 * 2. OpenAI API (production grade, costs money)
 * 3. Mock embeddings (development/testing)
 */

import { pipeline, Pipeline } from '@xenova/transformers';

export interface EmbeddingVector {
  embedding: number[];
  dimensions: number;
  model: string;
}

export interface EmbeddingRequest {
  text: string;
  model?: string;
}

export class EmbeddingService {
  private model: string;
  private dimensions: number;
  private localModel: Pipeline | null = null;
  private localModelName: string = 'Xenova/all-MiniLM-L6-v2'; // 384 dimensions, very fast
  private preferLocal: boolean;

  constructor() {
    this.model = process.env.EMBEDDING_MODEL || 'text-embedding-ada-002';
    this.dimensions = parseInt(process.env.EMBEDDING_DIMENSIONS || '384'); // Default to local model dimensions
    this.preferLocal = process.env.EMBEDDING_PREFER_LOCAL !== 'false'; // Default to local
  }

  /**
   * Initialize local embedding model (lazy loading)
   */
  private async initializeLocalModel(): Promise<Pipeline> {
    if (this.localModel) {
      return this.localModel;
    }

    console.log(`🔄 Loading local embedding model: ${this.localModelName}`);
    console.log('📦 First run will download model (~25MB), subsequent runs use cached version');
    
    try {
      this.localModel = await pipeline('feature-extraction', this.localModelName);
      console.log('✅ Local embedding model loaded successfully!');
      return this.localModel;
    } catch (error) {
      console.error('❌ Failed to load local model:', error);
      throw new Error(`Failed to initialize local embedding model: ${error}`);
    }
  }

  /**
   * Generate vector embedding for text content
   * 
   * Priority order:
   * 1. Local model (if preferLocal=true, which is default)
   * 2. OpenAI API (if available and preferLocal=false)  
   * 3. Mock embeddings (fallback for testing)
   */
  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingVector> {
    const text = request.text.trim();
    
    if (!text) {
      throw new Error('Cannot generate embedding for empty text');
    }

    // Try local model first (if preferred)
    if (this.preferLocal) {
      try {
        return await this.generateLocalEmbedding(text);
      } catch (error) {
        console.warn('⚠️  Local embedding failed, trying alternatives:', error.message);
      }
    }

    // Check if we have a real OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && apiKey !== 'your_openai_api_key_here' && apiKey.startsWith('sk-')) {
      try {
        return await this.generateOpenAIEmbedding(text, apiKey);
      } catch (error) {
        console.warn('⚠️  OpenAI embedding failed, trying alternatives:', error.message);
      }
    }

    // If local wasn't preferred, try it as backup
    if (!this.preferLocal) {
      try {
        return await this.generateLocalEmbedding(text);
      } catch (error) {
        console.warn('⚠️  Local embedding backup failed:', error.message);
      }
    }

    // Final fallback to mock embeddings
    console.log('📝 Using mock embeddings as final fallback');
    return this.generateMockEmbedding(text);
  }

  /**
   * Generate embedding using local Transformers.js model
   */
  private async generateLocalEmbedding(text: string): Promise<EmbeddingVector> {
    console.log('🏠 Generating LOCAL embedding (FREE!)...');
    
    const model = await this.initializeLocalModel();
    
    // Generate embedding using the local model
    const result = await model(text, { pooling: 'mean', normalize: true });
    
    // Extract the embedding array from the tensor
    const embedding = Array.from(result.data as Float32Array);
    
    console.log(`✅ Generated LOCAL embedding (${embedding.length} dimensions)`);
    
    return {
      embedding,
      dimensions: embedding.length,
      model: `${this.localModelName}-local`,
    };
  }

  /**
   * Generate real OpenAI embedding (when API key is available)
   */
  private async generateOpenAIEmbedding(text: string, apiKey: string): Promise<EmbeddingVector> {
    try {
      console.log('🔮 Generating real OpenAI embedding...');
      
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: text,
          model: this.model,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      const embedding = data.data[0].embedding;

      console.log(`✅ Generated real embedding (${embedding.length} dimensions)`);

      return {
        embedding,
        dimensions: embedding.length,
        model: this.model,
      };
    } catch (error) {
      console.warn('⚠️  Real embedding failed, falling back to mock:', error);
      return this.generateMockEmbedding(text);
    }
  }

  /**
   * Generate mock embedding for development/testing
   * 
   * This creates a deterministic vector based on text content.
   * While not semantically meaningful, it's perfect for testing
   * the vector search infrastructure!
   */
  private generateMockEmbedding(text: string): EmbeddingVector {
    console.log('🎭 Generating mock embedding for development...');
    
    // Create a deterministic hash-based embedding
    const embedding = new Array(this.dimensions);
    const textHash = this.simpleHash(text);
    
    // Use different aspects of the text to create varied dimensions
    for (let i = 0; i < this.dimensions; i++) {
      // Create pseudo-random values based on text content and position
      const seed = textHash + i;
      const value = Math.sin(seed * 0.001) * 0.6; // Range roughly [-0.6, 0.6] to leave room for signals
      embedding[i] = value;
    }

    // Add some content-based signals to make similar texts have similar embeddings
    this.addContentSignals(embedding, text);

    console.log(`✅ Generated mock embedding (${this.dimensions} dimensions)`);
    
    return {
      embedding,
      dimensions: this.dimensions,
      model: `${this.model}-mock`,
    };
  }

  /**
   * Add content-based signals to make mock embeddings somewhat meaningful
   */
  private addContentSignals(embedding: number[], text: string): void {
    const words = text.toLowerCase().split(/\s+/);
    
    // Add signals for common development terms
    const signals = {
      'database': [0, 50, 100],
      'postgresql': [1, 51, 101], 
      'mcp': [2, 52, 102],
      'server': [3, 53, 103],
      'typescript': [4, 54, 104],
      'context': [5, 55, 105],
      'embedding': [6, 56, 106],
      'search': [7, 57, 107],
      'vector': [8, 58, 108],
      'agent': [9, 59, 109],
      'error': [10, 60, 110],
      'code': [11, 61, 111],
      'planning': [12, 62, 112],
      'decision': [13, 63, 113],
    };

    // Boost dimensions for words found in text
    words.forEach(word => {
      const positions = signals[word];
      if (positions) {
        positions.forEach(pos => {
          if (pos < embedding.length) {
            embedding[pos] += 0.2; // Boost signal for this concept (keep within [-1,1] range)
          }
        });
      }
    });
  }

  /**
   * Simple hash function for consistent mock embeddings
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Calculate cosine similarity between two embeddings
   * This is used for finding similar contexts
   */
  calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have same dimensions for similarity calculation');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Validate embedding vector format
   */
  validateEmbedding(embedding: number[]): boolean {
    if (!Array.isArray(embedding)) return false;
    if (embedding.length !== this.dimensions) return false;
    
    return embedding.every(val => 
      typeof val === 'number' && 
      !isNaN(val) && 
      isFinite(val) &&
      val >= -1 && val <= 1
    );
  }

  /**
   * Get service configuration info
   */
  getConfig() {
    return {
      model: this.model,
      localModel: this.localModelName,
      dimensions: this.dimensions,
      preferLocal: this.preferLocal,
      hasRealApiKey: !!(process.env.OPENAI_API_KEY && 
                        process.env.OPENAI_API_KEY.startsWith('sk-')),
      localModelLoaded: !!this.localModel,
      mode: this.preferLocal ? 'local' : 
            (process.env.OPENAI_API_KEY?.startsWith('sk-') ? 'openai' : 'mock'),
    };
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();
