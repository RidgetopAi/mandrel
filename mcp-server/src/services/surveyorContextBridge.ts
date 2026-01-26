/**
 * Surveyor Context Bridge
 * Integrates Surveyor scans with Mandrel's context storage system
 * Part of MandrelV2 Surveyor Integration - Phase 2
 */

import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import type { StoredScan } from './surveyorService.js';
import { summaryGenerator } from './surveyorSummaryGenerator.js';
import type { SummaryTiers } from './surveyorSummaryGenerator.js';

/**
 * Context types for surveyor-related contexts
 */
const SURVEYOR_CONTEXT_TYPE = 'completion'; // Using completion type for codebase snapshots

/**
 * Surveyor Context Bridge
 * Stores scan results as Mandrel contexts for AI retrieval
 */
export class SurveyorContextBridge {
  /**
   * Store a scan as a Mandrel context
   * Creates a context entry that can be retrieved via context_search
   */
  async storeScanAsContext(scan: StoredScan, projectId: string): Promise<string> {
    try {
      // Generate summaries
      const summaries = summaryGenerator.generateSummaries(scan);

      // Create context content with L1 summary (balanced detail)
      const contextContent = this.formatContextContent(scan, summaries);

      // Store context with embedding for semantic search
      const contextId = await this.storeContext(projectId, contextContent, scan);

      // Update scan with generated summaries
      await this.updateScanSummaries(scan.id, summaries);

      logger.info('Scan stored as context', {
        component: 'SurveyorContextBridge',
        operation: 'storeScanAsContext',
        metadata: {
          scanId: scan.id,
          contextId,
          projectId,
        },
      });

      return contextId;
    } catch (error) {
      logger.error('Failed to store scan as context', error as Error);
      throw error;
    }
  }

  /**
   * Format context content for storage
   */
  private formatContextContent(scan: StoredScan, summaries: SummaryTiers): string {
    const lines: string[] = [];

    lines.push(`[SURVEYOR CODEBASE SNAPSHOT]`);
    lines.push(`Project: ${scan.project_name}`);
    lines.push(`Path: ${scan.project_path}`);
    lines.push(`Scan ID: ${scan.id}`);
    lines.push(`Scanned: ${scan.completed_at || scan.created_at}`);
    lines.push('');
    lines.push('## Quick Summary');
    lines.push(summaries.l0);
    lines.push('');
    lines.push(summaries.l1);

    return lines.join('\n');
  }

  /**
   * Store context in Mandrel's context table with embedding
   */
  private async storeContext(projectId: string, content: string, scan: StoredScan): Promise<string> {
    // Generate embedding for the content
    const embedding = await this.generateEmbedding(content);

    const tags = [
      'surveyor',
      'codebase-snapshot',
      `health-${this.getHealthCategory(scan.health_score)}`,
    ];

    // Add warning-level tags
    const wbl = scan.warnings_by_level || {};
    if ((wbl.error || 0) > 0) tags.push('has-errors');
    if ((wbl.warning || 0) > 0) tags.push('has-warnings');

    const result = await db.query(
      `
      INSERT INTO contexts (
        project_id, content, type, tags, embedding, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, NOW()
      )
      RETURNING id
    `,
      [
        projectId,
        content,
        SURVEYOR_CONTEXT_TYPE,
        tags,
        embedding ? `[${embedding.join(',')}]` : null,
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Update scan with generated summaries
   */
  private async updateScanSummaries(scanId: string, summaries: SummaryTiers): Promise<void> {
    await db.query(
      `
      UPDATE surveyor_scans
      SET summary_l0 = $1, summary_l1 = $2, summary_l2 = $3
      WHERE id = $4
    `,
      [summaries.l0, summaries.l1, summaries.l2, scanId]
    );
  }

  /**
   * Generate embedding for content using the local embedding service
   */
  private async generateEmbedding(content: string): Promise<number[] | null> {
    try {
      // Import embedding service dynamically to avoid circular dependencies
      const { EmbeddingService } = await import('./embedding/EmbeddingService.js');
      const embeddingService = new EmbeddingService();

      // Truncate content for embedding (max ~500 tokens)
      const truncated = content.slice(0, 2000);
      const result = await embeddingService.generateEmbedding({ text: truncated });

      return result.embedding;
    } catch (error) {
      const err = error as Error;
      logger.warn('Failed to generate embedding, storing without vector', {
        component: 'SurveyorContextBridge',
        operation: 'generateEmbedding',
        metadata: { error: err.message },
      });
      return null;
    }
  }

  /**
   * Get health category for tagging
   */
  private getHealthCategory(score: number | null): string {
    if (score === null) return 'unknown';
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'moderate';
    return 'needs-attention';
  }

  /**
   * Find relevant contexts for a query (for AI agents)
   */
  async findRelevantScans(projectId: string, query: string, limit: number = 5): Promise<any[]> {
    try {
      const embedding = await this.generateEmbedding(query);

      if (embedding) {
        // Vector similarity search
        const result = await db.query(
          `
          SELECT c.*, 1 - (c.embedding <=> $1::vector) as similarity
          FROM contexts c
          WHERE c.project_id = $2
            AND c.type = $3
            AND 'surveyor' = ANY(c.tags)
          ORDER BY c.embedding <=> $1::vector
          LIMIT $4
        `,
          [`[${embedding.join(',')}]`, projectId, SURVEYOR_CONTEXT_TYPE, limit]
        );

        return result.rows;
      }

      // Fallback to text search
      const result = await db.query(
        `
        SELECT * FROM contexts
        WHERE project_id = $1
          AND type = $2
          AND 'surveyor' = ANY(tags)
          AND content ILIKE $3
        ORDER BY created_at DESC
        LIMIT $4
      `,
        [projectId, SURVEYOR_CONTEXT_TYPE, `%${query}%`, limit]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to find relevant scans', error as Error);
      return [];
    }
  }

  /**
   * Get the latest scan context for a project
   */
  async getLatestScanContext(projectId: string): Promise<any | null> {
    const result = await db.query(
      `
      SELECT * FROM contexts
      WHERE project_id = $1
        AND type = $2
        AND 'surveyor' = ANY(tags)
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [projectId, SURVEYOR_CONTEXT_TYPE]
    );

    return result.rows[0] || null;
  }
}

// Export singleton
export const contextBridge = new SurveyorContextBridge();
