/**
 * Embedding Core Utilities
 * 
 * Shared utilities for embedding operations.
 */

import { db } from '../../database/connection.js';
import type { EmbeddingScope } from './types.js';

/**
 * Resolve project ID from scope (by ID or name)
 */
export async function resolveProjectId(scope: EmbeddingScope): Promise<string | undefined> {
  if (scope.projectId) {
    return scope.projectId;
  }

  if (scope.projectName) {
    const result = await db.query(
      `SELECT id FROM projects WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [scope.projectName]
    );

    return result.rows[0]?.id;
  }

  return undefined;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
