/**
 * Cluster-related type definitions
 * See CONTRACTS.md for full documentation
 */

export enum ClusteringMethod {
  Folder = 'folder',
  Smart = 'smart',
  Manual = 'manual',
}

export enum SmartClusterCategory {
  Backend = 'backend',
  Frontend = 'frontend',
  API = 'api',
  Database = 'database',
  Auth = 'auth',
  Utils = 'utils',
  Types = 'types',
  Config = 'config',
  Tests = 'tests',
  Unknown = 'unknown',
}

export enum ClusterHealth {
  Healthy = 'healthy',
  Warning = 'warning',
  Critical = 'critical',
}

export interface Cluster {
  id: string;
  name: string;
  method: ClusteringMethod;
  category: SmartClusterCategory | null;
  nodeIds: string[];
  childClusterIds: string[];
  parentClusterId: string | null;
  stats: ClusterStats;
  health: ClusterHealth;
  warningCount: number;
}

export interface ClusterStats {
  fileCount: number;
  functionCount: number;
  classCount: number;
  externalConnectionCount: number;
  internalConnectionCount: number;
}
