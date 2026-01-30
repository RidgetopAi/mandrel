/**
 * Bug Workflow Contracts
 *
 * This is the source of truth for the Bug Workflow feature.
 * All implementations must satisfy these contracts.
 *
 * If TypeScript compiles, the implementation matches the contract.
 */

// State Machine
export {
  BugWorkflowStates,
  StateTransitions,
  canTransition,
  getValidTransitions,
  isTerminalState,
  requiresHumanInput,
  assertTransition,
  InvalidTransitionError,
  type BugWorkflowState,
} from './states.js';

// Type Schemas (Zod)
export {
  // Schemas
  SeveritySchema,
  ConfidenceSchema,
  BugReportSchema,
  CodeChangeSchema,
  BugAnalysisSchema,
  ReviewDecisionSchema,
  ReviewSchema,
  BuildResultSchema,
  TestResultSchema,
  GitResultSchema,
  ImplementationResultSchema,
  BugWorkflowSchema,
  // Types
  type Severity,
  type Confidence,
  type BugReport,
  type CodeChange,
  type BugAnalysis,
  type ReviewDecision,
  type Review,
  type BuildResult,
  type TestResult,
  type GitResult,
  type ImplementationResult,
  type BugWorkflow,
} from './types.js';

// Mandrel Hooks
export {
  createWorkflowRunner,
  isCompleteHooks,
  type WorkflowMandrelHooks,
  type InvestigationEvent,
} from './hooks.js';

// Investigation Events (Phase 3 - Visibility)
export {
  // Schemas
  InvestigationActionSchema,
  InvestigationDetailsSchema,
  InvestigationEventSchema,
  SerializedInvestigationEventSchema,
  // Types
  type InvestigationAction,
  type InvestigationDetails,
  type SerializedInvestigationEvent,
  // Serialization
  serializeEvent,
  deserializeEvent,
  // Factory functions
  createFileReadEvent,
  createSearchEvent,
  createHypothesisEvent,
  createEvidenceEvent,
  createRejectionEvent,
  createTestCheckEvent,
  createFixProposedEvent,
} from './events.js';

// API Contracts
export {
  // Request/Response Schemas
  CreateBugWorkflowRequestSchema,
  CreateBugWorkflowResponseSchema,
  GetWorkflowParamsSchema,
  GetWorkflowResponseSchema,
  SubmitReviewRequestSchema,
  SubmitReviewResponseSchema,
  TriggerImplementRequestSchema,
  TriggerImplementResponseSchema,
  ErrorResponseSchema,
  SSEEventSchema,
  // Types
  type CreateBugWorkflowRequest,
  type CreateBugWorkflowResponse,
  type GetWorkflowParams,
  type GetWorkflowResponse,
  type SubmitReviewRequest,
  type SubmitReviewResponse,
  type TriggerImplementRequest,
  type TriggerImplementResponse,
  type ErrorResponse,
  type SSEEvent,
} from './api.js';
