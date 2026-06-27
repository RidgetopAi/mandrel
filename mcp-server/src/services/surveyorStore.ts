/**
 * Surveyor STORE — persist + read a tenant codebase scan (Surveyor P4b, task 8ed9e216).
 *
 * Mandrel is the SYSTEM OF RECORD. This is the single home for writing a ScanResult into,
 * and reading a stored graph back out of, the tenant's Postgres (migration 053). Everything
 * that touches the surveyor_* tables goes through here so the transaction boundary, the
 * parameterized SQL, and the project scoping live in ONE place (Lesson 011: one definition,
 * not N copies):
 *
 *   - persistScan()   — write a whole ScanResult atomically (scan row + nodes + connections
 *                       + warnings + per-function summaries) under a Mandrel project.
 *   - getStoredGraph()— read a project's latest (or a specific) stored scan back as a graph
 *                       (scan summary + nodes + connections), optionally filtered.
 *
 * SECURITY: every query binds user-derived values as PARAMETERS — never string-built. Bulk
 * inserts use unnest($n::type[]) so an N-row insert is still ONE parameterized statement.
 */

import type { Pool, PoolClient } from 'pg';
import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import type {
  SurveyorScanResult,
  SurveyorNode,
  SurveyorConnection,
  SurveyorWarning,
} from '../types/surveyor.js';

/** Summary of what a persisted scan contains (returned by persistScan / surveyor_scan). */
export interface PersistedScanSummary {
  scanId: string;
  projectId: string;
  projectName: string | null;
  projectPath: string;
  status: string;
  sourceScanId: string | null;
  totals: {
    files: number;
    functions: number;
    classes: number;
    connections: number;
    warnings: number;
    functionSummaries: number;
  };
  createdAt: string;
  completedAt: string | null;
}

/** A node as read back from the store (extracted columns + the full original payload). */
export interface StoredNode {
  key: string;
  type: string;
  name: string;
  filePath: string | null;
  line: number | null;
  endLine: number | null;
  data: Record<string, unknown>;
}

/** A connection as read back from the store. */
export interface StoredConnection {
  key: string;
  sourceKey: string;
  targetKey: string;
  type: string;
  weight: number;
  metadata: Record<string, unknown>;
}

/** The scan record header read back with a graph. */
export interface StoredScanHeader {
  scanId: string;
  projectId: string;
  projectName: string | null;
  projectPath: string;
  status: string;
  sourceScanId: string | null;
  stats: Record<string, unknown>;
  totals: {
    files: number;
    functions: number;
    classes: number;
    connections: number;
    warnings: number;
  };
  createdAt: string;
  completedAt: string | null;
}

export interface StoredGraph {
  scan: StoredScanHeader;
  nodes: StoredNode[];
  connections: StoredConnection[];
  /** True when nodes/connections were limited/filtered (the full graph has more). */
  truncated: boolean;
}

export interface GetGraphOptions {
  /** Read a specific stored scan (must belong to the project). Default: the latest scan. */
  scanId?: string;
  /** Restrict returned nodes to these node types (e.g. ['function','class']). */
  nodeTypes?: string[];
  /** Cap the number of nodes returned (connections are scoped to the returned nodes). */
  limit?: number;
}

/** Coerce a possibly-undefined count to a finite non-negative integer. */
function count(n: unknown, fallback = 0): number {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? Math.trunc(v) : fallback;
}

/**
 * PERSIST a full ScanResult under a Mandrel project, atomically. Returns a summary of what
 * was written. Throws on failure (the whole transaction rolls back — no half-written scan).
 *
 * The scan's totals are taken from ScanResult.stats where present, falling back to the actual
 * array/map lengths so the denormalized columns are always correct even if stats is sparse.
 */
