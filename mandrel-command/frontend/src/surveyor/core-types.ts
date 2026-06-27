/**
 * UI-local copy of the @surveyor/core data-contract TYPES (Surveyor P4c-frontend).
 *
 * Why a copy and not an import: `@surveyor/core` is a Node-only package — its
 * entry point drags in ts-morph / knip / dependency-cruiser (Node builtins),
 * which cannot be bundled into the browser. The command-UI is in a SEPARATE
 * repo from surveyor anyway, so a cross-repo import is impossible. These are the
 * exact shapes the surveyor scan emits on the wire (the same JSON the backend
 * READ endpoints return), ported verbatim so the pure view/lib layer that was
 * built against `@surveyor/core` runs here unchanged.
 *
 * The string ENUMS here are the serialized contract; the UI's `config/contract.ts`
 * mirrors their values as plain strings for runtime comparisons (the same boundary
 * pattern surveyor uses). View unit tests run against fixtures built from these
 * enums, so a drift between the mirror and the contract surfaces as a failing test.
 */

// ── Nodes ──────────────────────────────────────────────────────────────────

export enum NodeType {
  File = 'file',
  Function = 'function',
  Class = 'class',
  Cluster = 'cluster',
}

export enum SummarySource {
  Docstring = 'docstring',
  AI = 'ai',
  Manual = 'manual',
}

export interface BaseNode {
  id: string;
  type: NodeType;
  name: string;
  filePath: string;
  line: number;
  endLine: number;
}

export interface FileNode extends BaseNode {
  type: NodeType.File;
  imports: ImportInfo[];
  exports: ExportInfo[];
  functions: string[];
  classes: string[];
  /** Identifiers referenced at file's top-level scope (outside functions/classes). */
  topLevelReferences: string[];
}

export interface FunctionNode extends BaseNode {
  type: NodeType.Function;
  parentFileId: string;
  parentClassId: string | null;
  params: ParameterInfo[];
  returnType: string | null;
  isExported: boolean;
  isAsync: boolean;
  behavioral: BehavioralSummary | null;
  /** Function source code (included for browser-based analysis). */
  source?: string;
  /** Identifiers referenced within this function's body (for call graph analysis). */
  references: string[];
}

export interface ClassNode extends BaseNode {
  type: NodeType.Class;
  parentFileId: string;
  methods: string[];
  properties: PropertyInfo[];
  isExported: boolean;
  extends: string | null;
  implements: string[];
}

export type Node = FileNode | FunctionNode | ClassNode;
export type NodeMap = Record<string, Node>;

export interface ImportInfo {
  source: string;
  items: ImportItem[];
  isTypeOnly: boolean;
}

export interface ImportItem {
  name: string;
  alias: string | null;
  isDefault: boolean;
  isNamespace: boolean;
}

export interface ExportInfo {
  name: string;
  alias: string | null;
  isDefault: boolean;
  isTypeOnly: boolean;
  kind: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum' | 'reexport';
  /** For re-exports, the source module path. */
  source?: string;
}

export interface ParameterInfo {
  name: string;
  type: string | null;
  isOptional: boolean;
  defaultValue: string | null;
}

export interface PropertyInfo {
  name: string;
  type: string | null;
  visibility: 'public' | 'private' | 'protected';
  isStatic: boolean;
  isReadonly: boolean;
}

export interface BehavioralSummary {
  summary: string;
  source: SummarySource;
  analyzedAt: string;
  flags: BehavioralFlags;
}

export interface BehavioralFlags {
  databaseRead: boolean;
  databaseWrite: boolean;
  httpCall: boolean;
  fileRead: boolean;
  fileWrite: boolean;
  sendsNotification: boolean;
  modifiesGlobalState: boolean;
  hasSideEffects: boolean;
}

// ── Connections ──────────────────────────────────────────────────────────────

export enum ConnectionType {
  Import = 'import',
  FunctionCall = 'function_call',
  Inheritance = 'inheritance',
  Implementation = 'implementation',
  TypeReference = 'type_reference',
}

export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
  type: ConnectionType;
  weight: number;
  metadata: ConnectionMetadata;
}

export interface ConnectionMetadata {
  isCircular: boolean;
  callCount: number;
  locations: ConnectionLocation[];
}

export interface ConnectionLocation {
  filePath: string;
  line: number;
  column: number;
}

// ── Warnings ──────────────────────────────────────────────────────────────────

export enum WarningLevel {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
}

export enum WarningCategory {
  CircularDependency = 'circular_dependency',
  OrphanedCode = 'orphaned_code',
  DuplicateCode = 'duplicate_code',
  LargeFile = 'large_file',
  DeepNesting = 'deep_nesting',
  MissingTypes = 'missing_types',
  UnusedExport = 'unused_export',
  SecurityConcern = 'security_concern',
}

export enum WarningSource {
  Surveyor = 'surveyor',
  Knip = 'knip',
  DependencyCruiser = 'dependency-cruiser',
}

export interface Warning {
  id: string;
  category: WarningCategory;
  level: WarningLevel;
  title: string;
  description: string;
  affectedNodes: string[];
  suggestion: WarningSuggestion | null;
  detectedAt: string;
  source: WarningSource;
  /** 0..1 confidence this is a real, actionable finding. */
  confidence: number;
  dismissible: boolean;
}

export interface WarningSuggestion {
  summary: string;
  reasoning: string;
  codeExample: string | null;
  autoFixable: boolean;
}

// ── Scan ──────────────────────────────────────────────────────────────────────

export enum ScanStatus {
  Pending = 'pending',
  Parsing = 'parsing',
  Analyzing = 'analyzing',
  Complete = 'complete',
  Failed = 'failed',
}

export interface ScanStats {
  totalFiles: number;
  totalFunctions: number;
  totalClasses: number;
  totalConnections: number;
  totalWarnings: number;
  warningsByLevel: Record<WarningLevel, number>;
  nodesByType: Record<string, number>;
  analyzedCount: number;
  pendingAnalysis: number;
}

export interface ScanError {
  filePath: string;
  line: number | null;
  message: string;
  recoverable: boolean;
}

export interface ScanResult {
  id: string;
  projectPath: string;
  projectName: string;
  status: ScanStatus;
  createdAt: string;
  completedAt: string | null;
  stats: ScanStats;
  nodes: NodeMap;
  connections: Connection[];
  warnings: Warning[];
  /** Clusters are not consumed by the current views; kept for shape fidelity. */
  clusters: unknown[];
  errors: ScanError[];
}
