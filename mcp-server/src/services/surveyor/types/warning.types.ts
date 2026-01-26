/**
 * Warning-related type definitions
 * See CONTRACTS.md for full documentation
 */

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

export interface Warning {
  id: string;
  category: WarningCategory;
  level: WarningLevel;
  title: string;
  description: string;
  affectedNodes: string[];
  suggestion: WarningSuggestion | null;
  detectedAt: string;
}

export interface WarningSuggestion {
  summary: string;
  reasoning: string;
  codeExample: string | null;
  autoFixable: boolean;
}
