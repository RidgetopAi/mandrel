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
