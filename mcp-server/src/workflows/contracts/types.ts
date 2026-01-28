/**
 * Bug Workflow Type Schemas
 *
 * Zod schemas provide both compile-time TypeScript safety
 * and runtime validation at API boundaries.
 *
 * Adapted from: ridgetopai-alpha/backend/src/types.ts
 */

import { z } from 'zod';
import { BugWorkflowStates, type BugWorkflowState } from './states.js';

// =============================================================================
// Enums
// =============================================================================

export const SeveritySchema = z.enum(['blocker', 'major', 'minor']);
export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);

// =============================================================================
// Bug Report (Input)
// =============================================================================

export const BugReportSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  stepsToReproduce: z.string().optional(),
  expectedBehavior: z.string().optional(),
  actualBehavior: z.string().optional(),
  severity: SeveritySchema,
});

// =============================================================================
// Code Change (Proposed Fix)
// =============================================================================

export const CodeChangeSchema = z.object({
  file: z.string(),
  original: z.string(),
  proposed: z.string(),
  explanation: z.string().optional(),
});

// =============================================================================
// Bug Analysis (AI Output)
// =============================================================================

export const BugAnalysisSchema = z.object({
  rootCause: z.string(),
  evidence: z.string(),
  confidence: ConfidenceSchema,
  questions: z.array(z.string()).optional(),
  proposedFix: z.object({
    explanation: z.string(),
    changes: z.array(CodeChangeSchema),
    risks: z.array(z.string()),
    testNeeds: z.array(z.string()),
  }).optional(),
});

// =============================================================================
// Review (Human Decision)
// =============================================================================

export const ReviewDecisionSchema = z.enum(['approved', 'changes_requested', 'rejected']);

export const ReviewSchema = z.object({
  decision: ReviewDecisionSchema,
  feedback: z.string().optional(),
  reviewedAt: z.date(),
});

// =============================================================================
// Implementation Result
// =============================================================================

export const BuildResultSchema = z.object({
  success: z.boolean(),
  command: z.string(),
  output: z.string().optional(),
});

export const TestResultSchema = z.object({
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  duration: z.number(),
  output: z.string().optional(),
});

export const ImplementationResultSchema = z.object({
  success: z.boolean(),
  changedFiles: z.array(z.string()),
  buildResult: BuildResultSchema.optional(),
  testResults: TestResultSchema.optional(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});

// =============================================================================
// Complete Workflow
// =============================================================================

export const BugWorkflowSchema = z.object({
  id: z.string().uuid(),
  projectPath: z.string(),
  state: z.enum(BugWorkflowStates),
  bugReport: BugReportSchema,
  analysis: BugAnalysisSchema.optional(),
  review: ReviewSchema.optional(),
  implementation: ImplementationResultSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  failedAt: z.date().optional(),
  failureReason: z.string().optional(),
  failureStage: z.string().optional(),
});

// =============================================================================
// Exported Types (inferred from schemas)
// =============================================================================

export type Severity = z.infer<typeof SeveritySchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type BugReport = z.infer<typeof BugReportSchema>;
export type CodeChange = z.infer<typeof CodeChangeSchema>;
export type BugAnalysis = z.infer<typeof BugAnalysisSchema>;
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type BuildResult = z.infer<typeof BuildResultSchema>;
export type TestResult = z.infer<typeof TestResultSchema>;
export type ImplementationResult = z.infer<typeof ImplementationResultSchema>;
export type BugWorkflow = z.infer<typeof BugWorkflowSchema>;

// Re-export state type for convenience
export type { BugWorkflowState };
