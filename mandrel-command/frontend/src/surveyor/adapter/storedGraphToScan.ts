/**
 * Adapter: backend READ payloads → the core `ScanResult` the pure view/lib
 * layer consumes (Surveyor P4c-frontend).
 *
 * The pure view strategies + card/finding logic were written against the
 * surveyor-core `ScanResult` (a `nodes` map keyed by id, a `connections` array
 * with sourceId/targetId, a `warnings` array). The backend instead returns a
 * flattened store shape (`nodes: NodeDto[]` with the original node payload in
 * `.data`, `connections` with sourceKey/targetKey, findings via a separate
 * endpoint). This ONE adapter bridges the two so the ported logic runs unchanged
 * — keeping the seam (the views) free of any backend-specific knowledge.
 *
 * Node identity: the store's `node_key` is the original core node id, and a
 * FileNode's `functions`/`classes` arrays + every connection endpoint reference
 * those same ids — so we key the rebuilt map by `key` and the graph stays
 * internally consistent.
 */

import type {
  ScanResult,
  ScanStats,
  Node,
  Connection,
  ConnectionType,
  Warning,
  WarningCategory,
  WarningLevel,
  WarningSource,
  ScanStatus,
  WarningSuggestion,
} from '../core-types';
import type { GraphDto, FindingsDto, WarningDto, ScanHeaderDto } from '../api/surveyorClient';

function emptyStats(header: ScanHeaderDto | null): ScanStats {
  const t = header?.totals;
  return {
    totalFiles: t?.files ?? 0,
    totalFunctions: t?.functions ?? 0,
    totalClasses: t?.classes ?? 0,
    totalConnections: t?.connections ?? 0,
    totalWarnings: t?.warnings ?? 0,
    warningsByLevel: {
      info: 0,
      warning: 0,
      error: 0,
    } as Record<WarningLevel, number>,
    nodesByType: {},
    analyzedCount: 0,
    pendingAnalysis: 0,
  };
}

/** Map one backend warning to a core `Warning` (also a structural `FindingLike`). */
function mapWarning(w: WarningDto): Warning {
  const suggestion =
    w.suggestion && typeof w.suggestion === 'object'
      ? (w.suggestion as WarningSuggestion)
      : null;
  return {
    id: w.key,
    category: w.category as WarningCategory,
    level: w.level as WarningLevel,
    title: w.title,
    description: w.description ?? '',
    affectedNodes: Array.isArray(w.affectedNodes) ? w.affectedNodes : [],
    suggestion,
    detectedAt: w.detectedAt ?? '',
    source: (w.source ?? 'surveyor') as WarningSource,
    confidence: typeof w.confidence === 'number' ? w.confidence : 0,
    dismissible: Boolean(w.dismissible),
  };
}

/**
 * Build a core `ScanResult` from a graph payload, optionally folding in the
 * findings payload's warnings (the file-structure view + folder cards count
 * warnings per folder). `findings` is optional so a graph-only render works.
 */
export function storedGraphToScan(
  graph: GraphDto,
  findings?: FindingsDto | null,
): ScanResult | null {
  if (!graph.found || !graph.scan) return null;
  const header = graph.scan;

  const nodes: Record<string, Node> = {};
  for (const n of graph.nodes) {
    // The original core node payload lives in `.data`; the extracted columns are
    // authoritative for the identity fields. Spread data first, then pin the
    // identity + the map key to the store's node_key.
    const merged: Record<string, unknown> = {
      ...(n.data as Record<string, unknown>),
      id: n.key,
      type: n.type,
      name: n.name,
      filePath: n.filePath ?? '',
      line: n.line ?? 0,
      endLine: n.endLine ?? 0,
    };

    // Defensive defaults so a partial/forward-compat payload can't crash the
    // pure views (which read these arrays unconditionally on file nodes).
    if (merged.type === 'file') {
      merged.imports = Array.isArray(merged.imports) ? merged.imports : [];
      merged.exports = Array.isArray(merged.exports) ? merged.exports : [];
      merged.functions = Array.isArray(merged.functions) ? merged.functions : [];
      merged.classes = Array.isArray(merged.classes) ? merged.classes : [];
      merged.topLevelReferences = Array.isArray(merged.topLevelReferences)
        ? merged.topLevelReferences
        : [];
    }
    nodes[n.key] = merged as unknown as Node;
  }

  const connections: Connection[] = graph.connections.map((c) => {
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    return {
      id: c.key,
      sourceId: c.sourceKey,
      targetId: c.targetKey,
      type: c.type as ConnectionType,
      weight: typeof c.weight === 'number' ? c.weight : 0,
      metadata: {
        isCircular: Boolean(meta.isCircular),
        callCount: typeof meta.callCount === 'number' ? meta.callCount : 1,
        locations: Array.isArray(meta.locations) ? (meta.locations as []) : [],
      },
    };
  });

  const warnings: Warning[] = (findings?.warnings ?? []).map(mapWarning);

  return {
    id: header.scanId,
    projectPath: header.projectPath,
    projectName: header.projectName ?? '',
    status: header.status as ScanStatus,
    createdAt: header.createdAt,
    completedAt: header.completedAt,
    stats: emptyStats(header),
    nodes,
    connections,
    warnings,
    clusters: [],
    errors: [],
  };
}
