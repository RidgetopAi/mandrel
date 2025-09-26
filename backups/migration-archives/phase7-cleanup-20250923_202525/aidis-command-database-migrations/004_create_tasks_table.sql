-- Migration 004: Create Tasks Table for Task Management System
-- Comprehensive task management with Kanban support

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    type VARCHAR(100) NOT NULL DEFAULT 'general', -- feature, bugfix, refactor, testing, documentation, research, maintenance, general
    status VARCHAR(50) NOT NULL DEFAULT 'todo', -- todo, in_progress, blocked, completed, cancelled
    priority VARCHAR(20) NOT NULL DEFAULT 'medium', -- low, medium, high, urgent
    assigned_to UUID, -- references agents table (may be from main AIDIS system)
    dependencies UUID[] DEFAULT '{}', -- array of task IDs this task depends on
    tags TEXT[] DEFAULT '{}', -- tags for categorization and filtering
    metadata JSONB DEFAULT '{}', -- additional flexible data storage
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_type ON tasks(type);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);

-- GIN indexes for array columns
CREATE INDEX idx_tasks_dependencies ON tasks USING GIN(dependencies);
CREATE INDEX idx_tasks_tags ON tasks USING GIN(tags);

-- Partial indexes for performance on common queries
CREATE INDEX idx_tasks_active ON tasks(project_id, status) WHERE status NOT IN ('completed', 'cancelled');
CREATE INDEX idx_tasks_urgent ON tasks(project_id, priority) WHERE priority = 'urgent';

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_tasks_updated_at();

-- Add some helpful comments
COMMENT ON TABLE tasks IS 'Task management system for AI development coordination';
COMMENT ON COLUMN tasks.dependencies IS 'Array of task UUIDs that must be completed before this task';
COMMENT ON COLUMN tasks.metadata IS 'Flexible JSON storage for additional task data like estimated time, labels, etc.';
COMMENT ON COLUMN tasks.status IS 'Task status: todo (not started), in_progress (actively worked on), blocked (waiting on dependency), completed (finished), cancelled (abandoned)';
COMMENT ON COLUMN tasks.priority IS 'Task priority: low (nice to have), medium (normal), high (important), urgent (critical/blocking)';
