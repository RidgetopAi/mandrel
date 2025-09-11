-- Create unassigned project for orphan sessions
INSERT INTO projects (id, name, description) VALUES
    ('00000000-0000-0000-0000-000000000000', '__unassigned__', 'Placeholder for unassigned sessions')
ON CONFLICT (id) DO NOTHING;

-- Add foreign key constraint
ALTER TABLE sessions
    ADD CONSTRAINT fk_sessions_project
        FOREIGN KEY (project_id) REFERENCES projects(id);

-- Set default project_id for new sessions
ALTER TABLE sessions
    ALTER COLUMN project_id SET DEFAULT '00000000-0000-0000-0000-000000000000';
