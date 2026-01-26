/**
 * Node-related type definitions
 * See CONTRACTS.md for full documentation
 */

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
  /** Identifiers referenced at file's top-level scope (outside functions/classes) */
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
  /** Function source code (included for browser-based analysis) */
  source?: string;
  /** Identifiers referenced within this function's body (for call graph analysis) */
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
  /** For re-exports, the source module path (e.g., './Foo' in 'export { X } from "./Foo"') */
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
