-- =============================================================================
-- purge-deploy-smoke-sessions.sql  —  task bc819ae5
-- =============================================================================
-- PURGE the deploy-smoke litter sessions that the fleet deploy smoke left behind
-- (one untitled, never-ended `sessions` row per instance per deploy).
--
-- ⚠️  FOR RIDGE TO RUN UNDER THE DEPLOY GATE — NOT executed by Foreman. This
--     touches the PROD `sessions` table AND every TENANT DB (live data). Run it
--     per-DB (prod + each tenant container DB), reviewing the DRY-RUN counts first.
--
-- SAFE BY DESIGN:
--   * Idempotent — re-running after a purge deletes 0 rows.
--   * Marker/signature-scoped — touches ONLY litter, never a real working session.
--   * Dry-run-first — wrapped in a transaction that ROLLS BACK by default. You see
--     exactly what WOULD be deleted before anything is committed.
--
-- HOW TO RUN (per database):
--   1. DRY RUN (default — shows counts, changes NOTHING):
--        sudo -u postgres psql -d <dbname> -f scripts/purge-deploy-smoke-sessions.sql
--   2. COMMIT for real, once the counts look right:
--        sudo -u postgres psql -d <dbname> -v do_purge=1 -f scripts/purge-deploy-smoke-sessions.sql
--
-- WHAT COUNTS AS LITTER (two cohorts):
--   (A) NEW marked rows:    agent_type = 'deploy-smoke'  (post-fix smoke marker).
--   (B) OLD empty-smoke rows: the pre-fix smoke POSTed `{}`, which defaulted
--       agent_type to 'AI Model' with NO title, NEVER ended, and ZERO activity.
--       Cohort B is matched CONSERVATIVELY on that full signature so a real
--       'AI Model' session (which would have a title, an end, or some activity)
--       is NEVER caught:
--           agent_type = 'AI Model'
--       AND title IS NULL
--       AND ended_at IS NULL
--       AND tasks_created = 0 AND tasks_updated = 0 AND tasks_completed = 0
--       AND contexts_created = 0 AND COALESCE(total_tokens,0) = 0
--       AND COALESCE(decisions_created,0) = 0
--       AND metadata->>'auto_created' = 'true'   -- set by the auto-create path
--
-- FK NOTE: contexts.session_id references sessions (ON DELETE behavior varies).
-- Cohort A+B both have contexts_created = 0 / no marker activity, so no contexts
-- should point at them — but we DELETE any dependent contexts first defensively
-- (scoped to the same litter ids) so the sessions DELETE can never FK-fail.
-- =============================================================================

\set ON_ERROR_STOP on
-- Default: dry run. Override with `-v do_purge=1` to actually commit.
\if :{?do_purge}
\else
  \set do_purge 0
\endif

BEGIN;

-- Collect the litter ids ONCE into a temp table (both cohorts).
CREATE TEMP TABLE _smoke_litter ON COMMIT DROP AS
SELECT s.id, s.agent_type, s.started_at, s.title
FROM sessions s
WHERE
  -- Cohort A: new explicit marker.
  s.agent_type = 'deploy-smoke'
  OR
  -- Cohort B: old empty-`{}` smoke signature (conservative).
  (
        s.agent_type = 'AI Model'
    AND s.title IS NULL
    AND s.ended_at IS NULL
    AND COALESCE(s.tasks_created, 0)    = 0
    AND COALESCE(s.tasks_updated, 0)    = 0
    AND COALESCE(s.tasks_completed, 0)  = 0
    AND COALESCE(s.contexts_created, 0) = 0
    AND COALESCE(s.total_tokens, 0)     = 0
    AND COALESCE(s.decisions_created, 0)= 0
    AND s.metadata->>'auto_created' = 'true'
  );

-- Report what WOULD be / IS being purged.
\echo '--- deploy-smoke litter purge: candidate counts (this DB) ---'
SELECT
  COUNT(*) FILTER (WHERE agent_type = 'deploy-smoke')          AS cohort_a_marked,
  COUNT(*) FILTER (WHERE agent_type = 'AI Model')              AS cohort_b_old_empty,
  COUNT(*)                                                     AS total_litter,
  MIN(started_at)                                             AS oldest,
  MAX(started_at)                                             AS newest
FROM _smoke_litter;

-- Defensive: delete any contexts pointing at litter sessions (expected 0 rows).
DELETE FROM contexts c USING _smoke_litter l WHERE c.session_id = l.id;

-- Delete the litter sessions.
DELETE FROM sessions s USING _smoke_litter l WHERE s.id = l.id;

\if :do_purge
  \echo '>>> do_purge=1 — COMMITTING the purge.'
  COMMIT;
\else
  \echo '>>> DRY RUN (default) — ROLLING BACK. Re-run with `-v do_purge=1` to commit.'
  ROLLBACK;
\endif
