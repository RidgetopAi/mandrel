-- Enhance user_sessions table for analytics tracking
-- Add columns needed for session analytics without breaking existing auth

-- Add analytics columns to user_sessions
ALTER TABLE user_sessions 
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS ip_address INET,
ADD COLUMN IF NOT EXISTS user_agent TEXT,
ADD COLUMN IF NOT EXISTS duration_ms INTEGER,

-- Activity counters
ADD COLUMN IF NOT EXISTS contexts_created INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS decisions_created INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tasks_created INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS api_requests INTEGER DEFAULT 0,

-- Token usage tracking
ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0,

-- Session metadata
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id),
ADD COLUMN IF NOT EXISTS session_type VARCHAR(20) DEFAULT 'web',
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_user_sessions_started_at ON user_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON user_sessions(last_activity);
CREATE INDEX IF NOT EXISTS idx_user_sessions_project_id ON user_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active_started ON user_sessions(is_active, started_at);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_user_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.last_activity = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_sessions_updated_at_trigger
    BEFORE UPDATE ON user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_user_sessions_updated_at();

-- Initialize started_at for existing sessions
UPDATE user_sessions 
SET started_at = created_at 
WHERE started_at IS NULL;

-- Comments for documentation
COMMENT ON COLUMN user_sessions.started_at IS 'When user session began (for analytics)';
COMMENT ON COLUMN user_sessions.last_activity IS 'Last API activity (for timeout detection)';
COMMENT ON COLUMN user_sessions.duration_ms IS 'Total session duration when ended';
COMMENT ON COLUMN user_sessions.metadata IS 'Session analytics data (browser, features used, etc.)';
