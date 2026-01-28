/**
 * Bug Workflow API Routes
 *
 * Express routes using contract types.
 * All requests are validated with Zod schemas.
 */

import { Router, type Request, type Response } from 'express';
import {
  CreateBugWorkflowRequestSchema,
  SubmitReviewRequestSchema,
  TriggerImplementRequestSchema,
  GetWorkflowParamsSchema,
  type CreateBugWorkflowResponse,
  type GetWorkflowResponse,
  type SubmitReviewResponse,
  type TriggerImplementResponse,
  type ErrorResponse,
  type BugWorkflowState,
  InvalidTransitionError,
} from '../contracts/index.js';
import * as repository from './repository.js';
import { runBugAnalysis, runImplementation } from './runner.js';
import { bugWorkflowHooks, getContextForBugAnalysis } from './mandrel.js';
import {
  registerStreamRoute,
  notifyStateChange,
  notifyAnalysisComplete,
  notifyImplementationComplete,
  notifyError,
} from './stream.js';

export const bugWorkflowRouter = Router();

// Register SSE stream route (Phase 3 - Visibility)
registerStreamRoute(bugWorkflowRouter);

/**
 * POST /api/workflows/bug
 * Create a new bug workflow
 */
bugWorkflowRouter.post('/', async (req: Request, res: Response) => {
  try {
    // Validate request
    const parseResult = CreateBugWorkflowRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      const error: ErrorResponse = {
        success: false,
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        details: parseResult.error.issues,
      };
      return res.status(400).json(error);
    }

    const { bugReport, projectPath } = parseResult.data;

    // Create workflow in database
    const workflow = await repository.createWorkflow(bugReport, projectPath);

    // Call Mandrel hook
    await bugWorkflowHooks.onWorkflowStart(workflow);

    const response: CreateBugWorkflowResponse = {
      success: true,
      workflowId: workflow.id,
      state: workflow.state,
    };

    return res.status(201).json(response);
  } catch (error) {
    console.error('[BugWorkflowAPI] Error creating workflow:', error);
    const errorResponse: ErrorResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
    };
    return res.status(500).json(errorResponse);
  }
});

/**
 * GET /api/workflows/bug/:id
 * Get workflow state
 */
bugWorkflowRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const parseResult = GetWorkflowParamsSchema.safeParse({ id: req.params.id });
    if (!parseResult.success) {
      const error: ErrorResponse = {
        success: false,
        error: 'Invalid workflow ID',
        code: 'VALIDATION_ERROR',
      };
      return res.status(400).json(error);
    }

    const workflow = await repository.getWorkflow(parseResult.data.id);
    if (!workflow) {
      const error: ErrorResponse = {
        success: false,
        error: 'Workflow not found',
        code: 'NOT_FOUND',
      };
      return res.status(404).json(error);
    }

    const response: GetWorkflowResponse = {
      success: true,
      workflow,
    };

    return res.json(response);
  } catch (error) {
    console.error('[BugWorkflowAPI] Error getting workflow:', error);
    const errorResponse: ErrorResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
    };
    return res.status(500).json(errorResponse);
  }
});

/**
 * POST /api/workflows/bug/:id/submit
 * Submit workflow for analysis
 */
bugWorkflowRouter.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const workflowId = req.params.id;
    const workflow = await repository.getWorkflow(workflowId);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
        code: 'NOT_FOUND',
      });
    }

    // Transition to submitted
    await repository.transitionState(workflowId, 'submitted');
    notifyStateChange(workflowId, 'draft', 'submitted');

    // Transition to analyzing
    await repository.transitionState(workflowId, 'analyzing');
    notifyStateChange(workflowId, 'submitted', 'analyzing');

    // Get Mandrel context
    const mandrelContext = await getContextForBugAnalysis(workflow.bugReport);

    // Run analysis
    const result = await runBugAnalysis(
      workflow.bugReport,
      { projectPath: workflow.projectPath },
      mandrelContext
    );

    if (!result.success || !result.data) {
      // Mark as failed
      await repository.failWorkflow(workflowId, result.error || 'Analysis failed', 'analyzing');
      await bugWorkflowHooks.onWorkflowFail(
        workflowId,
        new Error(result.error || 'Analysis failed'),
        'analyzing'
      );
      notifyError(workflowId, result.error || 'Analysis failed', 'analyzing');

      return res.status(500).json({
        success: false,
        error: result.error || 'Analysis failed',
        code: 'ANALYSIS_FAILED',
      });
    }

    // Store analysis result
    await repository.setAnalysis(workflowId, result.data);

    // Transition to proposed
    await repository.transitionState(workflowId, 'proposed');
    notifyStateChange(workflowId, 'analyzing', 'proposed');

    // Call Mandrel hook
    await bugWorkflowHooks.onProposalGenerated(workflowId, result.data);

    // Notify SSE clients that analysis is complete
    notifyAnalysisComplete(workflowId, result.data);

    // Transition to reviewing (waiting for human input)
    const updatedWorkflow = await repository.transitionState(workflowId, 'reviewing');
    notifyStateChange(workflowId, 'proposed', 'reviewing');

    return res.json({
      success: true,
      workflow: updatedWorkflow,
      analysis: result.data,
      durationMs: result.durationMs,
    });
  } catch (error) {
    console.error('[BugWorkflowAPI] Error submitting workflow:', error);

    if (error instanceof InvalidTransitionError) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'INVALID_TRANSITION',
      });
    }

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * POST /api/workflows/bug/:id/review
 * Submit human review decision
 */
