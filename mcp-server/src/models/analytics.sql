-- AIDIS Analytics Models
-- SQL queries and operations for analytics_events table
-- Author: AIDIS System  
-- Date: 2025-09-08

-- Insert event query template
-- INSERT INTO analytics_events (actor, project_id, session_id, context_id, event_type, payload, status, duration_ms, tags, ai_model_used, prompt_tokens, completion_tokens, feedback, metadata)
-- VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
-- RETURNING event_id, timestamp;

-- Get recent events by project
-- SELECT event_id, timestamp, actor, event_type, status, duration_ms, tags 
-- FROM analytics_events 
-- WHERE project_id = $1 
-- ORDER BY timestamp DESC 
-- LIMIT $2;

-- Get session analytics
-- SELECT session_id, COUNT(*) as event_count, 
--        MIN(timestamp) as session_start,
--        MAX(timestamp) as session_end,
--        SUM(duration_ms) as total_duration_ms,
--        ARRAY_AGG(DISTINCT event_type) as event_types
-- FROM analytics_events 
-- WHERE session_id = $1 
-- GROUP BY session_id;

-- Get project statistics  
-- SELECT project_id,
--        COUNT(*) as total_events,
--        COUNT(DISTINCT session_id) as unique_sessions,
--        AVG(duration_ms) as avg_duration_ms,
--        COUNT(*) FILTER (WHERE actor = 'ai') as ai_events,
--        COUNT(*) FILTER (WHERE actor = 'human') as human_events,
--        COUNT(*) FILTER (WHERE status = 'completed') as completed_events
-- FROM analytics_events
-- WHERE project_id = $1
-- GROUP BY project_id;

-- Table structure verification
-- \d analytics_events
