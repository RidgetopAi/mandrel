/**
 * Scan-related type definitions
 * See CONTRACTS.md for full documentation
 */

import type { NodeMap } from './node.types';
import type { Connection } from './connection.types';
import type { Warning, WarningLevel } from './warning.types';
import type { Cluster } from './cluster.types';

export enum ScanStatus {
  Pending = 'pending',
  Parsing = 'parsing',
  Analyzing = 'analyzing',
  Complete = 'complete',
  Failed = 'failed',
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
  clusters: Cluster[];
  errors: ScanError[];
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

export interface ScanDiff {
  baseId: string;
  compareId: string;
  added: string[];
  removed: string[];
  modified: string[];
  stats: {
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
  };
}
