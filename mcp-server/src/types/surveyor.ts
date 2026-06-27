/**
 * Surveyor contract types (Surveyor P4b integration, Mandrel task 8ed9e216).
 *
 * These mirror the @surveyor/core types (the shared Surveyor service's public contract):
 *   /home/ridgetop/projects/surveyor/packages/core/src/types/
 *     scan.types.ts        — ScanResult, ScanStats, ScanStatus
 *     node.types.ts        — Node (FileNode|FunctionNode|ClassNode), NodeMap, BehavioralSummary
 *     connection.types.ts  — Connection, ConnectionType
 *     warning.types.ts     — Warning, WarningLevel, WarningCategory, WarningSource
 *
 * WHY a local mirror and not an import: @surveyor/core lives in a SEPARATE repo/pnpm
 * workspace (not an npm dependency of mcp-server), so we cannot import it at build time
 * without crossing the package boundary. Instead we mirror the shapes here and PIN them
 * with a contract test (surveyorContract.contract.test.ts) + a faithful fake that produces
 * payloads in exactly the real wire shape (incl. the WRAPPED `{ result: ScanResult }` the
 * GET /:jobId/result endpoint returns). If the service contract ever changes, the fake +
 * the optional live e2e are the trip-wires. (Open question for Ridge: add @surveyor/core as
 * a real dependency for compile-time pinning once the service is deployed.)
 *
 * Only the fields Mandrel reads/persists are modeled precisely; the rest is tolerated via
 * index signatures so an additive service change does not break ingestion.
 */

/** Mirrors @surveyor/core ScanStatus. */
export type ScanStatus = 'pending' | 'parsing' | 'analyzing' | 'complete' | 'failed';

/** Mirrors @surveyor/core NodeType. */
export type SurveyorNodeType = 'file' | 'function' | 'class' | 'cluster';

/** Mirrors @surveyor/core ConnectionType. */
export type SurveyorConnectionType =
  | 'import'
  | 'function_call'
  | 'inheritance'
  | 'implementation'
  | 'type_reference';

/** Mirrors @surveyor/core WarningLevel. */
export type SurveyorWarningLevel = 'info' | 'warning' | 'error';

/** Mirrors @surveyor/core SummarySource. */
export type SurveyorSummarySource = 'docstring' | 'ai' | 'manual';

/** Per-function behavioral side-effect flags (BehavioralFlags). */
export interface SurveyorBehavioralFlags {
  databaseRead?: boolean;
  databaseWrite?: boolean;
  httpCall?: boolean;
  fileRead?: boolean;
  fileWrite?: boolean;
  sendsNotification?: boolean;
  modifiesGlobalState?: boolean;
  hasSideEffects?: boolean;
  [k: string]: unknown;
}

/** A function's behavioral/AI summary (BehavioralSummary). */
export interface SurveyorBehavioralSummary {
  summary: string;
  source: SurveyorSummarySource;
  analyzedAt: string;
  flags: SurveyorBehavioralFlags;
  [k: string]: unknown;
}

/** A graph node. Common (BaseNode) fields plus the union-specific ones we read. */
export interface SurveyorNode {
  id: string;
  type: SurveyorNodeType;
  name: string;
  filePath: string;
  line: number;
  endLine: number;
  /** FunctionNode only — present when the node is an analyzed function. */
  behavioral?: SurveyorBehavioralSummary | null;
  [k: string]: unknown;
}

/** ScanResult.nodes is a map keyed by node id (NodeMap). */
export type SurveyorNodeMap = Record<string, SurveyorNode>;

/** A graph connection/edge (Connection). */
export interface SurveyorConnection {
  id: string;
  sourceId: string;
  targetId: string;
  type: SurveyorConnectionType;
  weight: number;
  metadata?: Record<string, unknown>;
  [k: string]: unknown;
}

/** A warning/finding (Warning). */
export interface SurveyorWarning {
  id: string;
  category: string;
  level: SurveyorWarningLevel;
  title: string;
  description: string;
  affectedNodes: string[];
  suggestion?: unknown;
  detectedAt?: string;
  source?: string;
  confidence?: number;
  dismissible?: boolean;
  [k: string]: unknown;
}

/** Scan aggregate stats (ScanStats). */
export interface SurveyorScanStats {
  totalFiles: number;
  totalFunctions: number;
  totalClasses: number;
  totalConnections: number;
  totalWarnings: number;
  warningsByLevel?: Record<string, number>;
  nodesByType?: Record<string, number>;
  analyzedCount?: number;
  pendingAnalysis?: number;
  [k: string]: unknown;
}

/** The full scan payload (ScanResult). */
export interface SurveyorScanResult {
  id: string;
  projectPath: string;
  projectName: string;
  status: ScanStatus;
  createdAt: string;
  completedAt: string | null;
  stats: SurveyorScanStats;
  nodes: SurveyorNodeMap;
  connections: SurveyorConnection[];
  warnings: SurveyorWarning[];
  clusters?: unknown[];
  errors?: unknown[];
  [k: string]: unknown;
}

// ── Job-API wire shapes (the contract Mandrel calls) ─────────────────────────────────────

/** POST /api/v1/scans → 202 { jobId, status: 'queued' }. */
export interface SurveyorCreateScanResponse {
  jobId: string;
  status: string;
}

/** The service's job status (JobStatus). */
export type SurveyorJobStatus = 'queued' | 'running' | 'done' | 'error';

/** GET /api/v1/scans/:jobId → { jobId, status, progress, error? }. */
export interface SurveyorJobStatusResponse {
  jobId: string;
  status: SurveyorJobStatus;
  progress?: unknown;
  error?: string;
}

/**
 * GET /api/v1/scans/:jobId/result → { result: ScanResult }  ← WRAPPED.
 * The client MUST unwrap `.result`.
 */
export interface SurveyorResultResponse {
  result: SurveyorScanResult;
}
