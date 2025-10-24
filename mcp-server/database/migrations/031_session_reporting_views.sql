-- Migration: Phase 3 Session Reporting Views
-- Date: 2025-10-05
-- Purpose: Create v_session_summaries view for Phase 3 reporting tools

BEGIN;

-- Create v_session_summaries view
CREATE OR REPLACE VIEW v_session_summaries AS
SELECT
  s.id,
  s.display_id,
  s.project_id,
  p.name as project_name,
  s.agent_type,
  s.started_at,
  s.ended_at,
  EXTRACT(EPOCH FROM (COALESCE(s.ended_at, NOW()) - s.started_at)) / 60 as duration_minutes,
  s.status,
  s.title,
  s.description,
  s.session_goal,
  s.tags,
  s.productivity_score,
  s.tasks_created,
  s.tasks_completed,
  CASE
    WHEN s.tasks_created > 0 THEN ROUND((s.tasks_completed::numeric / s.tasks_created::numeric) * 100, 2)
    ELSE 0
  END as task_completion_rate,
  s.contexts_created,
  s.lines_added,
  s.lines_deleted,
  s.lines_net,
  s.files_modified_count,
  s.activity_count,
  s.input_tokens,
  s.output_tokens,
  s.total_tokens,
  s.ai_model,
  s.last_activity_at,
  s.metadata
FROM sessions s
LEFT JOIN projects p ON s.project_id = p.id;

-- Add helpful comment
COMMENT ON VIEW v_session_summaries IS 'Phase 3: Pre-joined session data with calculated fields for reporting';

COMMIT;

-- Verify view created successfully
SELECT COUNT(*) as total_sessions FROM v_session_summaries;
