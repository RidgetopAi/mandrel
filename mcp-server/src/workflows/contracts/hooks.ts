/**
 * Mandrel Integration Hooks Contract
 *
 * These hooks are REQUIRED, not optional.
 * Missing any hook = TypeScript error at construction time.
 *
 * The createWorkflowRunner factory ensures all hooks are provided.
 */

import type { BugWorkflow, BugAnalysis, Review, ImplementationResult } from './types.js';

/**
 * Investigation event types
 * Used for real-time streaming of AI investigation progress.
 * Expanded in Phase 3 with detailed event schemas.
 */
export interface InvestigationEvent {
  timestamp: Date;
  workflowId: string;
  sequence: number;
  action:
    | 'file_read'      // Reading a file
    | 'code_search'    // Searching codebase
    | 'hypothesis'     // Forming a theory
    | 'evidence'       // Found supporting evidence
    | 'rejection'      // Rejected a hypothesis
    | 'test_check'     // Checking test coverage
    | 'fix_proposed';  // Proposing a change
  details: {
    file?: string;
    line?: number;
    query?: string;
    finding?: string;
    reason?: string;
  };
}

/**
 * REQUIRED Mandrel Integration Hooks
 *
 * All 6 hooks must be implemented. This interface enforces
 * that Mandrel integration is complete - not partial.
 *
 * Each hook maps to a specific context type in Mandrel:
 * - onWorkflowStart    → context_store type:planning
 * - onInvestigationStep → context_store type:discussion
 * - onProposalGenerated → context_store type:code
 * - onHumanDecision    → context_store type:decision
 * - onImplementationComplete → context_store type:completion
 * - onWorkflowFail     → context_store type:error
 */
export interface WorkflowMandrelHooks {
  /**
   * Called when a new bug workflow is created.
   * Store the initial bug report for context retrieval.
   */
  onWorkflowStart(workflow: BugWorkflow): Promise<void>;

  /**
   * Called during AI investigation for each step.
   * Stream events for real-time visibility and teaching.
   */
  onInvestigationStep(workflowId: string, event: InvestigationEvent): Promise<void>;

  /**
   * Called when AI generates a fix proposal.
   * Store the proposal for review and future reference.
   */
  onProposalGenerated(workflowId: string, analysis: BugAnalysis): Promise<void>;

  /**
   * Called when human makes a review decision.
   * Capture the decision and feedback for learning.
   */
  onHumanDecision(workflowId: string, review: Review): Promise<void>;

  /**
   * Called when implementation completes (success or test failure).
   * Store the final result for verification.
   */
  onImplementationComplete(workflowId: string, result: ImplementationResult): Promise<void>;

  /**
   * Called when workflow fails at any stage.
   * Store error context for debugging and improvement.
   */
  onWorkflowFail(workflowId: string, error: Error, stage: string): Promise<void>;
}

/**
 * Factory function that ensures all hooks are provided.
 *
 * TypeScript will error if any hook is missing:
 * ```typescript
 * const runner = createWorkflowRunner({
 *   onWorkflowStart: async (w) => { ... },
 *   // Error: missing onInvestigationStep, onProposalGenerated, etc.
 * });
 * ```
 */
export function createWorkflowRunner(hooks: WorkflowMandrelHooks) {
  return {
    hooks,
    // Runner implementation will be added in Phase 2
  };
}

/**
 * Type guard to check if hooks object is complete
 */
export function isCompleteHooks(obj: unknown): obj is WorkflowMandrelHooks {
  if (!obj || typeof obj !== 'object') return false;
  const hooks = obj as Record<string, unknown>;

  const requiredHooks = [
    'onWorkflowStart',
    'onInvestigationStep',
    'onProposalGenerated',
    'onHumanDecision',
    'onImplementationComplete',
    'onWorkflowFail',
  ];

  return requiredHooks.every(
    hook => typeof hooks[hook] === 'function'
  );
}
