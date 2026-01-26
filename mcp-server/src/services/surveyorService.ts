/**
 * Surveyor Service
 * Business logic for Surveyor codebase analysis integration
 * Part of MandrelV2 Surveyor Integration
 */

import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
// import type { PoolClient } from 'pg';

// Types matching @surveyor/core
export interface ScanStats {
  totalFiles: number;
  totalFunctions: number;
  totalClasses: number;
  totalConnections: number;
  totalWarnings: number;
  warningsByLevel: Record<string, number>;
  nodesByType: Record<string, number>;
  analyzedCount: number;
  pendingAnalysis: number;
}

export interface ScanResult {
  id: string;
  projectPath: string;
  projectName: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  stats: ScanStats;
  nodes: Record<string, any>;
  connections: any[];
  warnings: any[];
  clusters: any[];
  errors: any[];
}

export interface StoredScan {
  id: string;
  project_id: string;
  project_path: string;
  project_name: string;
  status: string;
  created_at: Date;
  completed_at: Date | null;
  total_files: number;
  total_functions: number;
  total_classes: number;
  total_connections: number;
  total_warnings: number;
  analyzed_count: number;
  pending_analysis: number;
  health_score: number | null;
  warnings_by_level: Record<string, number>;
  nodes_by_type: Record<string, number>;
  nodes: Record<string, any>;
  connections: any[];
  clusters: any[];
  errors: any[];
  summary_l0: string | null;
  summary_l1: string | null;
  summary_l2: string | null;
}

export interface Warning {
  id: string;
  category: string;
  level: string;
  title: string;
  description: string;
  affectedNodes: string[];
  filePath: string | null;
  suggestion: any | null;
  detectedAt: string;
}

/**
 * Surveyor Service - handles all database operations for Surveyor scans
 */
