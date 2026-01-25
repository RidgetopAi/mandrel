/**
 * Embedding Datasets
 * 
 * Get available embedding datasets for visualization.
 */

import { db } from '../../database/connection.js';
import { resolveProjectId } from './core.js';
import type { EmbeddingScope, EmbeddingDataset } from './types.js';

/**
 * Get available embedding datasets for a project
 */
export async function getAvailableDatasets(
  _userId: string,
  scope: EmbeddingScope = {}
): Promise<EmbeddingDataset[]> {
  try {
    const resolvedProjectId = await resolveProjectId(scope);
    const params: string[] = [];
    let whereClause = 'c.embedding IS NOT NULL';

    if (resolvedProjectId) {
      params.push(resolvedProjectId);
      whereClause += ` AND c.project_id = $${params.length}`;
    }

    const query = `
      SELECT
        p.id::text AS id,
        p.name AS name,
        'Embeddings from stored project contexts' AS description,
        COUNT(*) AS count,
        1536 AS dimensions,
        MIN(c.created_at) AS created_at
      FROM contexts c
      JOIN projects p ON p.id = c.project_id
      WHERE ${whereClause}
      GROUP BY p.id, p.name
      HAVING COUNT(*) > 0
      ORDER BY count DESC
      LIMIT 25
    `;

    const result = await db.query(query, params);

    return result.rows as EmbeddingDataset[];
  } catch (error) {
    console.error('Error getting embedding datasets:', error);
    throw new Error('Failed to get embedding datasets');
  }
}
