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
 *   - getStoredFile() — read ONE file's card (the file node + imports/exports + its functions
 *                       [each with its behavioral summary] + classes) from a stored scan.
 *   - getStoredFindings()— read a project's stored warnings, filterable by confidence/category.
 *
 * SECURITY: every query binds user-derived values as PARAMETERS — never string-built. Bulk
 * inserts use unnest($n::type[]) so an N-row insert is still ONE parameterized statement.
 */

import type { Pool, PoolClient } from 'pg';
import { db } from '../config/database.js';
import { SURVEYOR_CONFIG } from '../config/surveyorConfig.js';
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

/** A per-function behavioral/AI summary read back from surveyor_function_summaries. */
export interface StoredFunctionSummary {
  summary: string;
  /** BehavioralSummary.source: 'docstring' | 'ai' | 'manual'. */
  source: string | null;
  flags: Record<string, unknown>;
  analyzedAt: string | null;
}

/** A function member of a file, with its behavioral summary attached when one exists. */
export interface StoredFunctionMember extends StoredNode {
  summary: StoredFunctionSummary | null;
}

/** A single file's CARD: the file node + its imports/exports + its functions and classes. */
export interface StoredFile {
  /** The file node itself (extracted columns + full original FileNode payload in `data`). */
  node: StoredNode;
  /** The file's imports (raw FileNode.imports payload; [] when absent). */
  imports: unknown[];
  /** The file's exports (raw FileNode.exports payload; [] when absent). */
  exports: unknown[];
  /** The functions declared in this file (each with its behavioral summary when present). */
  functions: StoredFunctionMember[];
  /** The classes declared in this file. */
  classes: StoredNode[];
}

export interface StoredFileResult {
  /** The resolved scan header. */
  scan: StoredScanHeader;
  /** The file card, or null when the scan exists but no node matches the file reference. */
  file: StoredFile | null;
}

export interface GetFileOptions {
  /** Read from a specific stored scan (must belong to the project). Default: the latest. */
  scanId?: string;
}

/** A warning/finding read back from surveyor_warnings. */
export interface StoredWarning {
  key: string;
  category: string;
  /** WarningLevel: info | warning | error. */
  level: string;
  title: string;
  description: string | null;
  /** The node keys this warning is about (Warning.affectedNodes). */
  affectedNodes: string[];
  /** The optional structured fix suggestion (Warning.suggestion), or null. */
  suggestion: unknown;
  /** WarningSource: surveyor | knip | dependency-cruiser | … */
  source: string | null;
  confidence: number | null;
  dismissible: boolean;
  detectedAt: string | null;
}

export interface StoredFindings {
  /** The resolved scan header. */
  scan: StoredScanHeader;
  /** The warnings matching the filters, severity-ordered (error → warning → info). */
  warnings: StoredWarning[];
  /** Total warnings in the scan before any filter/limit (so callers know if it was narrowed). */
  totalInScan: number;
  /** True when a filter and/or the limit narrowed the result below the scan's total. */
  filtered: boolean;
}

