-- Add new columns to existing tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by VARCHAR(200);

-- Change assigned_to from UUID to VARCHAR
ALTER TABLE tasks ALTER COLUMN assigned_to TYPE VARCHAR(200);

-- Clear existing tasks (only 4 test tasks)
TRUNCATE tasks;

-- Migrate all 213 tasks from backup
INSERT INTO tasks (
    id, project_id, title, description, type, status, priority,
    dependencies, tags, metadata, created_at, updated_at, progress,
    assigned_to, created_by
)
SELECT 
    t.id, t.project_id, t.title, t.description, t.type, t.status, t.priority,
    t.dependencies, t.tags, t.metadata, t.created_at, t.updated_at,
    COALESCE(t.progress, 0) as progress,
    CASE WHEN a1.name IS NOT NULL THEN a1.name ELSE 'unassigned' END as assigned_to,
    CASE WHEN a2.name IS NOT NULL THEN a2.name ELSE 'system' END as created_by
FROM tasks_backup t
LEFT JOIN agents_backup a1 ON t.assigned_to = a1.id  
LEFT JOIN agents_backup a2 ON t.created_by = a2.id;
