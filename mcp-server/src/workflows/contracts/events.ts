/**
 * Investigation Event Schema (Phase 3 - Visibility Layer)
 *
 * Zod schemas for real-time investigation events.
 * These events make AI investigation VISIBLE for teaching.
 *
 * Users see:
 * - What files AI reads
 * - What queries AI searches
 * - What hypotheses AI forms
 * - What evidence AI finds
 * - Why AI rejects hypotheses
 */

import { z } from 'zod';

// =============================================================================
// Investigation Action Types
// =============================================================================

/**
 * All possible investigation actions.
 * Each action represents a step in the AI's debugging process.
 */
export const InvestigationActionSchema = z.enum([
  'file_read',       // Reading a file to understand code
  'code_search',     // Searching codebase for patterns
  'hypothesis',      // Forming a theory about the bug
  'evidence',        // Found supporting evidence
  'rejection',       // Rejected a hypothesis (important for teaching!)
  'test_check',      // Checking test coverage
  'fix_proposed',    // Proposing a specific change
]);

export type InvestigationAction = z.infer<typeof InvestigationActionSchema>;

// =============================================================================
// Event Details
// =============================================================================

/**
 * Details vary by action type.
 * All fields optional - different actions populate different fields.
 */
export const InvestigationDetailsSchema = z.object({
  // File operations
  file: z.string().optional(),
  line: z.number().optional(),
  lineEnd: z.number().optional(),
  linesRead: z.number().optional(),

  // Search operations
  query: z.string().optional(),
  pattern: z.string().optional(),
  matchCount: z.number().optional(),

  // Analysis/reasoning
  finding: z.string().optional(),
  reason: z.string().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),

  // Fix proposal
  changeType: z.enum(['edit', 'add', 'delete']).optional(),
  summary: z.string().optional(),
});

export type InvestigationDetails = z.infer<typeof InvestigationDetailsSchema>;

// =============================================================================
// Complete Investigation Event
// =============================================================================

/**
 * A single investigation event.
 * Emitted in real-time as AI investigates the bug.
 */
export const InvestigationEventSchema = z.object({
  /** When this event occurred */
  timestamp: z.date(),

  /** Workflow this event belongs to */
  workflowId: z.string().uuid(),

  /** Sequence number for ordering (starts at 1) */
  sequence: z.number().int().positive(),

  /** What action was taken */
  action: InvestigationActionSchema,

  /** Details about the action */
  details: InvestigationDetailsSchema,
});

export type InvestigationEvent = z.infer<typeof InvestigationEventSchema>;

// =============================================================================
// Serialization for SSE
// =============================================================================

/**
 * Serializable version of InvestigationEvent for SSE transport.
 * Timestamps converted to ISO strings.
 */
export const SerializedInvestigationEventSchema = z.object({
  timestamp: z.string(), // ISO string
  workflowId: z.string().uuid(),
  sequence: z.number().int().positive(),
  action: InvestigationActionSchema,
  details: InvestigationDetailsSchema,
});

export type SerializedInvestigationEvent = z.infer<typeof SerializedInvestigationEventSchema>;

/**
 * Convert InvestigationEvent to serializable format
 */
export function serializeEvent(event: InvestigationEvent): SerializedInvestigationEvent {
  return {
    ...event,
    timestamp: event.timestamp.toISOString(),
  };
}

/**
 * Convert serialized event back to InvestigationEvent
 */
export function deserializeEvent(data: SerializedInvestigationEvent): InvestigationEvent {
  return {
    ...data,
    timestamp: new Date(data.timestamp),
  };
}

// =============================================================================
// Event Factory Functions
// =============================================================================

/**
 * Create a file_read event
 */
export function createFileReadEvent(
  workflowId: string,
  sequence: number,
  file: string,
  linesRead?: number,
  line?: number,
  lineEnd?: number
): InvestigationEvent {
  return {
    timestamp: new Date(),
    workflowId,
    sequence,
    action: 'file_read',
    details: { file, linesRead, line, lineEnd },
  };
}

/**
 * Create a code_search event
 */
export function createSearchEvent(
  workflowId: string,
  sequence: number,
  query: string,
  matchCount?: number,
  pattern?: string
): InvestigationEvent {
  return {
    timestamp: new Date(),
    workflowId,
    sequence,
    action: 'code_search',
    details: { query, matchCount, pattern },
  };
}

/**
 * Create a hypothesis event
 */
export function createHypothesisEvent(
  workflowId: string,
  sequence: number,
  finding: string,
  confidence?: 'high' | 'medium' | 'low'
): InvestigationEvent {
  return {
    timestamp: new Date(),
    workflowId,
    sequence,
    action: 'hypothesis',
    details: { finding, confidence },
  };
}

/**
 * Create an evidence event
 */
export function createEvidenceEvent(
  workflowId: string,
  sequence: number,
  finding: string,
  file?: string,
  line?: number
): InvestigationEvent {
  return {
    timestamp: new Date(),
    workflowId,
    sequence,
    action: 'evidence',
    details: { finding, file, line },
  };
}

/**
 * Create a rejection event
 */
export function createRejectionEvent(
  workflowId: string,
  sequence: number,
  finding: string,
  reason: string
): InvestigationEvent {
  return {
    timestamp: new Date(),
    workflowId,
    sequence,
    action: 'rejection',
    details: { finding, reason },
  };
}

/**
 * Create a test_check event
 */
export function createTestCheckEvent(
  workflowId: string,
  sequence: number,
  file: string,
  finding?: string
): InvestigationEvent {
  return {
    timestamp: new Date(),
    workflowId,
    sequence,
    action: 'test_check',
    details: { file, finding },
  };
}

/**
 * Create a fix_proposed event
 */
export function createFixProposedEvent(
  workflowId: string,
  sequence: number,
  file: string,
  summary: string,
  changeType?: 'edit' | 'add' | 'delete'
): InvestigationEvent {
  return {
    timestamp: new Date(),
    workflowId,
    sequence,
    action: 'fix_proposed',
    details: { file, summary, changeType },
  };
}