bugWorkflowRouter.post('/:id/review', async (req: Request, res: Response) => {
  try {
    const workflowId = req.params.id;

    // Validate request
    const parseResult = SubmitReviewRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      const error: ErrorResponse = {
        success: false,
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        details: parseResult.error.issues,
      };
      return res.status(400).json(error);
    }

    const workflow = await repository.getWorkflow(workflowId);
    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
        code: 'NOT_FOUND',
      });
    }

    // Must be in reviewing state
    if (workflow.state !== 'reviewing') {
      return res.status(400).json({
        success: false,
        error: `Cannot review from state: ${workflow.state}`,
        code: 'INVALID_STATE',
      });
    }

    const { decision, feedback } = parseResult.data;
    const review = {
      decision,
      feedback,
      reviewedAt: new Date(),
    };

    // Store review
    await repository.setReview(workflowId, review);

    // Call Mandrel hook
    await bugWorkflowHooks.onHumanDecision(workflowId, review);

    // Determine next state based on decision
    let newState: 'approved' | 'changes_requested' | 'rejected';
    let message: string;

    switch (decision) {
      case 'approved':
        newState = 'approved';
        message = 'Fix approved. Ready for implementation.';
        break;
      case 'changes_requested':
        newState = 'changes_requested';
        message = 'Changes requested. Workflow will re-analyze.';
        break;
      case 'rejected':
        newState = 'rejected';
        message = 'Fix rejected. Workflow will return to draft.';
        break;
    }

    const updatedWorkflow = await repository.transitionState(workflowId, newState);

    // If changes_requested, transition back to analyzing
    if (newState === 'changes_requested') {
      await repository.transitionState(workflowId, 'analyzing');
    }

    // If rejected, transition back to draft
    if (newState === 'rejected') {
      await repository.transitionState(workflowId, 'draft');
    }

    const response: SubmitReviewResponse = {
      success: true,
      workflowId,
      newState: updatedWorkflow.state,
      message,
    };

    return res.json(response);
  } catch (error) {
    console.error('[BugWorkflowAPI] Error reviewing workflow:', error);

    if (error instanceof InvalidTransitionError) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'INVALID_TRANSITION',
      });
    }

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * POST /api/workflows/bug/:id/implement
 * Trigger implementation of approved changes
 */
bugWorkflowRouter.post('/:id/implement', async (req: Request, res: Response) => {
  try {
    const workflowId = req.params.id;

    // Validate request
    const parseResult = TriggerImplementRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      const error: ErrorResponse = {
        success: false,
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        details: parseResult.error.issues,
      };
      return res.status(400).json(error);
    }

    const workflow = await repository.getWorkflow(workflowId);
    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
        code: 'NOT_FOUND',
      });
    }

    // Must be in approved state
    if (workflow.state !== 'approved') {
      return res.status(400).json({
        success: false,
        error: `Cannot implement from state: ${workflow.state}. Must be approved first.`,
        code: 'INVALID_STATE',
      });
    }

    const { approvedChanges, runTests } = parseResult.data;

    // Transition to implementing
    await repository.transitionState(workflowId, 'implementing');
    notifyStateChange(workflowId, 'approved', 'implementing');

    // Run implementation
    const result = await runImplementation(
      approvedChanges,
      { projectPath: workflow.projectPath },
      runTests
    );

    if (!result.success || !result.data) {
      await repository.failWorkflow(workflowId, result.error || 'Implementation failed', 'implementing');
      await bugWorkflowHooks.onWorkflowFail(
        workflowId,
        new Error(result.error || 'Implementation failed'),
        'implementing'
      );
      notifyError(workflowId, result.error || 'Implementation failed', 'implementing');

      return res.status(500).json({
        success: false,
        error: result.error || 'Implementation failed',
        code: 'IMPLEMENTATION_FAILED',
      });
    }

    // Store implementation result
    await repository.setImplementation(workflowId, result.data);

    // Transition to verifying
    await repository.transitionState(workflowId, 'verifying');
    notifyStateChange(workflowId, 'implementing', 'verifying');

    // If build/tests passed, transition to completed
    if (result.data.success) {
      await repository.transitionState(workflowId, 'completed');
      notifyStateChange(workflowId, 'verifying', 'completed');
      await bugWorkflowHooks.onImplementationComplete(workflowId, result.data);
      notifyImplementationComplete(workflowId, result.data);
    } else {
      // Build/tests failed
      await repository.failWorkflow(
        workflowId,
        result.data.errors.join('; ') || 'Build/tests failed',
        'verifying'
      );
      notifyError(workflowId, result.data.errors.join('; ') || 'Build/tests failed', 'verifying');
    }

    const updatedWorkflow = await repository.getWorkflow(workflowId);

    const response: TriggerImplementResponse = {
      success: true,
      workflowId,
      state: updatedWorkflow!.state,
      message: result.data.success ? 'Implementation complete' : 'Implementation finished with errors',
    };

    return res.json(response);
  } catch (error) {
    console.error('[BugWorkflowAPI] Error implementing workflow:', error);

    if (error instanceof InvalidTransitionError) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'INVALID_TRANSITION',
      });
    }

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * GET /api/workflows/bug
 * List workflows with optional filtering
 */
bugWorkflowRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { state, projectPath, limit, offset } = req.query;

    const workflows = await repository.listWorkflows({
      state: state as BugWorkflowState | undefined,
      projectPath: projectPath as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    return res.json({
      success: true,
      workflows,
      count: workflows.length,
    });
  } catch (error) {
    console.error('[BugWorkflowAPI] Error listing workflows:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
    });
  }
});
