-- Create Sessions Table Migration
-- This creates the foundation for proper session tracking in AIDIS Command

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    duration_ms INTEGER,
    
    -- Activity counters
    contexts_created INTEGER DEFAULT 0,
    decisions_created INTEGER DEFAULT 0,
    tasks_created INTEGER DEFAULT 0,
    api_requests INTEGER DEFAULT 0,
    
    -- Token usage tracking
    total_tokens INTEGER DEFAULT 0,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    
    -- Session metadata
    project_id UUID REFERENCES projects(id),
    session_type VARCHAR(20) DEFAULT 'web', -- 'web', 'api', 'mobile'
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity);
CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sessions_updated_at_trigger
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_sessions_updated_at();

-- Comments for documentation
COMMENT ON TABLE sessions IS 'User sessions with activity tracking and analytics';
COMMENT ON COLUMN sessions.duration_ms IS 'Session duration in milliseconds (calculated on session end)';
COMMENT ON COLUMN sessions.last_activity IS 'Last API activity timestamp for session timeout detection';
COMMENT ON COLUMN sessions.metadata IS 'Additional session data (browser info, feature usage, etc.)';
