-- Session Table Unification Migration
-- Merges user_sessions into sessions table
-- Date: 2025-10-25

BEGIN;

-- Backup counts for verification
CREATE TEMP TABLE migration_verification AS
SELECT
  'user_sessions' as source,
  COUNT(*) as count,
  SUM(contexts_created) as total_contexts,
  SUM(tasks_created) as total_tasks
FROM user_sessions
UNION ALL
SELECT
  'sessions' as source,
  COUNT(*) as count,
  SUM(contexts_created) as total_contexts,
  SUM(tasks_created) as total_tasks
FROM sessions;

-- Display pre-migration counts
SELECT * FROM migration_verification;

-- Step 1: Add missing columns to sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS token_id varchar(255);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address inet;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS decisions_created integer DEFAULT 0 NOT NULL;

-- Add foreign key for user_id (after column exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_fkey'
  ) THEN
    ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Step 2: Migrate user_sessions data into sessions
INSERT INTO sessions (
  id, 
  project_id, 
  agent_type, 
  started_at, 
  ended_at,
  input_tokens, 
  output_tokens, 
  total_tokens,
  tasks_created, 
  tasks_updated, 
  tasks_completed,
  contexts_created,
  decisions_created,
  metadata, 
  updated_at, 
  last_activity_at,
  user_id, 
  token_id, 
  ip_address, 
  user_agent,
  ai_model,
  status,
  title
)
SELECT
  us.id,
  us.project_id,
  COALESCE(us.session_type, 'web') as agent_type,
  us.started_at,
  us.ended_at,
  us.input_tokens,
  us.output_tokens,
  GREATEST(us.total_tokens, us.prompt_tokens + us.completion_tokens, 0) as total_tokens,
  us.tasks_created,
  us.tasks_updated,
  us.tasks_completed,
  us.contexts_created,
  COALESCE(us.decisions_created, 0),
  us.metadata,
  us.updated_at,
  us.last_activity as last_activity_at,
  us.user_id,
  us.token_id,
  us.ip_address,
  us.user_agent,
  'web-ui' as ai_model,
  CASE
    WHEN us.is_active AND (us.ended_at IS NULL OR us.last_activity > NOW() - INTERVAL '1 hour') 
      THEN 'active'
    WHEN us.ended_at IS NOT NULL 
      THEN 'inactive'
    ELSE 'disconnected'
  END as status,
  'Web Session ' || SUBSTRING(us.id::text FROM 1 FOR 8) as title
FROM user_sessions us
ON CONFLICT (id) DO UPDATE SET
  -- If session already exists in sessions table, update with user_sessions data
  user_id = EXCLUDED.user_id,
  token_id = EXCLUDED.token_id,
  ip_address = EXCLUDED.ip_address,
  user_agent = EXCLUDED.user_agent,
  decisions_created = EXCLUDED.decisions_created;

-- Step 3: Verify migration
CREATE TEMP TABLE post_migration_verification AS
SELECT
  'sessions_unified' as source,
  COUNT(*) as count,
  SUM(contexts_created) as total_contexts,
  SUM(tasks_created) as total_tasks
FROM sessions;

-- Display post-migration counts
SELECT 
  'BEFORE' as phase,
  SUM(count) as total_sessions,
  SUM(total_contexts) as total_contexts,
  SUM(total_tasks) as total_tasks
FROM migration_verification
UNION ALL
SELECT
  'AFTER' as phase,
  count as total_sessions,
  total_contexts,
  total_tasks
FROM post_migration_verification;

-- Verify contexts still linked
SELECT 
  COUNT(*) as orphaned_contexts
FROM contexts c
WHERE c.session_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = c.session_id);

-- Verify tasks still linked
SELECT 
  COUNT(*) as orphaned_tasks
FROM tasks t
WHERE t.session_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = t.session_id);

-- Expected: 263 total sessions, 0 orphaned contexts, 0 orphaned tasks

COMMIT;

-- Manual verification queries (run after commit):
-- SELECT COUNT(*) FROM sessions;  -- Should be 263
-- SELECT COUNT(DISTINCT ai_model) FROM sessions WHERE ai_model IS NOT NULL;
-- SELECT agent_type, COUNT(*) FROM sessions GROUP BY agent_type ORDER BY count DESC;
