-- Migration: Add branch_name column to bug_workflows
-- Enables git-based workflow where changes are committed to a named branch

-- Add branch_name column (optional - for git-based sync workflow)
ALTER TABLE bug_workflows
ADD COLUMN IF NOT EXISTS branch_name TEXT;

-- Comment explaining the column
COMMENT ON COLUMN bug_workflows.branch_name IS 'Optional git branch name for committing fixes. When specified, the implementation phase commits changes to this branch.';
