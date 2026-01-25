/**
 * Local Model Embedding
 * 
 * Generate embeddings using local Transformers.js model (FREE!).
 */

import { pipeline } from '@xenova/transformers';
import { EmbeddingError, EmbeddingErrorType, EmbeddingVector, RetryConfig } from './types.js';
import { executeWithRetry } from './retry.js';

// Singleton model instance
let localModel: any = null;
const LOCAL_MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

/**
 * Initialize local embedding model (lazy loading)
 */
export async function initializeLocalModel(): Promise<any> {
  if (localModel) {
    return localModel;
  }

  console.log(`🔄 Loading local embedding model: ${LOCAL_MODEL_NAME}`);
  console.log('📦 First run will download model (~25MB), subsequent runs use cached version');
  
  try {
    localModel = await pipeline('feature-extraction', LOCAL_MODEL_NAME);
    console.log('✅ Local embedding model loaded successfully!');
    return localModel;
  } catch (error) {
    const err = error as Error;
    console.error('❌ Failed to load local model:', err);
    throw new Error(`Failed to initialize local embedding model: ${err.message}`);
  }
}

/**
 * Check if local model is loaded
 */
export function isLocalModelLoaded(): boolean {
  return !!localModel;
}

/**
 * Get local model name
 */
export function getLocalModelName(): string {
  return LOCAL_MODEL_NAME;
}

/**
 * Generate embedding using local Transformers.js model with retry logic
 */
export async function generateLocalEmbedding(
  text: string,
  retryConfig: RetryConfig
): Promise<EmbeddingVector> {
  console.log('🏠 Generating LOCAL embedding (FREE!)...');

  return executeWithRetry(async () => {
    const model = await initializeLocalModel();

    try {
      // Generate embedding using the local model
      const result = await model(text, { pooling: 'mean', normalize: true });

      // Extract the embedding array from the tensor
      const embedding = Array.from(result.data as Float32Array);

      // Validate the result
      if (!embedding || embedding.length === 0) {
        throw new EmbeddingError(
          'Local model returned empty embedding',
          EmbeddingErrorType.MODEL_INFERENCE,
          false
        );
      }

      // Check for NaN or invalid values
      const hasInvalidValues = embedding.some(val => !isFinite(val));
      if (hasInvalidValues) {
        throw new EmbeddingError(
          'Local model returned embedding with invalid values (NaN/Infinity)',
          EmbeddingErrorType.MODEL_INFERENCE,
          false
        );
      }

      console.log(`✅ Generated LOCAL embedding (${embedding.length} dimensions)`);

      return {
        embedding,
        dimensions: embedding.length,
        model: `${LOCAL_MODEL_NAME}-local`,
      };
    } catch (error) {
      const err = error as Error;
      if (err instanceof EmbeddingError) {
        throw err;
      }

      // Categorize model inference errors
      const errorMessage = err.message?.toLowerCase() || '';
      let errorType = EmbeddingErrorType.MODEL_INFERENCE;
      let isRetryable = false;

      if (errorMessage.includes('out of memory') || errorMessage.includes('memory')) {
        errorType = EmbeddingErrorType.RESOURCE_EXHAUSTED;
        isRetryable = true;
      } else if (errorMessage.includes('network') || errorMessage.includes('download')) {
        errorType = EmbeddingErrorType.NETWORK_ERROR;
        isRetryable = true;
      }

      throw new EmbeddingError(
        `Local model inference failed: ${err.message}`,
        errorType,
        isRetryable,
        err
      );
    }
  }, 'Local embedding generation', retryConfig);
}
