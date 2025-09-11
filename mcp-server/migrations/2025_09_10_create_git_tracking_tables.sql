-- TC002: Git Commit Tracking Database Schema Implementation
-- AIDIS Git Tracking Tables with comprehensive commit tracking, branch management, and session correlation
-- Created: 2025-09-10
-- Author: AIDIS Team - TC002/TC003 Implementation

-- 1. git_commits: Core commit tracking with AIDIS integration
CREATE TABLE IF NOT EXISTS git_commits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Git commit identifiers
    commit_sha VARCHAR(40) NOT NULL CHECK (commit_sha ~ '^[a-f0-9]{40}$'),
    short_sha VARCHAR(12) GENERATED ALWAYS AS (LEFT(commit_sha, 12)) STORED,
    
    -- Commit metadata
    message TEXT NOT NULL CHECK (LENGTH(TRIM(message)) > 0),
    author_name VARCHAR(255) NOT NULL,
    author_email VARCHAR(255) NOT NULL CHECK (author_email ~ '^[^@]+@[^@]+\.[^@]+$'),
    author_date TIMESTAMPTZ NOT NULL,
    committer_name VARCHAR(255) NOT NULL,
    committer_email VARCHAR(255) NOT NULL CHECK (committer_email ~ '^[^@]+@[^@]+\.[^@]+$'),
    committer_date TIMESTAMPTZ NOT NULL CHECK (committer_date >= author_date),
    
    -- Git context
    branch_name VARCHAR(255),
    parent_shas TEXT[] DEFAULT '{}',
    is_merge_commit BOOLEAN GENERATED ALWAYS AS (array_length(parent_shas, 1) > 1) STORED,
    
    -- Change statistics
    files_changed INTEGER DEFAULT 0 CHECK (files_changed >= 0),
    insertions INTEGER DEFAULT 0 CHECK (insertions >= 0),
    deletions INTEGER DEFAULT 0 CHECK (deletions >= 0),
    
    -- Classification and analysis
    commit_type VARCHAR(50) DEFAULT 'feature', -- feature, fix, docs, refactor, test, style, chore, merge
    tags TEXT[] DEFAULT '{}',
    
    -- AIDIS metadata and extensibility
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraints
    CONSTRAINT uq_git_commits_project_sha UNIQUE (project_id, commit_sha)
);

-- 2. git_branches: Branch lifecycle and activity tracking
CREATE TABLE IF NOT EXISTS git_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Branch identification
    branch_name VARCHAR(255) NOT NULL,
    current_sha VARCHAR(40) CHECK (current_sha ~ '^[a-f0-9]{40}$'),
    
    -- Branch metadata
    is_default BOOLEAN DEFAULT FALSE,
    is_protected BOOLEAN DEFAULT FALSE,
    branch_type VARCHAR(50) DEFAULT 'feature', -- main, feature, hotfix, release, develop
    upstream_branch VARCHAR(255),
    
    -- Statistics
    commit_count INTEGER DEFAULT 0 CHECK (commit_count >= 0),
    last_commit_date TIMESTAMPTZ,
    first_commit_date TIMESTAMPTZ,
    
    -- Branch relationships
    base_branch VARCHAR(255),
    merge_target VARCHAR(255),
    
    -- AIDIS integration
    session_id UUID, -- Which session is working on this branch
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraints
    CONSTRAINT uq_git_branches_project_name UNIQUE (project_id, branch_name)
);

