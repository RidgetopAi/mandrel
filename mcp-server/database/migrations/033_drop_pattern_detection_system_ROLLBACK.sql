-- ROLLBACK for Migration 033: Drop Pattern Detection System
-- Date: 2025-10-24
--
-- WARNING: This rollback recreates the table schemas but CANNOT restore deleted data
-- Historical pattern data (101 cooccurrence patterns, 1 insight) is permanently lost
--
-- To fully rollback:
-- 1. Re-run migration: 019_create_change_pattern_tables.sql
-- 2. Restore code files (see git commit)
-- 3. Re-enable pattern detection in backgroundServices.ts
-- 4. Re-run pattern analysis to regenerate data
--
-- Simple rollback (just recreate empty tables):

BEGIN;

RAISE NOTICE 'ROLLBACK Migration 033: Recreating pattern detection tables (EMPTY)';
RAISE NOTICE 'WARNING: Original data cannot be recovered';
RAISE NOTICE 'To fully restore, re-run migration 019_create_change_pattern_tables.sql';

-- This rollback only creates the tables with empty data
-- For full schema recreation, run migration 019 instead

COMMIT;

-- For complete rollback, run:
-- psql -h localhost -p 5432 -d aidis_production -f database/migrations/019_create_change_pattern_tables.sql