export class SurveyorService {
  /**
   * Store a new scan result
   */
  async storeScan(projectId: string, scanResult: ScanResult): Promise<StoredScan> {
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Calculate health score (simple formula: 100 - (warnings * impact))
      const warningImpact = {
        error: 10,
        warning: 3,
        info: 0.5,
      };
      const healthDeduction = Object.entries(scanResult.stats.warningsByLevel).reduce(
        (total, [level, count]) =>
          total + count * (warningImpact[level as keyof typeof warningImpact] || 0),
        0
      );
      const healthScore = Math.max(0, Math.min(100, Math.round(100 - healthDeduction)));

      // Insert scan
      const insertQuery = `
        INSERT INTO surveyor_scans (
          id, project_id, project_path, project_name, status,
          created_at, completed_at,
          total_files, total_functions, total_classes, total_connections, total_warnings,
          analyzed_count, pending_analysis, health_score,
          warnings_by_level, nodes_by_type, nodes, connections, clusters, errors
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, $15,
          $16, $17, $18, $19, $20, $21
        )
        RETURNING *
      `;

      const result = await client.query(insertQuery, [
        scanResult.id,
        projectId,
        scanResult.projectPath,
        scanResult.projectName,
        scanResult.status,
        scanResult.createdAt,
        scanResult.completedAt,
        scanResult.stats.totalFiles,
        scanResult.stats.totalFunctions,
        scanResult.stats.totalClasses,
        scanResult.stats.totalConnections,
        scanResult.stats.totalWarnings,
        scanResult.stats.analyzedCount,
        scanResult.stats.pendingAnalysis,
        healthScore,
        JSON.stringify(scanResult.stats.warningsByLevel),
        JSON.stringify(scanResult.stats.nodesByType),
        JSON.stringify(scanResult.nodes),
        JSON.stringify(scanResult.connections),
        JSON.stringify(scanResult.clusters),
        JSON.stringify(scanResult.errors),
      ]);

      // Insert warnings into separate table
      if (scanResult.warnings && scanResult.warnings.length > 0) {
        for (const warning of scanResult.warnings) {
          await client.query(
            `
            INSERT INTO surveyor_warnings (
              id, scan_id, category, level, title, description,
              affected_nodes, file_path, suggestion, detected_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `,
            [
              warning.id,
              scanResult.id,
              warning.category,
              warning.level,
              warning.title,
              warning.description,
              JSON.stringify(warning.affectedNodes || []),
              warning.affectedNodes?.[0] ? this.extractFilePath(warning.affectedNodes[0]) : null,
              warning.suggestion ? JSON.stringify(warning.suggestion) : null,
              warning.detectedAt || new Date().toISOString(),
            ]
          );
        }
      }

      await client.query('COMMIT');

      // Store scan as Mandrel context for AI retrieval (non-blocking)
      try {
        const { contextBridge } = await import('./surveyorContextBridge.js');
        await contextBridge.storeScanAsContext(result.rows[0], projectId);
      } catch (ctxError) {
        const ctxErr = ctxError as Error;
        logger.warn('Failed to store scan as context (non-fatal)', {
          component: 'SurveyorService',
          operation: 'storeScan',
          metadata: { error: ctxErr.message },
        });
      }

      logger.info('Surveyor scan stored', {
        component: 'SurveyorService',
        operation: 'storeScan',
        metadata: {
          scanId: scanResult.id,
          projectId,
          totalFiles: scanResult.stats.totalFiles,
          totalWarnings: scanResult.stats.totalWarnings,
          healthScore,
        },
      });

      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Extract file path from node ID (e.g., "file:src/foo.ts" -> "src/foo.ts")
   */
  private extractFilePath(nodeId: string): string | null {
    if (nodeId.startsWith('file:')) {
      return nodeId.substring(5).split(':')[0];
    }
    // For function/class nodes: "file:path:fn:name:line"
    const parts = nodeId.split(':');
    if (parts.length >= 2 && parts[0] === 'file') {
      return parts[1];
    }
    return null;
  }

  /**
   * Get scans for a project
   */
  async getScans(
    projectId: string,
    options?: {
      status?: string;
      limit?: number;
      offset?: number;
      includeNodes?: boolean;
    }
  ): Promise<{ scans: StoredScan[]; total: number }> {
    const { status, limit = 10, offset = 0, includeNodes = false } = options || {};

    const conditions: string[] = ['project_id = $1'];
    const params: any[] = [projectId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    const whereClause = conditions.join(' AND ');

    // Select columns - optionally exclude large JSONB fields
    const selectCols = includeNodes
      ? '*'
      : `id, project_id, project_path, project_name, status, created_at, completed_at,
         total_files, total_functions, total_classes, total_connections, total_warnings,
         analyzed_count, pending_analysis, health_score, warnings_by_level, nodes_by_type,
         summary_l0, summary_l1, summary_l2`;

    const query = `
      SELECT ${selectCols}
      FROM surveyor_scans
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    params.push(limit, offset);

    const countQuery = `
      SELECT COUNT(*) as count
      FROM surveyor_scans
      WHERE ${whereClause}
    `;

    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, params.slice(0, status ? 2 : 1)),
    ]);

    return {
      scans: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  }

  /**
   * Get a single scan by ID
   */
  async getScan(scanId: string, includeNodes: boolean = true): Promise<StoredScan | null> {
    const selectCols = includeNodes
      ? '*'
      : `id, project_id, project_path, project_name, status, created_at, completed_at,
         total_files, total_functions, total_classes, total_connections, total_warnings,
         analyzed_count, pending_analysis, health_score, warnings_by_level, nodes_by_type,
         summary_l0, summary_l1, summary_l2`;

    const result = await db.query(`SELECT ${selectCols} FROM surveyor_scans WHERE id = $1`, [
      scanId,
    ]);

    return result.rows[0] || null;
  }

  /**
   * Delete a scan
   */
  async deleteScan(scanId: string): Promise<boolean> {
    const result = await db.query('DELETE FROM surveyor_scans WHERE id = $1 RETURNING id', [
      scanId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get warnings for a scan with filtering
   */
  async getWarnings(
    scanId: string,
    options?: {
      level?: string;
      category?: string;
      filePath?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ warnings: Warning[]; total: number }> {
    const { level, category, filePath, limit = 100, offset = 0 } = options || {};

    const conditions: string[] = ['scan_id = $1'];
    const params: any[] = [scanId];
    let paramIndex = 2;

    if (level) {
      conditions.push(`level = $${paramIndex++}`);
      params.push(level);
    }
    if (category) {
      conditions.push(`category = $${paramIndex++}`);
      params.push(category);
    }
    if (filePath) {
      conditions.push(`file_path LIKE $${paramIndex++}`);
      params.push(`%${filePath}%`);
    }

    const whereClause = conditions.join(' AND ');

    const query = `
      SELECT * FROM surveyor_warnings
      WHERE ${whereClause}
      ORDER BY
        CASE level WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
        detected_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    params.push(limit, offset);

    const countQuery = `
      SELECT COUNT(*) as count FROM surveyor_warnings WHERE ${whereClause}
    `;

    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, params.slice(0, -2)),
    ]);