-- 3. git_file_changes: Granular file change tracking per commit
CREATE TABLE IF NOT EXISTS git_file_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    commit_id UUID NOT NULL REFERENCES git_commits(id) ON DELETE CASCADE,
    
    -- File identification
    file_path TEXT NOT NULL,
    old_file_path TEXT, -- For renames
    
    -- Change classification
    change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('added', 'modified', 'deleted', 'renamed', 'copied', 'typechange')),
    
    -- Change statistics
    lines_added INTEGER DEFAULT 0 CHECK (lines_added >= 0),
    lines_removed INTEGER DEFAULT 0 CHECK (lines_removed >= 0),
    
    -- File metadata
    is_binary BOOLEAN DEFAULT FALSE,
    is_generated BOOLEAN DEFAULT FALSE,
    file_size_bytes INTEGER,
    
    -- AIDIS integration
    component_id UUID, -- Link to code_components table when available
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. commit_session_links: Session-commit correlation with confidence scoring
CREATE TABLE IF NOT EXISTS commit_session_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    commit_id UUID NOT NULL REFERENCES git_commits(id) ON DELETE CASCADE,
    session_id UUID NOT NULL, -- References sessions(id) or user_sessions(id)
    
    -- Link metadata
    link_type VARCHAR(50) DEFAULT 'contributed' CHECK (link_type IN ('contributed', 'reviewed', 'planned', 'mentioned', 'related')),
    confidence_score DECIMAL(3,2) DEFAULT 0.50 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    
    -- Correlation context
    context_ids UUID[] DEFAULT '{}', -- Related context IDs
    decision_ids UUID[] DEFAULT '{}', -- Related technical decision IDs
    
    -- Analysis metadata
    time_proximity_minutes INTEGER, -- How close the commit was to session activity
    author_match BOOLEAN DEFAULT FALSE,
    content_similarity DECIMAL(3,2), -- Semantic similarity score
    
    -- AIDIS metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraints
    CONSTRAINT uq_commit_session_links_unique UNIQUE (commit_id, session_id)
);

-- Performance and Query Optimization Indexes
-- Primary project-based queries
CREATE INDEX IF NOT EXISTS idx_git_commits_project_date ON git_commits(project_id, author_date DESC);
CREATE INDEX IF NOT EXISTS idx_git_commits_project_author ON git_commits(project_id, author_email, author_date DESC);
CREATE INDEX IF NOT EXISTS idx_git_commits_project_branch ON git_commits(project_id, branch_name, author_date DESC);
CREATE INDEX IF NOT EXISTS idx_git_commits_sha_lookup ON git_commits(commit_sha);
CREATE INDEX IF NOT EXISTS idx_git_commits_short_sha ON git_commits(short_sha);

-- Branch tracking indexes
CREATE INDEX IF NOT EXISTS idx_git_branches_project_type ON git_branches(project_id, branch_type);
CREATE INDEX IF NOT EXISTS idx_git_branches_project_active ON git_branches(project_id, last_commit_date DESC) WHERE current_sha IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_git_branches_session ON git_branches(session_id) WHERE session_id IS NOT NULL;