export async function persistScan(
  projectId: string,
  scan: SurveyorScanResult,
  pool: Pool = db,
): Promise<PersistedScanSummary> {
  const nodes: SurveyorNode[] = Object.values(scan.nodes ?? {});
  const connections: SurveyorConnection[] = scan.connections ?? [];
  const warnings: SurveyorWarning[] = scan.warnings ?? [];

  const stats = scan.stats ?? ({} as SurveyorScanResult['stats']);
  const totalFiles = count(stats.totalFiles, nodes.filter((n) => n.type === 'file').length);
  const totalFunctions = count(stats.totalFunctions, nodes.filter((n) => n.type === 'function').length);
  const totalClasses = count(stats.totalClasses, nodes.filter((n) => n.type === 'class').length);
  const totalConnections = count(stats.totalConnections, connections.length);
  const totalWarnings = count(stats.totalWarnings, warnings.length);

  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    const scanRow = await client.query(
      `INSERT INTO surveyor_scans
         (project_id, source_scan_id, project_path, project_name, status, stats,
          total_files, total_functions, total_classes, total_connections, total_warnings,
          completed_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12)
       RETURNING id, created_at`,
      [
        projectId,
        scan.id ?? null,
        scan.projectPath ?? '',
        scan.projectName ?? null,
        scan.status ?? 'complete',
        JSON.stringify(stats),
        totalFiles,
        totalFunctions,
        totalClasses,
        totalConnections,
        totalWarnings,
        scan.completedAt ?? null,
      ],
    );
    const scanId: string = scanRow.rows[0].id;
    const createdAt: string = scanRow.rows[0].created_at;

    // ── Bulk-insert nodes (one parameterized statement via unnest) ──────────────────────
    if (nodes.length > 0) {
      await client.query(
        `INSERT INTO surveyor_nodes (scan_id, node_key, node_type, name, file_path, line, end_line, data)
         SELECT $1, k, t, n, fp, ln, el, d::jsonb
         FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::int[], $8::text[])
              AS u(k, t, n, fp, ln, el, d)`,
        [
          scanId,
          nodes.map((n) => n.id),
          nodes.map((n) => n.type),
          nodes.map((n) => n.name ?? ''),
          nodes.map((n) => n.filePath ?? null),
          nodes.map((n) => (Number.isFinite(n.line) ? n.line : null)),
          nodes.map((n) => (Number.isFinite(n.endLine) ? n.endLine : null)),
          nodes.map((n) => JSON.stringify(n)),
        ],
      );
    }

    // ── Bulk-insert connections ─────────────────────────────────────────────────────────
    if (connections.length > 0) {
      await client.query(
        `INSERT INTO surveyor_connections
           (scan_id, connection_key, source_key, target_key, connection_type, weight, metadata)
         SELECT $1, k, s, t, ct, w, m::jsonb
         FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::float8[], $7::text[])
              AS u(k, s, t, ct, w, m)`,
        [
          scanId,
          connections.map((c) => c.id),
          connections.map((c) => c.sourceId),
          connections.map((c) => c.targetId),
          connections.map((c) => c.type),
          connections.map((c) => (Number.isFinite(c.weight) ? c.weight : 1)),
          connections.map((c) => JSON.stringify(c.metadata ?? {})),
        ],
      );
    }

    // ── Bulk-insert warnings ────────────────────────────────────────────────────────────
    if (warnings.length > 0) {
      await client.query(
        `INSERT INTO surveyor_warnings
           (scan_id, warning_key, category, level, title, description, affected_nodes,
            suggestion, source, confidence, dismissible, detected_at)
         SELECT $1, k, cat, lvl, ttl, descr, an::jsonb, sg::jsonb, src, conf, dis, det::timestamptz
         FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
                     $8::text[], $9::text[], $10::float8[], $11::bool[], $12::text[])
              AS u(k, cat, lvl, ttl, descr, an, sg, src, conf, dis, det)`,
        [
          scanId,
          warnings.map((w) => w.id),
          warnings.map((w) => w.category),
          warnings.map((w) => w.level),
          warnings.map((w) => w.title ?? ''),
          warnings.map((w) => w.description ?? null),
          warnings.map((w) => JSON.stringify(w.affectedNodes ?? [])),
          warnings.map((w) => (w.suggestion != null ? JSON.stringify(w.suggestion) : null)),
          warnings.map((w) => w.source ?? null),
          warnings.map((w) => (Number.isFinite(w.confidence) ? (w.confidence as number) : null)),
          warnings.map((w) => Boolean(w.dismissible)),
          warnings.map((w) => w.detectedAt ?? null),
        ],
      );
    }

    // ── Per-function behavioral/AI summaries (extracted from function nodes) ─────────────
    const summaryNodes = nodes.filter((n) => n.type === 'function' && n.behavioral);
    if (summaryNodes.length > 0) {
      await client.query(
        `INSERT INTO surveyor_function_summaries (scan_id, node_key, summary, summary_source, flags, analyzed_at)
         SELECT $1, k, s, src, f::jsonb, a::timestamptz
         FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
              AS u(k, s, src, f, a)`,
        [
          scanId,
          summaryNodes.map((n) => n.id),
          summaryNodes.map((n) => n.behavioral!.summary ?? ''),
          summaryNodes.map((n) => n.behavioral!.source ?? null),
          summaryNodes.map((n) => JSON.stringify(n.behavioral!.flags ?? {})),
          summaryNodes.map((n) => n.behavioral!.analyzedAt ?? null),
        ],
      );
    }

    await client.query('COMMIT');

    logger.info(
      `🛰️  Surveyor scan persisted (scan ${scanId}, project ${projectId}): ` +
        `${nodes.length} nodes, ${connections.length} connections, ${warnings.length} warnings, ` +
        `${summaryNodes.length} fn summaries.`,
    );

    return {
      scanId,
      projectId,
      projectName: scan.projectName ?? null,
      projectPath: scan.projectPath ?? '',
      status: scan.status ?? 'complete',
      sourceScanId: scan.id ?? null,
      totals: {
        files: totalFiles,
        functions: totalFunctions,
        classes: totalClasses,
        connections: totalConnections,
        warnings: totalWarnings,
        functionSummaries: summaryNodes.length,
      },
      createdAt,
      completedAt: scan.completedAt ?? null,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * READ a stored graph for a project. Resolves the scan (a specific scanId scoped to the
 * project, or the project's latest), then returns the scan header + its nodes + connections,
 * optionally filtered by node type and capped by limit. Returns null if the project has no
 * stored scan (or the requested scanId doesn't belong to it).
 */
export async function getStoredGraph(
  projectId: string,
  opts: GetGraphOptions = {},
  pool: Pool = db,
): Promise<StoredGraph | null> {
  // 1) Resolve the scan row (project-scoped). A scanId may be a full UUID or an 8+-hex
  //    prefix (the house id8 style); match exact-or-prefix on the text form so both work,
  //    newest-first on an ambiguous prefix.
  const scanSql = opts.scanId
    ? `SELECT * FROM surveyor_scans
       WHERE project_id = $2 AND (id::text = $1 OR id::text LIKE $1 || '%')
       ORDER BY created_at DESC LIMIT 1`
    : `SELECT * FROM surveyor_scans WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`;
  const scanParams = opts.scanId ? [opts.scanId, projectId] : [projectId];
  const scanRes = await pool.query(scanSql, scanParams);
  if (scanRes.rows.length === 0) return null;
  const s = scanRes.rows[0];
  const scanId: string = s.id;

  // 2) Nodes (optionally filtered by type, capped by limit).
  const nodeParams: any[] = [scanId];
  let nodeFilter = '';
  if (opts.nodeTypes && opts.nodeTypes.length > 0) {
    nodeParams.push(opts.nodeTypes);
    nodeFilter = ` AND node_type = ANY($${nodeParams.length})`;
  }
  let nodeLimit = '';
  if (opts.limit && opts.limit > 0) {
    nodeParams.push(opts.limit);
    nodeLimit = ` LIMIT $${nodeParams.length}`;
  }
  const nodeRes = await pool.query(
    `SELECT node_key, node_type, name, file_path, line, end_line, data
     FROM surveyor_nodes
     WHERE scan_id = $1${nodeFilter}
     ORDER BY node_type, name${nodeLimit}`,
    nodeParams,
  );
  const nodes: StoredNode[] = nodeRes.rows.map((r) => ({
    key: r.node_key,
    type: r.node_type,
    name: r.name,
    filePath: r.file_path,
    line: r.line,
    endLine: r.end_line,
    data: typeof r.data === 'string' ? JSON.parse(r.data) : (r.data ?? {}),
  }));

  // 3) Connections. If nodes are filtered/limited, scope edges to the returned node set so
  //    the graph is internally consistent; otherwise return all edges for the scan.
  const filtered = (opts.nodeTypes && opts.nodeTypes.length > 0) || (opts.limit && opts.limit > 0);
  let connRes;
  if (filtered) {
    const keys = nodes.map((n) => n.key);
    if (keys.length === 0) {
      connRes = { rows: [] as any[] };
    } else {
      connRes = await pool.query(
        `SELECT connection_key, source_key, target_key, connection_type, weight, metadata
         FROM surveyor_connections
         WHERE scan_id = $1 AND (source_key = ANY($2) OR target_key = ANY($2))
         ORDER BY connection_type`,
        [scanId, keys],
      );
    }
  } else {
    connRes = await pool.query(
      `SELECT connection_key, source_key, target_key, connection_type, weight, metadata
       FROM surveyor_connections
       WHERE scan_id = $1
       ORDER BY connection_type`,
      [scanId],
    );
  }
  const connections: StoredConnection[] = connRes.rows.map((r) => ({
    key: r.connection_key,
    sourceKey: r.source_key,
    targetKey: r.target_key,
    type: r.connection_type,
    weight: Number(r.weight),
    metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata ?? {}),
  }));

  const totalNodesInScan = count(s.total_files) + count(s.total_functions) + count(s.total_classes);
  const truncated = Boolean(filtered) && nodes.length < totalNodesInScan;

  return {
    scan: {
      scanId,
      projectId: s.project_id,
      projectName: s.project_name,
      projectPath: s.project_path,
      status: s.status,
      sourceScanId: s.source_scan_id,
      stats: typeof s.stats === 'string' ? JSON.parse(s.stats) : (s.stats ?? {}),
      totals: {
        files: count(s.total_files),
        functions: count(s.total_functions),
        classes: count(s.total_classes),
        connections: count(s.total_connections),
        warnings: count(s.total_warnings),
      },
      createdAt: s.created_at,
      completedAt: s.completed_at,
    },
    nodes,
    connections,
    truncated,
  };
}
