-- Migration 022: Add foreign key constraint to tasks.project_id
-- Prevents orphaned tasks at database level

-- First verify no orphaned tasks exist (should be clean after data repair)
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM tasks t
  WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = t.project_id);

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Cannot add constraint: % orphaned tasks found', orphan_count;
  END IF;
END $$;

-- Add foreign key constraint
ALTER TABLE tasks
ADD CONSTRAINT fk_tasks_project
FOREIGN KEY (project_id)
REFERENCES projects(id)
ON DELETE CASCADE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
