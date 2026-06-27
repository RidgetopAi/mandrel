/**
 * Surveyor service — the command-backend READ surface over a tenant's stored codebase scan,
 * plus the SCAN trigger (Surveyor P4c-backend, Mandrel task e5a650e4, decision 8f330f96).
 *
 * DATA PATH (two precedents, each matched exactly):
 *
 *   READS (graph / file / findings) → DIRECT POSTGRES. The surveyor_* tables (migration 053)
 *   live in the SAME database the command-backend already reads for tasks/git/projects/
 *   decisions/contexts. Every data-retrieval controller in this backend queries that Postgres
 *   directly via the shared `db` pool — so the surveyor reads do too. This is the DOMINANT
 *   command-backend pattern, it returns clean REST JSON the canvas consumes with no MCP-shape
 *   unwrapping, and it lets the read tests run against a REAL migrated DB (no mocked boundary
 *   that could lie). The queries are ported from the mcp-server's services/surveyorStore.ts
 *   read functions (the system-of-record reader) so the two readers stay shape-identical.
 *
 *   SCAN TRIGGER (write) → PROXY to the mcp-server `surveyor_scan` MCP tool (via McpService).
 *   The scan flow is NOT a SQL query: it calls the external P4a @surveyor/server then PERSISTS
 *   the ScanResult in an atomic multi-table transaction. That orchestration + the service client
 *   + the persist transaction already exist in EXACTLY ONE place (mcp-server surveyorRoutes
 *   .handleScan → surveyorClient + persistScan). Re-implementing them here would mean a SECOND
 *   service client and a SECOND persist path — guaranteed drift (Lesson 011: one definition, not
 *   N copies). The command-backend already PROXIES mcp-server-owned operations (the
 *   /api/v2/sessions/* lifecycle in routes/index.ts; naming/decision/insights via McpService) —
 *   so the scan endpoint forwards to surveyor_scan and unwraps its structuredContent.
 *
 * SECURITY: every read query binds user-derived values as PARAMETERS — never string-built
 * (mirrors surveyorStore). Project scope is enforced on every read (scan must belong to the
 * project). The scan path passes projectId + path through to the MCP tool, which owns scope +
 * the fail-closed service auth.
 */

import type { Pool } from 'pg';
import { db } from '../database/connection';
import { logger } from '../config/logger';
import { SURVEYOR_CONFIG } from '../config/surveyorConfig';
import { McpService } from './mcp';

// ── Read-back shapes (mirror mcp-server surveyorStore so the two readers agree) ───────────

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
  /** Cap the number of nodes returned (clamped to SURVEYOR_CONFIG.graph.maxNodes). */
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
  node: StoredNode;
  imports: unknown[];
  exports: unknown[];
  functions: StoredFunctionMember[];
  classes: StoredNode[];
}

export interface StoredFileResult {
  scan: StoredScanHeader;
  /** The file card, or null when the scan exists but no node matches the file reference. */
  file: StoredFile | null;
}

export interface GetFileOptions {
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
  affectedNodes: string[];
  suggestion: unknown;
  /** WarningSource: surveyor | knip | dependency-cruiser | … */
  source: string | null;
  confidence: number | null;
  dismissible: boolean;
  detectedAt: string | null;
}

export interface StoredFindings {
  scan: StoredScanHeader;
  warnings: StoredWarning[];
  totalInScan: number;
  filtered: boolean;
}

export interface GetFindingsOptions {
  scanId?: string;
  /** Confidence floor in (0,1]; warnings below it (and unscored) are excluded. 0/undefined => no floor. */
  minConfidence?: number;
  /** Restrict to a single WarningCategory (exact match). */
  category?: string;
  /** Cap the number of warnings returned (clamped to the configured max). */
  limit?: number;
}

