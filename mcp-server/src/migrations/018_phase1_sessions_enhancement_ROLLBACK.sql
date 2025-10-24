-- Rollback Migration: Phase 1 Sessions Enhancement
-- Date: 2025-10-05
-- Description: Safely rollback all changes from 018_phase1_sessions_enhancement.sql
-- Safety: Reverses ALTER operations and drops new tables
--
-- WARNING: This will delete all data in session_activities, session_files, and productivity_config
-- Existing 86 sessions will be preserved but lose the 9 new columns

BEGIN;

-- ============================================================================
-- 1. DROP NEW TABLES (in reverse dependency order)
-- ============================================================================

-- Drop productivity_config (no dependencies)
DROP TABLE IF EXISTS productivity_config CASCADE;

-- Drop session_files (references sessions)
DROP TABLE IF EXISTS session_files CASCADE;

-- Drop session_activities (references sessions)
DROP TABLE IF EXISTS session_activities CASCADE;

-- ============================================================================
-- 2. DROP NEW INDEXES FROM SESSIONS TABLE
-- ============================================================================

DROP INDEX IF EXISTS idx_sessions_files_modified;
DROP INDEX IF EXISTS idx_sessions_ai_model;
DROP INDEX IF EXISTS idx_sessions_tags;
DROP INDEX IF EXISTS idx_sessions_productivity_score;

-- ============================================================================
-- 3. DROP NEW COLUMNS FROM SESSIONS TABLE
-- ============================================================================

ALTER TABLE sessions
  DROP COLUMN IF EXISTS activity_count,
  DROP COLUMN IF EXISTS files_modified_count,
  DROP COLUMN IF EXISTS ai_model,
  DROP COLUMN IF EXISTS productivity_score,
  DROP COLUMN IF EXISTS lines_net,
  DROP COLUMN IF EXISTS lines_deleted,
  DROP COLUMN IF EXISTS lines_added,
  DROP COLUMN IF EXISTS tags,
  DROP COLUMN IF EXISTS session_goal;

COMMIT;

-- ============================================================================
-- Rollback Complete
-- ============================================================================
-- Verification steps:
-- 1. Verify 86 sessions still exist: SELECT COUNT(*) FROM sessions;
-- 2. Verify new columns removed: \d sessions
-- 3. Verify new tables removed: \dt session_*
-- 4. Check that existing sessions are intact: SELECT id, title, started_at FROM sessions LIMIT 5;
