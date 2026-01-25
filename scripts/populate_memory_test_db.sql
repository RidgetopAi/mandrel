-- Populate aidis_memory_test with representative data for memory system testing
-- Safe: Only copies data, doesn't modify production

-- Copy 3 key projects for testing
\c aidis_memory_test

-- Copy projects
INSERT INTO projects (id, name, description, created_at, updated_at, status, git_repo_url, root_directory, metadata)
SELECT id, name, description, created_at, updated_at, status, git_repo_url, root_directory, metadata
FROM dblink('dbname=mandrel',
  'SELECT id, name, description, created_at, updated_at, status, git_repo_url, root_directory, metadata
   FROM projects
   WHERE name IN (''emergence-notes'', ''aidis'', ''ridge-code'', ''aidis-alpha'')')
AS p(id UUID, name TEXT, description TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
     status TEXT, git_repo_url TEXT, root_directory TEXT, metadata JSONB)
ON CONFLICT (id) DO NOTHING;

-- Copy sessions from those projects (last 30 days)
INSERT INTO sessions
SELECT s.*
FROM dblink('dbname=mandrel',
  'SELECT s.* FROM sessions s
   JOIN projects p ON s.project_id = p.id
   WHERE p.name IN (''emergence-notes'', ''aidis'', ''ridge-code'', ''aidis-alpha'')
   AND s.created_at > NOW() - INTERVAL ''30 days''')
AS s(id UUID, project_id UUID, agent_type TEXT, started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ,
     summary TEXT, status_code INTEGER, metadata JSONB, updated_at TIMESTAMPTZ,
     display_id TEXT, title TEXT, description TEXT, session_goal TEXT, tags TEXT[],
     ai_model TEXT, created_at TIMESTAMPTZ, input_tokens INTEGER, output_tokens INTEGER,
     total_tokens INTEGER, tasks_created INTEGER, tasks_completed INTEGER, contexts_created INTEGER,
     activity_count INTEGER, productivity_score DECIMAL, lines_added INTEGER,
     lines_deleted INTEGER, lines_net INTEGER, files_modified_count INTEGER)
ON CONFLICT (id) DO NOTHING;

-- Copy contexts from those sessions
INSERT INTO contexts
SELECT c.*
FROM dblink('dbname=mandrel',
  'SELECT c.* FROM contexts c
   JOIN sessions s ON c.session_id = s.id
   JOIN projects p ON s.project_id = p.id
   WHERE p.name IN (''emergence-notes'', ''aidis'', ''ridge-code'', ''aidis-alpha'')')
AS c(id UUID, project_id UUID, session_id UUID, context_type TEXT, content TEXT,
     tags TEXT[], relevance_score FLOAT, created_at TIMESTAMPTZ, metadata JSONB,
     embedding vector(1536), embedding_384_backup vector(384),
     pattern_session_id UUID, related_insights UUID[], pattern_relevance_score FLOAT,
     related_commit_sha TEXT, commit_context_type TEXT)
ON CONFLICT (id) DO NOTHING;

-- Show counts
SELECT
  (SELECT COUNT(*) FROM projects) as projects,
  (SELECT COUNT(*) FROM sessions) as sessions,
  (SELECT COUNT(*) FROM contexts) as contexts;
