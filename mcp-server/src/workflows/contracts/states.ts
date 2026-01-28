/**
 * Bug Workflow State Machine
 *
 * 12 states with enforced transitions.
 * State transitions are the source of truth - if TypeScript compiles,
 * the implementation matches the contract.
 */

/**
 * All possible workflow states
 */
export const BugWorkflowStates = [
  'draft',             // Initial state - bug report being created
  'submitted',         // Bug report submitted, ready for analysis
  'analyzing',         // AI is investigating the bug
  'proposed',          // AI has proposed a fix, awaiting review
  'reviewing',         // Human is reviewing the proposal
  'approved',          // Human approved the fix
  'changes_requested', // Human requested changes to the proposal
  'rejected',          // Human rejected the fix entirely
  'implementing',      // Approved fix is being applied
  'verifying',         // Implementation complete, running tests
  'completed',         // All done, tests passed
  'failed',            // Workflow failed at some stage
] as const;

export type BugWorkflowState = typeof BugWorkflowStates[number];

/**
 * Valid state transitions
 * Key: current state
 * Value: array of valid next states
 */
export const StateTransitions: Record<BugWorkflowState, readonly BugWorkflowState[]> = {
  draft: ['submitted'],
  submitted: ['analyzing', 'failed'],
  analyzing: ['proposed', 'failed'],
  proposed: ['reviewing'],
  reviewing: ['approved', 'changes_requested', 'rejected'],
  approved: ['implementing'],
  changes_requested: ['analyzing'],  // Re-analyze with feedback
  rejected: ['draft'],               // Start over
  implementing: ['verifying', 'failed'],
  verifying: ['completed', 'failed'],
  completed: [],                     // Terminal state
  failed: ['draft'],                 // Can retry from beginning
} as const;

/**
 * Type-safe transition check
 * Returns true if the transition is valid
 */
export function canTransition(
  from: BugWorkflowState,
  to: BugWorkflowState
): boolean {
  const validTransitions = StateTransitions[from];
  return validTransitions.includes(to);
}

/**
 * Get valid next states from current state
 */
export function getValidTransitions(current: BugWorkflowState): readonly BugWorkflowState[] {
  return StateTransitions[current];
}

/**
 * Check if state is terminal (no outgoing transitions)
 */
export function isTerminalState(state: BugWorkflowState): boolean {
  return StateTransitions[state].length === 0;
}

/**
 * Check if state requires human input
 */
export function requiresHumanInput(state: BugWorkflowState): boolean {
  return state === 'reviewing' || state === 'draft';
}

/**
 * State transition error for invalid transitions
 */
export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: BugWorkflowState,
    public readonly to: BugWorkflowState
  ) {
    const valid = StateTransitions[from];
    super(
      `Invalid transition from '${from}' to '${to}'. ` +
      `Valid transitions: [${valid.join(', ')}]`
    );
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Assert a transition is valid, throw if not
 */
export function assertTransition(
  from: BugWorkflowState,
  to: BugWorkflowState
): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}
