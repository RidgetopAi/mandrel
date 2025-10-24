-- Test Script: Phase 1 Sessions Enhancement Migration
-- Date: 2025-10-05
-- Description: Comprehensive validation of migration 018
--
-- Run this after executing 018_phase1_sessions_enhancement.sql
-- Expected results are documented inline

-- ============================================================================
-- PRE-FLIGHT CHECKS
-- ============================================================================

-- 1. Verify session count (should be 86)
SELECT
  COUNT(*) as total_sessions,
  COUNT(*) = 86 as sessions_preserved
FROM sessions;

-- Expected: total_sessions = 86, sessions_preserved = true

-- ============================================================================
-- SESSIONS TABLE VALIDATION
-- ============================================================================

-- 2. Verify new columns exist with correct types
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'sessions'
  AND column_name IN (
    'session_goal',
    'tags',
    'lines_added',
    'lines_deleted',
    'lines_net',
    'productivity_score',
    'ai_model',
    'files_modified_count',
    'activity_count'
  )
ORDER BY column_name;

-- Expected: 9 rows with correct data types

-- 3. Verify new indexes exist
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'sessions'
  AND indexname IN (
    'idx_sessions_productivity_score',
    'idx_sessions_tags',
    'idx_sessions_ai_model',
    'idx_sessions_files_modified'
  )
ORDER BY indexname;

-- Expected: 4 rows

-- 4. Test NULL safety - existing sessions should have NULL/default values
SELECT
  id,
  title,
  session_goal,
  tags,
  lines_added,
  lines_deleted,
  lines_net,
  productivity_score,
  ai_model,
  files_modified_count,
  activity_count
FROM sessions
LIMIT 5;

-- Expected: session_goal and ai_model are NULL, numeric fields are 0, tags is empty array

-- ============================================================================
-- session_activities TABLE VALIDATION
-- ============================================================================

-- 5. Verify session_activities table exists with correct structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'session_activities'
ORDER BY ordinal_position;

-- Expected: 6 columns (id, session_id, activity_type, activity_data, occurred_at, created_at)

-- 6. Verify foreign key constraint exists
SELECT
  constraint_name,
  table_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'session_activities'
  AND constraint_type = 'FOREIGN KEY';

-- Expected: 1 row (fk_session_activities_session)

-- 7. Verify indexes exist
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'session_activities'
ORDER BY indexname;

-- Expected: 5 indexes (including primary key)

-- 8. Test insert and cascade delete
DO $$
DECLARE
  test_session_id UUID;
BEGIN
  -- Get a real session ID
  SELECT id INTO test_session_id FROM sessions LIMIT 1;

  -- Insert test activity
  INSERT INTO session_activities (session_id, activity_type, activity_data)
  VALUES (test_session_id, 'test_activity', '{"test": true}');

  -- Verify insert
  IF NOT EXISTS (
    SELECT 1 FROM session_activities
    WHERE session_id = test_session_id
      AND activity_type = 'test_activity'
  ) THEN
    RAISE EXCEPTION 'Test activity insert failed';
  END IF;

  -- Cleanup test activity
  DELETE FROM session_activities
  WHERE session_id = test_session_id
    AND activity_type = 'test_activity';

  RAISE NOTICE 'session_activities: Insert/delete test passed';
END $$;

-- ============================================================================
-- session_files TABLE VALIDATION
-- ============================================================================

-- 9. Verify session_files table exists with correct structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'session_files'
ORDER BY ordinal_position;

-- Expected: 8 columns

-- 10. Verify unique constraint and check constraints
SELECT
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'session_files'
ORDER BY constraint_type, constraint_name;

-- Expected: CHECK constraints (valid_file_source), UNIQUE (unique_session_file), FOREIGN KEY

-- 11. Test unique constraint and source validation
DO $$
DECLARE
  test_session_id UUID;
  duplicate_error BOOLEAN := FALSE;
  invalid_source_error BOOLEAN := FALSE;
BEGIN
  -- Get a real session ID
  SELECT id INTO test_session_id FROM sessions LIMIT 1;

  -- Insert test file
  INSERT INTO session_files (session_id, file_path, source, lines_added, lines_deleted)
  VALUES (test_session_id, '/test/file.ts', 'tool', 10, 5);

  -- Try duplicate (should fail)
  BEGIN
    INSERT INTO session_files (session_id, file_path, source, lines_added, lines_deleted)
    VALUES (test_session_id, '/test/file.ts', 'git', 20, 10);
  EXCEPTION
    WHEN unique_violation THEN
      duplicate_error := TRUE;
  END;

  -- Try invalid source (should fail)
  BEGIN
    INSERT INTO session_files (session_id, file_path, source)
    VALUES (test_session_id, '/test/invalid.ts', 'invalid_source');
  EXCEPTION
    WHEN check_violation THEN
      invalid_source_error := TRUE;
  END;

  -- Cleanup
  DELETE FROM session_files
  WHERE session_id = test_session_id
    AND file_path = '/test/file.ts';

  IF duplicate_error AND invalid_source_error THEN
    RAISE NOTICE 'session_files: Constraint tests passed';
  ELSE
    RAISE EXCEPTION 'session_files: Constraint tests failed';
  END IF;
END $$;

-- ============================================================================
-- productivity_config TABLE VALIDATION
-- ============================================================================

-- 12. Verify productivity_config table exists
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'productivity_config'
ORDER BY ordinal_position;

-- Expected: 5 columns (id, config_name, formula_weights, created_at, updated_at)

-- 13. Verify default config was inserted
SELECT
  config_name,
  formula_weights,
  created_at
FROM productivity_config
WHERE config_name = 'default';

-- Expected: 1 row with default weights

-- 14. Test unique constraint on config_name
DO $$
DECLARE
  duplicate_error BOOLEAN := FALSE;
BEGIN
  -- Try to insert duplicate config_name
  BEGIN
    INSERT INTO productivity_config (config_name, formula_weights)
    VALUES ('default', '{"test": 0.5}');
  EXCEPTION
    WHEN unique_violation THEN
      duplicate_error := TRUE;
  END;

  IF duplicate_error THEN
    RAISE NOTICE 'productivity_config: Unique constraint test passed';
  ELSE
    RAISE EXCEPTION 'productivity_config: Unique constraint test failed';
  END IF;
END $$;

-- ============================================================================
-- COMPREHENSIVE SUMMARY
-- ============================================================================

-- 15. Full table overview
SELECT
  'sessions' as table_name,
  COUNT(*) as row_count
FROM sessions
UNION ALL
SELECT 'session_activities', COUNT(*) FROM session_activities
UNION ALL
SELECT 'session_files', COUNT(*) FROM session_files
UNION ALL
SELECT 'productivity_config', COUNT(*) FROM productivity_config
ORDER BY table_name;

-- Expected:
-- sessions: 86
-- session_activities: 0 (or more if data inserted)
-- session_files: 0 (or more if data inserted)
-- productivity_config: 1

-- 16. Verify all foreign key relationships
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
LEFT JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('session_activities', 'session_files')
ORDER BY tc.table_name, tc.constraint_name;

-- Expected: 2 rows (both with CASCADE delete rule)

RAISE NOTICE '========================================';
RAISE NOTICE 'Migration 018 Validation Complete';
RAISE NOTICE '========================================';
