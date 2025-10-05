-- Migration: Phase 1 Sessions Enhancement
-- Date: 2025-10-05
-- Description: Add session metrics, activities, files, and productivity config
-- Safety: ALTER table approach preserves existing 86 sessions
--
-- Changes:
-- 1. ALTER sessions table - Add 9 new columns for enhanced tracking
-- 2. CREATE session_activities - High-granularity activity timeline
-- 3. CREATE session_files - Multi-source file tracking (tool, git, manual)
-- 4. CREATE productivity_config - Configurable productivity formula weights

BEGIN;

-- ============================================================================
-- 1. ALTER SESSIONS TABLE - Add 9 new columns
-- ============================================================================
-- All columns are NULL-safe for existing 86 sessions
-- Appropriate defaults for future sessions

ALTER TABLE sessions
  ADD COLUMN session_goal TEXT NULL,
  ADD COLUMN tags TEXT[] DEFAULT '{}',
  ADD COLUMN lines_added INTEGER DEFAULT 0,
  ADD COLUMN lines_deleted INTEGER DEFAULT 0,
  ADD COLUMN lines_net INTEGER DEFAULT 0,
  ADD COLUMN productivity_score DECIMAL(5,2) NULL,
  ADD COLUMN ai_model TEXT NULL,
  ADD COLUMN files_modified_count INTEGER DEFAULT 0,
  ADD COLUMN activity_count INTEGER DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN sessions.session_goal IS 'User-defined goal or objective for this session (e.g., "Implement user authentication", "Fix payment bug")';
COMMENT ON COLUMN sessions.tags IS 'Array of tags for categorization (e.g., ["bug-fix", "frontend", "urgent"])';
COMMENT ON COLUMN sessions.lines_added IS 'Total lines of code added during this session (aggregated from session_files)';
COMMENT ON COLUMN sessions.lines_deleted IS 'Total lines of code deleted during this session (aggregated from session_files)';
COMMENT ON COLUMN sessions.lines_net IS 'Net lines of code change (lines_added - lines_deleted)';
COMMENT ON COLUMN sessions.productivity_score IS 'Calculated productivity score (0-100) based on configurable formula weights';
COMMENT ON COLUMN sessions.ai_model IS 'AI model used in this session (e.g., "claude-sonnet-4-5", "gpt-4", "claude-opus-3")';
COMMENT ON COLUMN sessions.files_modified_count IS 'Count of unique files modified during this session (cached from session_files)';
COMMENT ON COLUMN sessions.activity_count IS 'Count of activities recorded during this session (cached from session_activities)';

-- Add indexes for commonly queried fields
CREATE INDEX idx_sessions_productivity_score ON sessions(productivity_score) WHERE productivity_score IS NOT NULL;
CREATE INDEX idx_sessions_tags ON sessions USING GIN(tags);
CREATE INDEX idx_sessions_ai_model ON sessions(ai_model) WHERE ai_model IS NOT NULL;
CREATE INDEX idx_sessions_files_modified ON sessions(files_modified_count) WHERE files_modified_count > 0;

-- ============================================================================
-- 2. CREATE session_activities TABLE
-- ============================================================================
-- High-granularity activity tracking for detailed session timelines
-- Stores every significant action: context stored, task created, file edited, etc.

CREATE TABLE session_activities (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL,
  activity_type TEXT NOT NULL,
  activity_data JSONB DEFAULT '{}',
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Foreign key with cascade delete (when session deleted, activities go too)
  CONSTRAINT fk_session_activities_session
    FOREIGN KEY (session_id)
    REFERENCES sessions(id)
    ON DELETE CASCADE
);

-- Add comments
COMMENT ON TABLE session_activities IS 'High-granularity activity timeline for sessions - tracks every significant action';
COMMENT ON COLUMN session_activities.activity_type IS 'Type of activity (e.g., "context_stored", "task_created", "file_edited", "decision_recorded")';
COMMENT ON COLUMN session_activities.activity_data IS 'Flexible JSONB metadata for activity-specific data (e.g., file path, task title, context type)';
COMMENT ON COLUMN session_activities.occurred_at IS 'When the activity actually occurred (may differ from created_at for batch imports)';

