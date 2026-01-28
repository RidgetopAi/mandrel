/**
 * Bug Workflow Module
 *
 * Re-exports all bug workflow components.
 */

// API Router
export { bugWorkflowRouter } from './api.js';

// Repository
export * as bugRepository from './repository.js';

// Runner
export { runBugAnalysis, runImplementation, checkClaudeAvailable } from './runner.js';

// Mandrel Hooks
export { bugWorkflowHooks, getContextForBugAnalysis } from './mandrel.js';

// SSE Streaming (Phase 3 - Visibility)
export {
  workflowEvents,
  registerStreamRoute,
  handleSSEStream,
  emitInvestigationEvents,
  notifyStateChange,
  notifyAnalysisComplete,
  notifyImplementationComplete,
  notifyError,
  getConnectionCount,
  getTotalConnectionCount,
} from './stream.js';

// Claude Output Capture (Phase 3 - Visibility)
export {
  parseLine,
  processChunk,
  flushBuffer,
  parseCompleteOutput,
  parseToolCalls,
  toolCallsToEvents,
  createCaptureState,
  type CaptureState,
} from './capture.js';
