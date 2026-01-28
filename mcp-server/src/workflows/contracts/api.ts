/**
 * Bug Workflow API Contract
 *
 * Request/response schemas for all API endpoints.
 * These types are shared between frontend and backend.
 *
 * Endpoints:
 * - POST /api/workflows/bug           - Create new workflow
 * - GET  /api/workflows/bug/:id       - Get workflow state
 * - GET  /api/workflows/bug/:id/stream - SSE for investigation events (Phase 3)
 * - POST /api/workflows/bug/:id/review - Submit human review
 * - POST /api/workflows/bug/:id/implement - Trigger implementation
 */

import { z } from 'zod';
import {
  BugReportSchema,
  ReviewDecisionSchema,
  CodeChangeSchema,
  BugWorkflowSchema,
  BugAnalysisSchema,
  ImplementationResultSchema,
} from './types.js';
import { BugWorkflowStates } from './states.js';

// =============================================================================
// POST /api/workflows/bug - Create Workflow
// =============================================================================

export const CreateBugWorkflowRequestSchema = z.object({
  bugReport: BugReportSchema,
  projectPath: z.string().min(1),
});

export const CreateBugWorkflowResponseSchema = z.object({
  success: z.literal(true),
  workflowId: z.string().uuid(),
  state: z.enum(BugWorkflowStates),
});

// =============================================================================
// GET /api/workflows/bug/:id - Get Workflow State
// =============================================================================

export const GetWorkflowParamsSchema = z.object({
  id: z.string().uuid(),
});

export const GetWorkflowResponseSchema = z.object({
  success: z.literal(true),
  workflow: BugWorkflowSchema,
});

// =============================================================================
// POST /api/workflows/bug/:id/review - Submit Review
// =============================================================================

export const SubmitReviewRequestSchema = z.object({
  decision: ReviewDecisionSchema,
  feedback: z.string().optional(),
});

export const SubmitReviewResponseSchema = z.object({
  success: z.literal(true),
  workflowId: z.string().uuid(),
  newState: z.enum(BugWorkflowStates),
  message: z.string(),
});

// =============================================================================
// POST /api/workflows/bug/:id/implement - Trigger Implementation
// =============================================================================

export const TriggerImplementRequestSchema = z.object({
  approvedChanges: z.array(CodeChangeSchema),
  runTests: z.boolean().default(true),
});

export const TriggerImplementResponseSchema = z.object({
  success: z.literal(true),
  workflowId: z.string().uuid(),
  state: z.enum(BugWorkflowStates),
  message: z.string(),
});

// =============================================================================
// Error Response (All Endpoints)
// =============================================================================

export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

// =============================================================================
// SSE Event Types (Phase 3 - GET /api/workflows/bug/:id/stream)
// =============================================================================

export const SSEEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('investigation'),
    data: z.object({
      timestamp: z.string(),
      sequence: z.number(),
      action: z.string(),
      details: z.record(z.string()),
    }),
  }),
  z.object({
    type: z.literal('state_change'),
    data: z.object({
      from: z.enum(BugWorkflowStates),
      to: z.enum(BugWorkflowStates),
      timestamp: z.string(),
    }),
  }),
  z.object({
    type: z.literal('analysis_complete'),
    data: BugAnalysisSchema,
  }),
  z.object({
    type: z.literal('implementation_complete'),
    data: ImplementationResultSchema,
  }),
  z.object({
    type: z.literal('error'),
    data: z.object({
      message: z.string(),
      stage: z.string(),
    }),
  }),
]);

// =============================================================================
// Exported Types
// =============================================================================

export type CreateBugWorkflowRequest = z.infer<typeof CreateBugWorkflowRequestSchema>;
export type CreateBugWorkflowResponse = z.infer<typeof CreateBugWorkflowResponseSchema>;
export type GetWorkflowParams = z.infer<typeof GetWorkflowParamsSchema>;
export type GetWorkflowResponse = z.infer<typeof GetWorkflowResponseSchema>;
export type SubmitReviewRequest = z.infer<typeof SubmitReviewRequestSchema>;
export type SubmitReviewResponse = z.infer<typeof SubmitReviewResponseSchema>;
export type TriggerImplementRequest = z.infer<typeof TriggerImplementRequestSchema>;
export type TriggerImplementResponse = z.infer<typeof TriggerImplementResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type SSEEvent = z.infer<typeof SSEEventSchema>;