-- File change analysis indexes
CREATE INDEX IF NOT EXISTS idx_git_file_changes_project_path ON git_file_changes(project_id, file_path, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_git_file_changes_commit ON git_file_changes(commit_id);
CREATE INDEX IF NOT EXISTS idx_git_file_changes_path_pattern ON git_file_changes USING gin(to_tsvector('english', file_path));

-- Session correlation indexes
CREATE INDEX IF NOT EXISTS idx_commit_session_links_session ON commit_session_links(session_id, confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_commit_session_links_commit ON commit_session_links(commit_id);
CREATE INDEX IF NOT EXISTS idx_commit_session_links_project_confidence ON commit_session_links(project_id, confidence_score DESC);

-- Advanced indexes for arrays and JSONB
CREATE INDEX IF NOT EXISTS idx_git_commits_parent_shas ON git_commits USING gin(parent_shas);
CREATE INDEX IF NOT EXISTS idx_git_commits_tags ON git_commits USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_git_commits_metadata ON git_commits USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_commit_session_links_context_ids ON commit_session_links USING gin(context_ids);
CREATE INDEX IF NOT EXISTS idx_commit_session_links_decision_ids ON commit_session_links USING gin(decision_ids);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_git_commits_message_fts ON git_commits USING gin(to_tsvector('english', message));
CREATE INDEX IF NOT EXISTS idx_git_branches_description_fts ON git_branches USING gin(to_tsvector('english', description)) WHERE description IS NOT NULL;

-- Partial indexes for common queries
CREATE INDEX IF NOT EXISTS idx_git_commits_merge_commits ON git_commits(project_id, author_date DESC) WHERE is_merge_commit = TRUE;
CREATE INDEX IF NOT EXISTS idx_git_branches_default ON git_branches(project_id) WHERE is_default = TRUE;
CREATE INDEX IF NOT EXISTS idx_git_branches_protected ON git_branches(project_id) WHERE is_protected = TRUE;

-- Automatic trigger functions for data validation and maintenance

-- Function to classify commit type from message
CREATE OR REPLACE FUNCTION classify_commit_type(message TEXT) 
RETURNS VARCHAR(50) AS $$
BEGIN
    -- Pattern-based commit type detection
    IF message ~* '^(fix|fixed|fixes|bug)[\s\(\[]' THEN RETURN 'fix';
    ELSIF message ~* '^(feat|feature|add)[\s\(\[]' THEN RETURN 'feature';
    ELSIF message ~* '^(docs|doc)[\s\(\[]' THEN RETURN 'docs';
    ELSIF message ~* '^(refactor|refact)[\s\(\[]' THEN RETURN 'refactor';
    ELSIF message ~* '^(test|tests)[\s\(\[]' THEN RETURN 'test';
    ELSIF message ~* '^(style|format)[\s\(\[]' THEN RETURN 'style';
    ELSIF message ~* '^(chore|build|ci)[\s\(\[]' THEN RETURN 'chore';
    ELSIF message ~* '^(merge|merged)' THEN RETURN 'merge';
    ELSE RETURN 'feature';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function to auto-classify commits and update statistics
CREATE OR REPLACE FUNCTION git_commits_trigger_fn() 
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-classify commit type if not provided or is default
    IF NEW.commit_type IS NULL OR NEW.commit_type = 'feature' THEN
        NEW.commit_type = classify_commit_type(NEW.message);
    END IF;
    
    -- Update timestamps
    IF TG_OP = 'INSERT' THEN
        NEW.created_at = CURRENT_TIMESTAMP;
        NEW.updated_at = CURRENT_TIMESTAMP;
    ELSIF TG_OP = 'UPDATE' THEN
        NEW.updated_at = CURRENT_TIMESTAMP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to update branch statistics
CREATE OR REPLACE FUNCTION git_branches_update_stats_fn() 
RETURNS TRIGGER AS $$
BEGIN
    -- Update branch commit statistics when commits are added
    IF TG_OP = 'INSERT' AND NEW.branch_name IS NOT NULL THEN
        UPDATE git_branches 
        SET 
            commit_count = (
                SELECT COUNT(*) 
                FROM git_commits 
                WHERE project_id = NEW.project_id 
                AND branch_name = NEW.branch_name
            ),
            last_commit_date = (
                SELECT MAX(author_date) 
                FROM git_commits 
                WHERE project_id = NEW.project_id 
                AND branch_name = NEW.branch_name
            ),
            first_commit_date = COALESCE(first_commit_date, (
                SELECT MIN(author_date) 
                FROM git_commits 
                WHERE project_id = NEW.project_id 
                AND branch_name = NEW.branch_name
            )),
            current_sha = NEW.commit_sha,
            updated_at = CURRENT_TIMESTAMP
        WHERE project_id = NEW.project_id 
        AND branch_name = NEW.branch_name;
        
        -- Create branch record if it doesn't exist and branch_name is not null
        INSERT INTO git_branches (project_id, branch_name, current_sha, commit_count, last_commit_date, first_commit_date)
        SELECT NEW.project_id, NEW.branch_name, NEW.commit_sha, 1, NEW.author_date, NEW.author_date
        WHERE NEW.branch_name IS NOT NULL 
        AND NOT EXISTS (
            SELECT 1 FROM git_branches 
            WHERE project_id = NEW.project_id 
            AND branch_name = NEW.branch_name
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS git_commits_auto_classify ON git_commits;
CREATE TRIGGER git_commits_auto_classify 
    BEFORE INSERT OR UPDATE ON git_commits 
    FOR EACH ROW EXECUTE FUNCTION git_commits_trigger_fn();

DROP TRIGGER IF EXISTS git_commits_update_branch_stats ON git_commits;
CREATE TRIGGER git_commits_update_branch_stats 
    AFTER INSERT ON git_commits 
    FOR EACH ROW EXECUTE FUNCTION git_branches_update_stats_fn();

-- Extensions to existing AIDIS tables for git integration

-- Add git-related columns to existing contexts table
DO $$ 
BEGIN
    -- Add related_commit_sha column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contexts' AND column_name = 'related_commit_sha'
    ) THEN
        ALTER TABLE contexts ADD COLUMN related_commit_sha VARCHAR(40);
        CREATE INDEX IF NOT EXISTS idx_contexts_commit_sha ON contexts(related_commit_sha) WHERE related_commit_sha IS NOT NULL;
    END IF;
    
    -- Add commit_context_type for classification
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contexts' AND column_name = 'commit_context_type'
    ) THEN
        ALTER TABLE contexts ADD COLUMN commit_context_type VARCHAR(50);
        CREATE INDEX IF NOT EXISTS idx_contexts_commit_type ON contexts(commit_context_type) WHERE commit_context_type IS NOT NULL;
    END IF;
END $$;

-- Add git-related columns to existing sessions table if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sessions') THEN
        -- Add active_branch tracking
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'sessions' AND column_name = 'active_branch'
        ) THEN
            ALTER TABLE sessions ADD COLUMN active_branch VARCHAR(255);
        END IF;
        
        -- Add working_commit_sha
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'sessions' AND column_name = 'working_commit_sha'
        ) THEN
            ALTER TABLE sessions ADD COLUMN working_commit_sha VARCHAR(40);
        END IF;
        
        -- Add commits_contributed counter
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'sessions' AND column_name = 'commits_contributed'
        ) THEN
            ALTER TABLE sessions ADD COLUMN commits_contributed INTEGER DEFAULT 0;
        END IF;
    END IF;