-- Performance indexes
CREATE INDEX idx_session_activities_session_occurred ON session_activities(session_id, occurred_at DESC);
CREATE INDEX idx_session_activities_type ON session_activities(activity_type);
CREATE INDEX idx_session_activities_occurred ON session_activities(occurred_at);
CREATE INDEX idx_session_activities_data ON session_activities USING GIN(activity_data);

-- ============================================================================
-- 3. CREATE session_files TABLE
-- ============================================================================
-- Multi-source file tracking: tool operations, git commits, manual entry
-- Prevents duplicates, tracks first/last modified times

CREATE TABLE session_files (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL,
  file_path TEXT NOT NULL,
  lines_added INTEGER DEFAULT 0,
  lines_deleted INTEGER DEFAULT 0,
  source TEXT NOT NULL,
  first_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Foreign key with cascade delete
  CONSTRAINT fk_session_files_session
    FOREIGN KEY (session_id)
    REFERENCES sessions(id)
    ON DELETE CASCADE,

  -- Prevent duplicate file entries per session
  CONSTRAINT unique_session_file
    UNIQUE (session_id, file_path),

  -- Validate source values
  CONSTRAINT valid_file_source
    CHECK (source IN ('tool', 'git', 'manual'))
);

-- Add comments
COMMENT ON TABLE session_files IS 'Multi-source file tracking for sessions - aggregates from tool operations, git commits, and manual entries';
COMMENT ON COLUMN session_files.file_path IS 'Relative or absolute file path (normalized for consistency)';
COMMENT ON COLUMN session_files.source IS 'Source of file tracking: "tool" (Read/Write/Edit tools), "git" (commit analysis), "manual" (user entry)';
COMMENT ON COLUMN session_files.first_modified IS 'When this file was first touched in this session';
COMMENT ON COLUMN session_files.last_modified IS 'When this file was last touched in this session';

-- Performance indexes
CREATE INDEX idx_session_files_session ON session_files(session_id);
CREATE INDEX idx_session_files_path ON session_files(file_path);
CREATE INDEX idx_session_files_source ON session_files(source);
CREATE INDEX idx_session_files_modified ON session_files(last_modified);

-- ============================================================================
-- 4. CREATE productivity_config TABLE
-- ============================================================================
-- Configurable productivity formula weights for flexible scoring
-- Allows experimentation with different productivity calculation approaches

CREATE TABLE productivity_config (
  id SERIAL PRIMARY KEY,
  config_name TEXT UNIQUE NOT NULL,
  formula_weights JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure config_name is not empty
  CONSTRAINT valid_config_name
    CHECK (length(config_name) > 0)
);

-- Add comments
COMMENT ON TABLE productivity_config IS 'Configurable productivity formula weights - allows flexible experimentation with scoring approaches';
COMMENT ON COLUMN productivity_config.config_name IS 'Unique name for this configuration (e.g., "default", "code-focused", "collaboration-focused")';
COMMENT ON COLUMN productivity_config.formula_weights IS 'JSONB weights for productivity components (e.g., {"tasks": 0.3, "context": 0.2, "decisions": 0.1, "loc": 0.3, "time": 0.1})';

-- Insert default productivity configuration
INSERT INTO productivity_config (config_name, formula_weights)
VALUES (
  'default',
  '{"tasks": 0.3, "context": 0.2, "decisions": 0.1, "loc": 0.3, "time": 0.1}'::jsonb
);

-- Add trigger for updated_at
CREATE TRIGGER update_productivity_config_updated_at
  BEFORE UPDATE ON productivity_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Next steps:
-- 1. Verify 86 sessions still exist: SELECT COUNT(*) FROM sessions;
-- 2. Verify new columns exist: \d sessions
-- 3. Verify new tables exist: \dt session_*
-- 4. Test basic queries on new structures
