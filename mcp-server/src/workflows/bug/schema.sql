-- Bug Workflow Database Schema
-- Phase 2: Persistent workflow state (not in-memory)

CREATE TABLE IF NOT EXISTS bug_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_path TEXT NOT NULL,
  branch_name TEXT,
  state VARCHAR(50) NOT NULL DEFAULT 'draft',

  -- Workflow data as JSONB (validated by Zod at API boundary)
  bug_report JSONB NOT NULL,
  analysis JSONB,
  review JSONB,
  implementation JSONB,

  -- Failure tracking
  failure_reason TEXT,
  failure_stage VARCHAR(50),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  failed_at TIMESTAMPTZ,

  -- State constraint (matches states.ts)
  CONSTRAINT valid_state CHECK (state IN (
    'draft', 'submitted', 'analyzing', 'proposed', 'reviewing',
    'approved', 'changes_requested', 'rejected',
    'implementing', 'verifying', 'completed', 'failed'
  ))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bug_workflows_state
  ON bug_workflows(state);

CREATE INDEX IF NOT EXISTS idx_bug_workflows_created
  ON bug_workflows(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bug_workflows_project
  ON bug_workflows(project_path);

-- Investigation events for visibility layer (Phase 3)
CREATE TABLE IF NOT EXISTS bug_workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES bug_workflows(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  action VARCHAR(50) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure events are ordered per workflow
  CONSTRAINT unique_workflow_sequence UNIQUE (workflow_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_bug_workflow_events_workflow
  ON bug_workflow_events(workflow_id);

-- Trigger to update updated_at on workflow changes
CREATE OR REPLACE FUNCTION update_bug_workflow_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bug_workflow_updated ON bug_workflows;
CREATE TRIGGER bug_workflow_updated
  BEFORE UPDATE ON bug_workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_bug_workflow_timestamp();