export interface GetFindingsOptions {
  /** Read from a specific stored scan (must belong to the project). Default: the latest. */
  scanId?: string;
  /** Confidence floor in (0,1]; warnings below it (and unscored) are excluded. 0/undefined => no floor. */
  minConfidence?: number;
  /** Restrict to a single WarningCategory (exact match). */
  category?: string;
  /** Cap the number of warnings returned (clamped to the configured max). */
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
 * Resolve a project's stored scan ROW (project-scoped) — a specific scanId, or the latest.
 * A scanId may be a full UUID OR an 8+-hex prefix (the house id8 style); match exact-or-prefix
 * on the text form so both work, newest-first on an ambiguous prefix. Returns null when the
 * project has no stored scan (or the requested scanId doesn't belong to it). ONE definition so
 * every read tool (graph / file / findings) resolves the scan identically (Lesson 011).
 */
async function resolveScanRow(
  projectId: string,
  scanId: string | undefined,
  pool: Pool,
): Promise<any | null> {
  const scanSql = scanId
    ? `SELECT * FROM surveyor_scans
       WHERE project_id = $2 AND (id::text = $1 OR id::text LIKE $1 || '%')
       ORDER BY created_at DESC LIMIT 1`
    : `SELECT * FROM surveyor_scans WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`;
  const params = scanId ? [scanId, projectId] : [projectId];
  const res = await pool.query(scanSql, params);
  return res.rows[0] ?? null;
}

/** Map a surveyor_scans row to the StoredScanHeader shape (shared by every read tool). */
function mapScanHeader(s: any): StoredScanHeader {
  return {
    scanId: s.id,
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
  };
}

/** Map a surveyor_nodes row to the StoredNode shape (shared by every read tool). */
function mapNodeRow(r: any): StoredNode {
  return {
    key: r.node_key,
    type: r.node_type,
    name: r.name,
    filePath: r.file_path,
    line: r.line,
    endLine: r.end_line,
    data: typeof r.data === 'string' ? JSON.parse(r.data) : (r.data ?? {}),
  };
}

/** Coerce a possibly-string JSONB column into a JS value (node-pg parses jsonb, but be safe). */
function parseJson(v: unknown): unknown {
  return typeof v === 'string' ? JSON.parse(v) : v;
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
  // 1) Resolve the scan row (project-scoped, exact-or-prefix scanId, else latest).
  const s = await resolveScanRow(projectId, opts.scanId, pool);
  if (!s) return null;
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
  const nodes: StoredNode[] = nodeRes.rows.map(mapNodeRow);

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
    scan: mapScanHeader(s),
    nodes,
    connections,
    truncated,
  };
}

/**
 * READ a single file's CARD from a project's stored scan. Resolves the scan (specific scanId or
 * latest), finds the file node by its node_key OR its file_path (`fileRef` accepts either), then
 * gathers the file's imports/exports (from the FileNode payload) plus its functions and classes
 * (the nodes sharing the file's path), attaching each function's behavioral/AI summary when one
 * was stored. Returns null when the project has no stored scan; { scan, file:null } when the
 * scan exists but no node matches the reference. All values bound as PARAMETERS (Lesson 011).
 */
export async function getStoredFile(
  projectId: string,
  fileRef: string,
  opts: GetFileOptions = {},
  pool: Pool = db,
): Promise<StoredFileResult | null> {
  const s = await resolveScanRow(projectId, opts.scanId, pool);
  if (!s) return null;
  const scanId: string = s.id;
  const scan = mapScanHeader(s);

  // 1) The file node — matched by its node key OR its file path (either identifier works).
  const fileRes = await pool.query(
    `SELECT node_key, node_type, name, file_path, line, end_line, data
     FROM surveyor_nodes
     WHERE scan_id = $1 AND node_type = 'file' AND (node_key = $2 OR file_path = $2)
     ORDER BY name
     LIMIT 1`,
    [scanId, fileRef],
  );
  if (fileRes.rows.length === 0) return { scan, file: null };
  const fileNode = mapNodeRow(fileRes.rows[0]);

  // 2) The file's members — functions + classes declared in the same file (by file path).
  const memberRes = await pool.query(
    `SELECT node_key, node_type, name, file_path, line, end_line, data
     FROM surveyor_nodes
     WHERE scan_id = $1 AND node_type IN ('function', 'class') AND file_path = $2
     ORDER BY node_type, line NULLS LAST, name`,
    [scanId, fileNode.filePath],
  );
  const members = memberRes.rows.map(mapNodeRow);
  const functionNodes = members.filter((n) => n.type === 'function');
  const classes = members.filter((n) => n.type === 'class');

  // 3) Per-function behavioral/AI summaries for those functions (attached to each).
  const fnKeys = functionNodes.map((n) => n.key);
  const summaryByKey = new Map<string, StoredFunctionSummary>();
  if (fnKeys.length > 0) {
    const sumRes = await pool.query(
      `SELECT node_key, summary, summary_source, flags, analyzed_at
       FROM surveyor_function_summaries
       WHERE scan_id = $1 AND node_key = ANY($2)`,
      [scanId, fnKeys],
    );
    for (const r of sumRes.rows) {
      summaryByKey.set(r.node_key, {
        summary: r.summary,
        source: r.summary_source ?? null,
        flags: (parseJson(r.flags) as Record<string, unknown>) ?? {},
        analyzedAt: r.analyzed_at ?? null,
      });
    }
  }
  const functions: StoredFunctionMember[] = functionNodes.map((n) => ({
    ...n,
    summary: summaryByKey.get(n.key) ?? null,
  }));

  // 4) Imports/exports come straight off the FileNode payload (tolerated when absent).
  const fileData = fileNode.data as Record<string, unknown>;
  const imports = Array.isArray(fileData.imports) ? (fileData.imports as unknown[]) : [];
  const exports = Array.isArray(fileData.exports) ? (fileData.exports as unknown[]) : [];

  return {
    scan,
    file: { node: fileNode, imports, exports, functions, classes },
  };
}

/**
 * READ a project's stored findings (warnings) from its scan. Resolves the scan (specific scanId
 * or latest), then returns the warnings — optionally filtered by a confidence floor and/or a
 * single category, severity-ordered (error → warning → info, then by confidence). Filter
 * DEFAULTS + the result cap come from SURVEYOR_CONFIG.findings (configs-not-hardcoded). Returns
 * null when the project has no stored scan. All filters bound as PARAMETERS.
 */
export async function getStoredFindings(
  projectId: string,
  opts: GetFindingsOptions = {},
  pool: Pool = db,
): Promise<StoredFindings | null> {
  const s = await resolveScanRow(projectId, opts.scanId, pool);
  if (!s) return null;
  const scan = mapScanHeader(s);
  const scanId: string = s.id;

  const cfg = SURVEYOR_CONFIG.findings;
  const minConfidence =
    typeof opts.minConfidence === 'number' && Number.isFinite(opts.minConfidence)
      ? opts.minConfidence
      : cfg.defaultMinConfidence;
  const category = opts.category;
  const requestedLimit =
    typeof opts.limit === 'number' && Number.isFinite(opts.limit) && opts.limit > 0
      ? Math.trunc(opts.limit)
      : cfg.defaultLimit;
  const limit = Math.min(requestedLimit, cfg.maxLimit);

  const params: any[] = [scanId];
  const clauses: string[] = ['scan_id = $1'];
  // A confidence floor > 0 filters to warnings AT OR ABOVE it (unscored/null excluded). A floor
  // of 0 (the default) adds no clause, so unscored warnings are returned too.
  if (minConfidence > 0) {
    params.push(minConfidence);
    clauses.push(`confidence >= $${params.length}`);
  }
  if (category) {
    params.push(category);
    clauses.push(`category = $${params.length}`);
  }
  params.push(limit);
  const limitPos = params.length;

  const res = await pool.query(
    `SELECT warning_key, category, level, title, description, affected_nodes,
            suggestion, source, confidence, dismissible, detected_at
     FROM surveyor_warnings
     WHERE ${clauses.join(' AND ')}
     ORDER BY CASE level WHEN 'error' THEN 0 WHEN 'warning' THEN 1 WHEN 'info' THEN 2 ELSE 3 END,
              confidence DESC NULLS LAST, category, warning_key
     LIMIT $${limitPos}`,
    params,
  );

  const warnings: StoredWarning[] = res.rows.map((r) => ({
    key: r.warning_key,
    category: r.category,
    level: r.level,
    title: r.title,
    description: r.description ?? null,
    affectedNodes: (parseJson(r.affected_nodes) as string[]) ?? [],
    suggestion: r.suggestion == null ? null : parseJson(r.suggestion),
    source: r.source ?? null,
    confidence: r.confidence == null ? null : Number(r.confidence),
    dismissible: Boolean(r.dismissible),
    detectedAt: r.detected_at ?? null,
  }));

  const totalInScan = count(s.total_warnings);
  const filtered = minConfidence > 0 || !!category || warnings.length < totalInScan;

  return { scan, warnings, totalInScan, filtered };
}
