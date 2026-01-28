/**
 * Bug Workflow Repository
 *
 * Database CRUD operations using contract types.
 * All state transitions are validated before persistence.
 */

import { db } from '../../config/database.js';
import {
  type BugWorkflow,
  type BugReport,
  type BugAnalysis,
  type Review,
  type ImplementationResult,
  type BugWorkflowState,
  canTransition,
  assertTransition,
} from '../contracts/index.js';

/**
 * Database row shape (differs from BugWorkflow due to JSONB columns)
 */
interface BugWorkflowRow {
  id: string;
  project_path: string;
  state: BugWorkflowState;
  bug_report: BugReport;
  analysis: BugAnalysis | null;
  review: Review | null;
  implementation: ImplementationResult | null;
  failure_reason: string | null;
  failure_stage: string | null;
  created_at: Date;
  updated_at: Date;
  failed_at: Date | null;
}

/**
 * Convert database row to BugWorkflow type
 */
function rowToWorkflow(row: BugWorkflowRow): BugWorkflow {
  return {
    id: row.id,
    projectPath: row.project_path,
    state: row.state,
    bugReport: row.bug_report,
    analysis: row.analysis ?? undefined,
    review: row.review ?? undefined,
    implementation: row.implementation ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    failureStage: row.failure_stage ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    failedAt: row.failed_at ?? undefined,
  };
}

/**
 * Create a new bug workflow
 */
export async function createWorkflow(
  bugReport: BugReport,
  projectPath: string
): Promise<BugWorkflow> {
  const result = await db.query<BugWorkflowRow>(
    `INSERT INTO bug_workflows (project_path, state, bug_report)
     VALUES ($1, 'draft', $2)
     RETURNING *`,
    [projectPath, JSON.stringify(bugReport)]
  );

  return rowToWorkflow(result.rows[0]);
}

/**
 * Get a workflow by ID
 */
export async function getWorkflow(id: string): Promise<BugWorkflow | null> {
  const result = await db.query<BugWorkflowRow>(
    `SELECT * FROM bug_workflows WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToWorkflow(result.rows[0]);
}

/**
 * Transition workflow to a new state
 * Validates the transition before updating
 */
export async function transitionState(
  id: string,
  newState: BugWorkflowState
): Promise<BugWorkflow> {
  // Get current state
  const current = await getWorkflow(id);
  if (!current) {
    throw new Error(`Workflow not found: ${id}`);
  }

  // Validate transition
  assertTransition(current.state, newState);

  // Update state
  const result = await db.query<BugWorkflowRow>(
    `UPDATE bug_workflows
     SET state = $2
     WHERE id = $1
     RETURNING *`,
    [id, newState]
  );

  return rowToWorkflow(result.rows[0]);
}

/**
 * Update workflow with analysis result
 */
export async function setAnalysis(
  id: string,
  analysis: BugAnalysis
): Promise<BugWorkflow> {
  const result = await db.query<BugWorkflowRow>(
    `UPDATE bug_workflows
     SET analysis = $2
     WHERE id = $1
     RETURNING *`,
    [id, JSON.stringify(analysis)]
  );

  if (result.rows.length === 0) {
    throw new Error(`Workflow not found: ${id}`);
  }

  return rowToWorkflow(result.rows[0]);
}

/**
 * Update workflow with review decision
 */
export async function setReview(
  id: string,
  review: Review
): Promise<BugWorkflow> {
  const result = await db.query<BugWorkflowRow>(
    `UPDATE bug_workflows
     SET review = $2
     WHERE id = $1
     RETURNING *`,
    [id, JSON.stringify(review)]
  );

  if (result.rows.length === 0) {
    throw new Error(`Workflow not found: ${id}`);
  }

  return rowToWorkflow(result.rows[0]);
}

/**
 * Update workflow with implementation result
 */
export async function setImplementation(
  id: string,
  implementation: ImplementationResult
): Promise<BugWorkflow> {
  const result = await db.query<BugWorkflowRow>(
    `UPDATE bug_workflows
     SET implementation = $2
     WHERE id = $1
     RETURNING *`,
    [id, JSON.stringify(implementation)]
  );

  if (result.rows.length === 0) {
    throw new Error(`Workflow not found: ${id}`);
  }

  return rowToWorkflow(result.rows[0]);
}

/**
 * Mark workflow as failed
 */
export async function failWorkflow(
  id: string,
  reason: string,
  stage: string
): Promise<BugWorkflow> {
  const current = await getWorkflow(id);
  if (!current) {
    throw new Error(`Workflow not found: ${id}`);
  }

  // Only transition if not already failed
  if (current.state !== 'failed' && canTransition(current.state, 'failed')) {
    const result = await db.query<BugWorkflowRow>(
      `UPDATE bug_workflows
       SET state = 'failed',
           failure_reason = $2,
           failure_stage = $3,
           failed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, reason, stage]
    );

    return rowToWorkflow(result.rows[0]);
  }

  return current;
}

/**
 * List workflows with optional filtering
 */
export async function listWorkflows(options: {
  state?: BugWorkflowState;
  projectPath?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<BugWorkflow[]> {
  const { state, projectPath, limit = 50, offset = 0 } = options;

  let query = 'SELECT * FROM bug_workflows WHERE 1=1';
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (state) {
    query += ` AND state = $${paramIndex++}`;
    params.push(state);
  }

  if (projectPath) {
    query += ` AND project_path = $${paramIndex++}`;
    params.push(projectPath);
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await db.query<BugWorkflowRow>(query, params);
  return result.rows.map(rowToWorkflow);
}

/**
 * Delete a workflow (for cleanup/testing)
 */
export async function deleteWorkflow(id: string): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM bug_workflows WHERE id = $1`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}
