/**
 * Bug Workflow Types
 *
 * Type definitions extracted from the backend contracts.
 * These types match ~/aidis/mcp-server/src/workflows/contracts/
 */

// =============================================================================
// State Machine
// =============================================================================

export const BugWorkflowStates = [
  'draft',
  'submitted',
  'analyzing',
  'proposed',
  'reviewing',
  'approved',
  'changes_requested',
  'rejected',
  'implementing',
  'verifying',
  'completed',
  'failed',
] as const;

export type BugWorkflowState = typeof BugWorkflowStates[number];

export const StateTransitions: Record<BugWorkflowState, readonly BugWorkflowState[]> = {
  draft: ['submitted'],
  submitted: ['analyzing', 'failed'],
  analyzing: ['proposed', 'failed'],
  proposed: ['reviewing'],
  reviewing: ['approved', 'changes_requested', 'rejected'],
  approved: ['implementing'],
  changes_requested: ['analyzing'],
  rejected: ['draft'],
  implementing: ['verifying', 'failed'],
  verifying: ['completed', 'failed'],
  completed: [],
  failed: ['draft'],
} as const;

export function requiresHumanInput(state: BugWorkflowState): boolean {
  return state === 'reviewing' || state === 'draft';
}

export function isTerminalState(state: BugWorkflowState): boolean {
  return StateTransitions[state].length === 0;
}

// =============================================================================
// Core Types
// =============================================================================

export type Severity = 'blocker' | 'major' | 'minor';
export type Confidence = 'high' | 'medium' | 'low';
export type ReviewDecision = 'approved' | 'changes_requested' | 'rejected';

export interface BugReport {
  title: string;
  description: string;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  severity: Severity;
}

export interface CodeChange {
  file: string;
  original: string;
  proposed: string;
  explanation?: string;
}

export interface BugAnalysis {
  rootCause: string;
  evidence: string;
  confidence: Confidence;
  questions?: string[];
  proposedFix?: {
    explanation: string;
    changes: CodeChange[];
    risks: string[];
    testNeeds: string[];
  };
}

export interface Review {
  decision: ReviewDecision;
  feedback?: string;
  reviewedAt: Date;
}

export interface BuildResult {
  success: boolean;
  command: string;
  output?: string;
}

export interface TestResult {
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  output?: string;
}

export interface GitResult {
  branchName: string;
  commitHash: string;
  commitMessage: string;
  pushed: boolean;
  remote?: string;
}

export interface ImplementationResult {
  success: boolean;
  changedFiles: string[];
  buildResult?: BuildResult;
  testResults?: TestResult;
  gitResult?: GitResult;
  warnings: string[];
  errors: string[];
}

export interface BugWorkflow {
  id: string;
  projectPath: string;
  branchName?: string;
  state: BugWorkflowState;
  bugReport: BugReport;
  analysis?: BugAnalysis;
  review?: Review;
  implementation?: ImplementationResult;
  createdAt: Date;
  updatedAt: Date;
  failedAt?: Date;
  failureReason?: string;
  failureStage?: string;
}

// =============================================================================
// Investigation Events
// =============================================================================

export type InvestigationAction =
  | 'file_read'
  | 'code_search'
  | 'hypothesis'
  | 'evidence'
  | 'rejection'
  | 'test_check'
  | 'fix_proposed';

export interface InvestigationDetails {
  file?: string;
  line?: number;
  lineEnd?: number;
  linesRead?: number;
  query?: string;
  pattern?: string;
  matchCount?: number;
  finding?: string;
  reason?: string;
  confidence?: Confidence;
  changeType?: 'edit' | 'add' | 'delete';
  summary?: string;
}

export interface InvestigationEvent {
  timestamp: Date;
  workflowId: string;
  sequence: number;
  action: InvestigationAction;
  details: InvestigationDetails;
}

export interface SerializedInvestigationEvent {
  timestamp: string;
  workflowId: string;
  sequence: number;
  action: InvestigationAction;
  details: InvestigationDetails;
}

// =============================================================================
// API Types
// =============================================================================

export interface CreateBugWorkflowRequest {
  bugReport: BugReport;
  projectPath: string;
  branchName?: string;
}

export interface CreateBugWorkflowResponse {
  success: true;
  workflowId: string;
  state: BugWorkflowState;
}

export interface GetWorkflowResponse {
  success: true;
  workflow: BugWorkflow;
}

export interface SubmitReviewRequest {
  decision: ReviewDecision;
  feedback?: string;
}

export interface SubmitReviewResponse {
  success: true;
  workflowId: string;
  newState: BugWorkflowState;
  message: string;
}

export interface TriggerImplementRequest {
  approvedChanges: CodeChange[];
  runTests?: boolean;
}

export interface TriggerImplementResponse {
  success: true;
  workflowId: string;
  state: BugWorkflowState;
  message: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
}

// SSE Event Types
export type SSEEvent =
  | { type: 'investigation'; data: SerializedInvestigationEvent }
  | { type: 'state_change'; data: { from: BugWorkflowState; to: BugWorkflowState; timestamp: string } }
  | { type: 'analysis_complete'; data: BugAnalysis }
  | { type: 'implementation_complete'; data: ImplementationResult }
  | { type: 'error'; data: { message: string; stage: string } };