/** Summary returned by the scan trigger (unwrapped from the surveyor_scan tool). */
export interface ScanSummary {
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

/** The result of a scan trigger: either the persisted summary, or an actionable failure. */
export type ScanResult =
  | { ok: true; scan: ScanSummary }
  | { ok: false; errorKind: string; message: string };

// ── Helpers (mirror surveyorStore) ───────────────────────────────────────────────────────

/** Coerce a possibly-undefined count to a finite non-negative integer. */
function count(n: unknown, fallback = 0): number {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? Math.trunc(v) : fallback;
}

/** Coerce a possibly-string JSONB column into a JS value (node-pg parses jsonb, but be safe). */
function parseJson(v: unknown): unknown {
  return typeof v === 'string' ? JSON.parse(v) : v;
}

/** Map a surveyor_scans row to the StoredScanHeader shape (shared by every read). */
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

/** Map a surveyor_nodes row to the StoredNode shape (shared by every read). */
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

export class SurveyorService {
  /**
   * Resolve a project's stored scan ROW (project-scoped) — a specific scanId, or the latest.
   * A scanId may be a full UUID OR an 8+-hex prefix (the house id8 style); match exact-or-prefix
   * on the text form so both work, newest-first on an ambiguous prefix. Returns null when the
   * project has no stored scan (or the requested scanId doesn't belong to it). ONE definition so
   * every read resolves the scan identically (Lesson 011), matching surveyorStore.resolveScanRow.
   */
  private static async resolveScanRow(
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

  /** True when a project row with this id exists. Lets the controller return a clean 404. */
  static async projectExists(projectId: string, pool: Pool = db): Promise<boolean> {
    const res = await pool.query('SELECT 1 FROM projects WHERE id = $1', [projectId]);
    return res.rows.length > 0;
  }

  /**
   * READ a stored graph for a project (nodes + connections) for the canvas. Resolves the scan
   * (a specific scanId scoped to the project, or the project's latest), then returns the scan
   * header + its nodes + connections, optionally filtered by node type and capped by limit
   * (clamped to SURVEYOR_CONFIG.graph.maxNodes). Returns null if the project has no stored scan.
   * Ported from surveyorStore.getStoredGraph.
   */
  static async getGraph(
    projectId: string,
    opts: GetGraphOptions = {},
    pool: Pool = db,
  ): Promise<StoredGraph | null> {
    const s = await this.resolveScanRow(projectId, opts.scanId, pool);
    if (!s) return null;
    const scanId: string = s.id;

    // A caller limit is clamped to the configured hard ceiling; with no caller limit we still
    // cap at maxNodes so an enormous scan can't flood the canvas (configs-not-hardcoded).
    const maxNodes = SURVEYOR_CONFIG.graph.maxNodes;
    const requestedLimit =
      typeof opts.limit === 'number' && Number.isFinite(opts.limit) && opts.limit > 0
        ? Math.trunc(opts.limit)
        : maxNodes;
    const effectiveLimit = Math.min(requestedLimit, maxNodes);

    const nodeParams: any[] = [scanId];
    let nodeFilter = '';
    if (opts.nodeTypes && opts.nodeTypes.length > 0) {
      nodeParams.push(opts.nodeTypes);
      nodeFilter = ` AND node_type = ANY($${nodeParams.length})`;
    }
    nodeParams.push(effectiveLimit);
    const nodeLimit = ` LIMIT $${nodeParams.length}`;

    const nodeRes = await pool.query(
      `SELECT node_key, node_type, name, file_path, line, end_line, data
       FROM surveyor_nodes
       WHERE scan_id = $1${nodeFilter}
       ORDER BY node_type, name${nodeLimit}`,
      nodeParams,
    );
    const nodes: StoredNode[] = nodeRes.rows.map(mapNodeRow);

    // Connections. If nodes are filtered/capped below the full set, scope edges to the returned
    // node set so the graph is internally consistent; otherwise return all edges for the scan.
    const totalNodesInScan =
      count(s.total_files) + count(s.total_functions) + count(s.total_classes);
    const typeFiltered = !!(opts.nodeTypes && opts.nodeTypes.length > 0);
    const capped = nodes.length < totalNodesInScan;
    const scopeToNodes = typeFiltered || capped;

    let connRows: any[];
    if (scopeToNodes) {
      const keys = nodes.map((n) => n.key);
      if (keys.length === 0) {
        connRows = [];
      } else {
        const r = await pool.query(
          `SELECT connection_key, source_key, target_key, connection_type, weight, metadata
           FROM surveyor_connections
           WHERE scan_id = $1 AND (source_key = ANY($2) OR target_key = ANY($2))
           ORDER BY connection_type`,
          [scanId, keys],
        );
        connRows = r.rows;
      }
    } else {
      const r = await pool.query(
        `SELECT connection_key, source_key, target_key, connection_type, weight, metadata
         FROM surveyor_connections
         WHERE scan_id = $1
         ORDER BY connection_type`,
        [scanId],
      );
      connRows = r.rows;
    }
    const connections: StoredConnection[] = connRows.map((r) => ({
      key: r.connection_key,
      sourceKey: r.source_key,
      targetKey: r.target_key,
      type: r.connection_type,
      weight: Number(r.weight),
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata ?? {}),
    }));

    return {
      scan: mapScanHeader(s),
      nodes,
      connections,
      truncated: scopeToNodes && nodes.length < totalNodesInScan,
    };
  }

