-- Migration 041: Create Surveyor Tables
-- Part of MandrelV2 Surveyor Integration
-- Date: 2026-01-25

-- Surveyor Scans Table
-- Stores scan results with metadata and summary statistics
CREATE TABLE IF NOT EXISTS surveyor_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    project_path TEXT NOT NULL,
    project_name TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'parsing', 'analyzing', 'complete', 'failed')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,

    -- Statistics
    total_files INTEGER DEFAULT 0,
    total_functions INTEGER DEFAULT 0,
    total_classes INTEGER DEFAULT 0,
    total_connections INTEGER DEFAULT 0,
    total_warnings INTEGER DEFAULT 0,
    analyzed_count INTEGER DEFAULT 0,
    pending_analysis INTEGER DEFAULT 0,
    health_score INTEGER CHECK (health_score >= 0 AND health_score <= 100),

    -- JSONB storage for complex data
    warnings_by_level JSONB DEFAULT '{"info": 0, "warning": 0, "error": 0}',
    nodes_by_type JSONB DEFAULT '{"file": 0, "function": 0, "class": 0, "cluster": 0}',

    -- Full scan data (can be large)
    nodes JSONB DEFAULT '{}',
    connections JSONB DEFAULT '[]',
    clusters JSONB DEFAULT '[]',
    errors JSONB DEFAULT '[]',

    -- AI-generated tiered summaries
    summary_l0 TEXT,  -- 50 tokens - quick glance
    summary_l1 TEXT,  -- 500 tokens - per-folder breakdown
    summary_l2 TEXT   -- 2000 tokens - full file inventory
);

-- Surveyor Warnings Table
-- Separate table for efficient warning queries and filtering
CREATE TABLE IF NOT EXISTS surveyor_warnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL REFERENCES surveyor_scans(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL CHECK (category IN (
        'circular_dependency', 'orphaned_code', 'duplicate_code',
        'large_file', 'deep_nesting', 'missing_types',
        'unused_export', 'security_concern'
    )),
    level VARCHAR(20) NOT NULL CHECK (level IN ('info', 'warning', 'error')),
    title TEXT NOT NULL,
    description TEXT,
    affected_nodes JSONB DEFAULT '[]',
    file_path TEXT,
    suggestion JSONB,  -- { summary, reasoning, codeExample, autoFixable }
    detected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_surveyor_scans_project ON surveyor_scans(project_id);
CREATE INDEX IF NOT EXISTS idx_surveyor_scans_status ON surveyor_scans(status);
CREATE INDEX IF NOT EXISTS idx_surveyor_scans_created ON surveyor_scans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_surveyor_warnings_scan ON surveyor_warnings(scan_id);
CREATE INDEX IF NOT EXISTS idx_surveyor_warnings_level ON surveyor_warnings(level);
CREATE INDEX IF NOT EXISTS idx_surveyor_warnings_category ON surveyor_warnings(category);
CREATE INDEX IF NOT EXISTS idx_surveyor_warnings_file ON surveyor_warnings(file_path);

-- GIN index for JSONB queries on nodes
CREATE INDEX IF NOT EXISTS idx_surveyor_scans_nodes ON surveyor_scans USING GIN (nodes);

-- View for quick scan summaries
CREATE OR REPLACE VIEW v_surveyor_scan_summaries AS
SELECT
    s.id,
    s.project_id,
    p.name as project_name,
    s.project_path,
    s.status,
    s.created_at,
    s.completed_at,
    s.total_files,
    s.total_functions,
    s.total_classes,
    s.total_warnings,
    s.health_score,
    s.warnings_by_level,
    s.summary_l0,
    EXTRACT(EPOCH FROM (s.completed_at - s.created_at)) as scan_duration_seconds
FROM surveyor_scans s
LEFT JOIN projects p ON s.project_id = p.id
ORDER BY s.created_at DESC;

-- Comments for documentation
COMMENT ON TABLE surveyor_scans IS 'Stores Surveyor codebase scan results with nodes, connections, and AI summaries';
COMMENT ON TABLE surveyor_warnings IS 'Extracted warnings from scans for efficient filtering and querying';
COMMENT ON COLUMN surveyor_scans.summary_l0 IS 'AI summary L0: ~50 tokens - Quick glance health overview';
COMMENT ON COLUMN surveyor_scans.summary_l1 IS 'AI summary L1: ~500 tokens - Per-folder breakdown with issues';
COMMENT ON COLUMN surveyor_scans.summary_l2 IS 'AI summary L2: ~2000 tokens - Full file inventory and details';
COMMENT ON COLUMN surveyor_scans.nodes IS 'Full NodeMap JSONB - can be large, use summary endpoints for quick access';