    return {
      warnings: result.rows.map((row) => ({
        id: row.id,
        category: row.category,
        level: row.level,
        title: row.title,
        description: row.description,
        affectedNodes: row.affected_nodes,
        filePath: row.file_path,
        suggestion: row.suggestion,
        detectedAt: row.detected_at,
      })),
      total: parseInt(countResult.rows[0].count),
    };
  }

  /**
   * Query nodes in a scan (for deep queries)
   */
  async queryNodes(
    scanId: string,
    options: {
      type?: string;
      filePath?: string;
      search?: string;
      hasFlag?: string;
    }
  ): Promise<any[]> {
    const scan = await this.getScan(scanId, true);
    if (!scan || !scan.nodes) return [];

    let nodes = Object.values(scan.nodes);

    // Filter by type
    if (options.type) {
      nodes = nodes.filter((n: any) => n.type === options.type);
    }

    // Filter by file path
    if (options.filePath) {
      nodes = nodes.filter((n: any) => n.filePath?.includes(options.filePath));
    }

    // Filter by search term in name
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      nodes = nodes.filter((n: any) => n.name?.toLowerCase().includes(searchLower));
    }

    // Filter by behavioral flag
    if (options.hasFlag) {
      nodes = nodes.filter(
        (n: any) => n.behavioral?.flags?.[options.hasFlag as keyof typeof n.behavioral.flags]
      );
    }

    return nodes;
  }

  /**
   * Get imports/exports for a file
   */
  async getFileDetails(scanId: string, filePath: string): Promise<any | null> {
    const scan = await this.getScan(scanId, true);
    if (!scan || !scan.nodes) return null;

    const fileNodeId = `file:${filePath}`;
    return scan.nodes[fileNodeId] || null;
  }

  /**
   * Update scan summaries
   */
  async updateSummaries(
    scanId: string,
    summaries: { l0?: string; l1?: string; l2?: string }
  ): Promise<void> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (summaries.l0) {
      updates.push(`summary_l0 = $${paramIndex++}`);
      params.push(summaries.l0);
    }
    if (summaries.l1) {
      updates.push(`summary_l1 = $${paramIndex++}`);
      params.push(summaries.l1);
    }
    if (summaries.l2) {
      updates.push(`summary_l2 = $${paramIndex++}`);
      params.push(summaries.l2);
    }

    if (updates.length === 0) return;

    params.push(scanId);
    await db.query(
      `UPDATE surveyor_scans SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    logger.info('Surveyor summaries updated', {
      component: 'SurveyorService',
      operation: 'updateSummaries',
      metadata: { scanId, levels: Object.keys(summaries) },
    });
  }

  /**
   * Get scan statistics across all scans for a project
   */
  async getProjectStats(projectId: string): Promise<{
    totalScans: number;
    latestScan: StoredScan | null;
    averageHealthScore: number | null;
    warningTrends: { date: string; count: number }[];
  }> {
    const [countResult, latestResult, avgResult, trendsResult] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM surveyor_scans WHERE project_id = $1', [projectId]),
      db.query(
        'SELECT * FROM surveyor_scans WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
        [projectId]
      ),
      db.query(
        "SELECT AVG(health_score)::integer as avg FROM surveyor_scans WHERE project_id = $1 AND status = 'complete'",
        [projectId]
      ),
      db.query(
        `
        SELECT DATE(created_at) as date, SUM(total_warnings) as count
        FROM surveyor_scans
        WHERE project_id = $1 AND status = 'complete'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `,
        [projectId]
      ),
    ]);

    return {
      totalScans: parseInt(countResult.rows[0].count),
      latestScan: latestResult.rows[0] || null,
      averageHealthScore: avgResult.rows[0]?.avg || null,
      warningTrends: trendsResult.rows.map((r) => ({
        date: r.date,
        count: parseInt(r.count),
      })),
    };
  }
}

// Export singleton instance
export const surveyorService = new SurveyorService();
