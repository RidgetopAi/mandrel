/**
 * AIDIS Session Tracking Service
 * 
 * This file re-exports from the modular session/ directory for backward compatibility.
 * The original 1,990-line monolithic service has been split into:
 * 
 * src/services/session/
 * ├── SessionTracker.ts      # Façade (backward compatible API)
 * ├── index.ts               # Barrel exports
 * ├── types.ts               # Module types
 * ├── domain/
 * │   ├── lifecycle/         # SessionLifecycleService, projectResolution
 * │   ├── tracking/          # TokenTracker, OperationTracker
 * │   ├── productivity/      # calculateBasicProductivity, calculateWeightedProductivity
 * │   └── stats/             # SessionStatsService
 * ├── infra/
 * │   ├── db/                # SessionRepo, ActivityRepo, FileRepo, AnalyticsEventsRepo
 * │   └── git/               # GitFileSync
 * └── state/                 # ActiveSessionStore, TokenStore, ActivityCountStore
 */

// Re-export everything from the modular session module
export {
  SessionTracker,
  ensureActiveSession,
  recordSessionOperation,
  getCurrentSession,
  type SessionData,
  type SessionStats,
  type SessionActivity,
  type SessionFile,
  type ProductivityConfig
} from './session/index.js';
