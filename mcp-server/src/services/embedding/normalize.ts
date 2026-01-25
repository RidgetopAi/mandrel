/**
 * Embedding Normalization
 * 
 * Normalize embeddings to target dimensions with unit normalization.
 */

import { EmbeddingVector } from './types.js';

/**
 * Pad or downsample embeddings so they match the configured dimensionality
 * with unit normalization for proper cosine similarity
 */
export function normalizeEmbedding(rawEmbedding: number[], targetDimensions: number): number[] {
  const target = targetDimensions;
  const source = Array.from(rawEmbedding ?? []);

  if (target <= 0) {
    return source;
  }

  if (source.length === 0) {
    return new Array(target).fill(0);
  }

  // Apply dimension transformation first
  let normalized: number[];

  if (source.length === target) {
    normalized = source;
  } else if (source.length > target) {
    // Downsample: take evenly spaced samples
    const step = source.length / target;
    normalized = new Array<number>(target);
    for (let i = 0; i < target; i++) {
      normalized[i] = source[Math.floor(i * step)];
    }
  } else {
    // Upsample: zero-pad to target dimensions (preserves original information)
    normalized = new Array<number>(target);
    for (let i = 0; i < target; i++) {
      normalized[i] = i < source.length ? source[i] : 0;
    }
  }

  // Apply unit normalization for cosine similarity
  // This ensures all vectors have magnitude 1, making distance calculations consistent
  const norm = Math.sqrt(normalized.reduce((sum, val) => sum + val * val, 0));
  
  if (norm > 0) {
    return normalized.map(val => val / norm);
  }

  return normalized;
}

/**
 * Normalize embeddings from different sources to the canonical dimensionality
 */
export function applyTargetDimensions(
  result: EmbeddingVector,
  source: string,
  targetDimensions: number
): EmbeddingVector {
  const normalized = normalizeEmbedding(result.embedding, targetDimensions);

  if (normalized.length !== result.embedding.length) {
    console.log(`🔁 Adjusted ${source} embedding from ${result.embedding.length}D to ${targetDimensions}D`);
  }

  return {
    embedding: normalized,
    dimensions: targetDimensions,
    model: result.model,
  };
}