END $$;

-- Add git-related columns to technical_decisions table if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'technical_decisions') THEN
        -- Add implementing_commits array
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'technical_decisions' AND column_name = 'implementing_commits'
        ) THEN
            ALTER TABLE technical_decisions ADD COLUMN implementing_commits TEXT[] DEFAULT '{}';
            CREATE INDEX IF NOT EXISTS idx_technical_decisions_impl_commits ON technical_decisions USING gin(implementing_commits);
        END IF;
        
        -- Add implementation_status
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'technical_decisions' AND column_name = 'implementation_status'
        ) THEN
            ALTER TABLE technical_decisions ADD COLUMN implementation_status VARCHAR(50) DEFAULT 'planned'
            CHECK (implementation_status IN ('planned', 'in_progress', 'implemented', 'validated', 'deprecated'));
        END IF;
    END IF;
END $$;

-- Add git-related columns to code_components table if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'code_components') THEN
        -- Add last_modified_commit
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'code_components' AND column_name = 'last_modified_commit'
        ) THEN
            ALTER TABLE code_components ADD COLUMN last_modified_commit VARCHAR(40);
        END IF;
        
        -- Add creation_commit
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'code_components' AND column_name = 'creation_commit'
        ) THEN
            ALTER TABLE code_components ADD COLUMN creation_commit VARCHAR(40);
        END IF;
        
        -- Add modification_frequency counter
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'code_components' AND column_name = 'modification_frequency'
        ) THEN
            ALTER TABLE code_components ADD COLUMN modification_frequency INTEGER DEFAULT 0;
        END IF;
    END IF;
