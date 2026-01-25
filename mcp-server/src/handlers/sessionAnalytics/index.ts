/**
 * Session Analytics Module
 * 
 * Barrel exports for session analytics functionality.
 * 
 * Structure:
 * - analytics/   - Session statistics and lifecycle
 * - management/  - Session control and assignment
 * - tracking/    - Activity and file tracking (Phase 2D/2E)
 * - utils.ts     - Simple wrapper functions
 */

// Types
export * from './types.js';

// Handlers
export { SessionAnalyticsHandler } from './analytics/index.js';
export { SessionManagementHandler } from './management/index.js';
export { ActivityHandler } from './tracking/index.js';

// Utility functions
export {
  getSessionStatistics,
  recordSessionOperation,
  startSessionTracking
} from './utils.js';

// Default export for backward compatibility
import { SessionAnalyticsHandler } from './analytics/index.js';
export default SessionAnalyticsHandler;