  /**
   * READ a single file's CARD from a project's stored scan. Resolves the scan (specific scanId
   * or latest), finds the file node by its node_key OR its file_path (`fileRef` accepts either),
   * then gathers the file's imports/exports (from the FileNode payload) plus its functions and
   * classes, attaching each function's behavioral/AI summary when one was stored. Returns null
   * when the project has no stored scan; { scan, file:null } when the scan exists but no node
   * matches. Ported from surveyorStore.getStoredFile.
   */
  static async getFile(
    projectId: string,
    fileRef: string,
    opts: GetFileOptions = {},
    pool: Pool = db,
  ): Promise<StoredFileResult | null> {
    const s = await this.resolveScanRow(projectId, opts.scanId, pool);
    if (!s) return null;
    const scanId: string = s.id;
    const scan = mapScanHeader(s);

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

    const fileData = fileNode.data as Record<string, unknown>;
    const imports = Array.isArray(fileData.imports) ? (fileData.imports as unknown[]) : [];
    const exports = Array.isArray(fileData.exports) ? (fileData.exports as unknown[]) : [];

    return {
      scan,
      file: { node: fileNode, imports, exports, functions, classes },
    };
  }

  /**
   * READ a project's stored findings (warnings) from its scan. Resolves the scan (specific
   * scanId or latest), then returns the warnings — optionally filtered by a confidence floor
   * and/or a single category, severity-ordered (error → warning → info, then by confidence).
   * Filter DEFAULTS + the result cap come from SURVEYOR_CONFIG.findings (configs-not-hardcoded).
   * Returns null when the project has no stored scan. Ported from surveyorStore.getStoredFindings.
   */
  static async getFindings(
    projectId: string,
    opts: GetFindingsOptions = {},
    pool: Pool = db,
  ): Promise<StoredFindings | null> {
    const s = await this.resolveScanRow(projectId, opts.scanId, pool);
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

  /**
   * TRIGGER a scan of a server-side project path. PROXIES to the mcp-server `surveyor_scan` MCP
   * tool (the single owner of the call-P4a-service + atomic-persist flow), then unwraps its
   * structuredContent into a flat ScanSummary. A service/job failure surfaces as an actionable
   * { ok:false } (the tool persisted nothing). The MCP target is centralized in McpService
   * (MANDREL_MCP_URL / MANDREL_MCP_PORT) — configs-not-hardcoded.
   *
   * The MCP tool's project scope: we pass projectId explicitly so the scan is stored under the
   * route's project regardless of the (stateless) HTTP bridge's session.
   */
  static async triggerScan(
    projectId: string,
    path: string,
    scanId?: string,
  ): Promise<ScanResult> {
    const args: Record<string, unknown> = { projectId, path };
    if (scanId) args.scanId = scanId;

    // callMcpEndpoint returns the FULL bridge body: { success, result: McpResponse }, where
    // McpResponse carries structuredContent (callTool() would drop it). We read it directly.
    const body = await McpService.callMcpEndpoint('/mcp/tools/surveyor_scan', 'POST', {
      arguments: args,
    });

    const result = body?.result ?? body;
    const sc = result?.structuredContent;

    if (!sc || sc.ok !== true) {
      // The tool reported a rejection/failure (no project, service down, timeout, job error…).
      const kind = sc?.errorKind || sc?.action || 'failed';
      const text =
        Array.isArray(result?.content) && result.content[0]?.text
          ? String(result.content[0].text)
          : 'Surveyor scan failed.';
      logger.warn('[Surveyor] scan trigger did not succeed', { projectId, kind });
      return { ok: false, errorKind: String(kind), message: text };
    }

    const scan = sc.scan;
    logger.info('[Surveyor] scan persisted via MCP', {
      projectId,
      scanId: scan?.scanId,
    });
    return {
      ok: true,
      scan: {
        scanId: scan.scanId,
        projectId: scan.projectId,
        projectName: scan.projectName ?? null,
        projectPath: scan.projectPath,
        status: scan.status,
        sourceScanId: scan.sourceScanId ?? null,
        totals: scan.totals,
        createdAt: scan.createdAt,
        completedAt: scan.completedAt ?? null,
      },
    };
  }
}