END $$;

-- Views for common git analytics queries

-- View: Recent project activity with git integration
CREATE OR REPLACE VIEW project_git_activity AS
SELECT 
    p.id as project_id,
    p.name as project_name,
    COUNT(DISTINCT gc.id) as total_commits,
    COUNT(DISTINCT gc.author_email) as contributors,
    COUNT(DISTINCT gb.id) as total_branches,
    MAX(gc.author_date) as last_commit_date,
    COUNT(DISTINCT gc.id) FILTER (WHERE gc.author_date >= NOW() - INTERVAL '7 days') as commits_last_week,
    COUNT(DISTINCT gc.id) FILTER (WHERE gc.author_date >= NOW() - INTERVAL '30 days') as commits_last_month
FROM projects p
LEFT JOIN git_commits gc ON p.id = gc.project_id
LEFT JOIN git_branches gb ON p.id = gb.project_id
GROUP BY p.id, p.name;

-- View: Developer productivity metrics
CREATE OR REPLACE VIEW developer_productivity AS
SELECT 
    gc.project_id,
    gc.author_email,
    gc.author_name,
    COUNT(*) as total_commits,
    SUM(gc.insertions) as total_insertions,
    SUM(gc.deletions) as total_deletions,
    SUM(gc.files_changed) as total_files_changed,
    COUNT(DISTINCT gc.branch_name) as branches_contributed,
    MIN(gc.author_date) as first_commit,
    MAX(gc.author_date) as last_commit,
    COUNT(*) FILTER (WHERE gc.author_date >= NOW() - INTERVAL '7 days') as commits_last_week,
    AVG(gc.insertions + gc.deletions) as avg_lines_per_commit
FROM git_commits gc
GROUP BY gc.project_id, gc.author_email, gc.author_name;

-- View: File change frequency for hotspot analysis
CREATE OR REPLACE VIEW file_change_hotspots AS
SELECT 
    gfc.project_id,
    gfc.file_path,
    COUNT(*) as change_count,
    COUNT(DISTINCT gc.author_email) as contributor_count,
    SUM(gfc.lines_added) as total_lines_added,
    SUM(gfc.lines_removed) as total_lines_removed,
    MAX(gc.author_date) as last_changed,
    MIN(gc.author_date) as first_changed,
    ARRAY_AGG(DISTINCT gc.commit_type) as change_types
FROM git_file_changes gfc
JOIN git_commits gc ON gfc.commit_id = gc.id
GROUP BY gfc.project_id, gfc.file_path;

-- Grant permissions (assuming standard AIDIS database roles)
-- These would need to be adjusted based on actual role structure
-- GRANT ALL PRIVILEGES ON git_commits, git_branches, git_file_changes, commit_session_links TO aidis_app;
-- GRANT SELECT ON project_git_activity, developer_productivity, file_change_hotspots TO aidis_readonly;

-- Migration completion
INSERT INTO schema_migrations (version, description, applied_at) 
VALUES ('2025_09_10_create_git_tracking_tables', 'TC002: Comprehensive git tracking schema with commit, branch, file change, and session correlation', CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;

-- Success message
DO $$ 
BEGIN 
    RAISE NOTICE 'TC002 Git Tracking Schema Migration Completed Successfully!';
    RAISE NOTICE 'Tables Created: git_commits, git_branches, git_file_changes, commit_session_links';
    RAISE NOTICE 'Views Created: project_git_activity, developer_productivity, file_change_hotspots';
    RAISE NOTICE 'Triggers: Auto-classification and statistics update';
    RAISE NOTICE 'Extensions: Added git columns to existing AIDIS tables';
    RAISE NOTICE 'Ready for TC003 Git Service Implementation';
END $$;