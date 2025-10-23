# Phase 3 MCP Session Tools - Documentation for AIDIS Command UI Integration

**Date:** 2025-10-05
**Version:** 1.0
**Status:** Production Ready

---

## Executive Summary

Phase 3 adds 3 new MCP tools for comprehensive session reporting and analytics. These tools are designed for integration with AIDIS Command (web UI) and provide rich data for building dashboards, session browsers, and analytics views.

**New Tools:**
1. `sessions_list` - Filtered, paginated session browsing
2. `sessions_stats` - Aggregate statistics with grouping and trends
3. `sessions_compare` - Side-by-side comparison of any 2 sessions

**Key Features:**
- ✅ Backward compatible with 86 existing sessions
- ✅ NULL-safe handling for Phase 2 data
- ✅ Structured data (JSON-compatible)
- ✅ Production-ready performance (<1s queries)
- ✅ Comprehensive filtering and sorting

---

## Tool 1: sessions_list

### Purpose
Browse, filter, and search sessions with pagination. Perfect for building session browser UI.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `projectId` | string | No | null | Filter by project UUID |
| `dateFrom` | string | No | null | Start date (ISO format: YYYY-MM-DD) |
| `dateTo` | string | No | null | End date (ISO format: YYYY-MM-DD) |
| `tags` | string[] | No | null | Filter by tags (matches ANY) |
| `status` | string | No | 'all' | Filter by status: active, inactive, all |
| `agentType` | string | No | null | Filter by agent: claude-code, cline, etc. |
| `hasGoal` | boolean | No | null | true = only with goals, false = only without |
| `minProductivity` | number | No | null | Minimum productivity score (0-100) |
| `sortBy` | string | No | 'started_at' | Sort field: started_at, duration, productivity, loc |
| `sortOrder` | string | No | 'desc' | Sort order: asc or desc |
| `limit` | number | No | 25 | Max results per page (1-100) |
| `offset` | number | No | 0 | Pagination offset |

### Example Usage

#### Get first page of all sessions
```typescript
sessions_list({})
// Returns: 25 most recent sessions
```

#### Filter by project and date range
```typescript
sessions_list({
  projectId: 'abc-123-uuid',
  dateFrom: '2025-10-01',
  dateTo: '2025-10-05',
  sortBy: 'productivity',
  sortOrder: 'desc'
})
// Returns: Sessions in project abc-123 from Oct 1-5, sorted by productivity
```

#### Find sessions with specific tags
```typescript
sessions_list({
  tags: ['feature', 'api'],
  hasGoal: true,
  minProductivity: 70
})
// Returns: Sessions tagged 'feature' OR 'api' with goals and productivity >= 70
```

#### Pagination example
```typescript
// Page 1
sessions_list({ limit: 10, offset: 0 })

// Page 2
sessions_list({ limit: 10, offset: 10 })

// Page 3
sessions_list({ limit: 10, offset: 20 })
```

### Response Format

**Text Output (MCP):**
```
📋 SESSIONS LIST (Showing 25 of 86)

Filters Applied:
  • Project: All projects
  • Date Range: All time
  • Tags: Any tags
  • Status: All

#  | ID       | Project      | Started    | Duration | Score | LOC   | Tags
---|----------|--------------|------------|----------|-------|-------|------
1  | abc123   | aidis-core   | Oct 5 14:30| 2h 15m   | 85/100| +450  | feature, api
2  | def456   | frontend     | Oct 5 12:00| 1h 30m   | N/A   | N/A   | -
...

💡 Use session_details("abc123") to see full details
💡 Use sessions_compare("abc123", "def456") to compare
```

**Underlying Data Structure** (for web UI):
```typescript
interface SessionListItem {
  id: string;
  display_id: string;
  project_name: string;
  started_at: Date;
  ended_at: Date | null;
  duration_minutes: number;
  session_goal: string | null;
  tags: string[];
  productivity_score: number | null;
  lines_net: number | null;
  task_completion_rate: number;
  files_modified_count: number;
}
```

### UI Integration Tips

1. **Table View**: Use as backend for session browser table
2. **Filters Panel**: Map parameters to filter UI controls
3. **Pagination**: Use offset/limit for page navigation
4. **Sorting**: Use sortBy/sortOrder for column sorting
5. **NULL Handling**: Display "N/A" or "-" for NULL Phase 2 fields

---

## Tool 2: sessions_stats

### Purpose
Aggregate statistics across sessions with grouping, trends, and insights. Perfect for analytics dashboard.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `projectId` | string | No | null | Filter by project UUID |
| `period` | string | No | 'all' | Time period: day, week, month, all |
| `groupBy` | string | No | 'none' | Group dimension: project, agent, tag, none |
| `phase2Only` | boolean | No | false | Only sessions with Phase 2 tracking |

### Example Usage

#### Overall statistics (all sessions)
```typescript
sessions_stats({})
// Returns: Stats for all 86 sessions combined
// Note: Avg productivity will be NULL (no old sessions have scores)
```

#### Phase 2 sessions only
```typescript
sessions_stats({ phase2Only: true })
// Returns: Stats for ONLY sessions with Phase 2 tracking
// Shows: "12 of 86 total sessions" (filtered count)
```

#### Group by project
```typescript
sessions_stats({
  groupBy: 'project',
  phase2Only: true
})
// Returns: Stats grouped by project name
```

#### Last 30 days with daily trends
```typescript
sessions_stats({
  period: 'month',
  groupBy: 'none'
})
// Returns: Stats for last 30 days + daily time series
```

#### Compare Phase 2 vs all sessions
```typescript
// All sessions
const allStats = sessions_stats({ phase2Only: false });

// Phase 2 only
const phase2Stats = sessions_stats({ phase2Only: true });

// Compare: allStats shows 86 sessions with NULL productivity
//          phase2Stats shows X sessions with actual scores
```

### Response Format

**Text Output (MCP):**
```
📊 SESSION STATISTICS

📅 Period: Last 30 days
📁 Project: All projects
🔍 Filter: Phase 2 Sessions Only (12 of 86 total sessions)

📈 OVERALL METRICS:
   • Total Sessions: 12
   • Avg Duration: 1h 45m
   • Avg Productivity: 72.5/100 💪
   • Total LOC: +2,450 lines (net)
   • Total Tokens: 456K

💪 PRODUCTIVITY BREAKDOWN:
   • Tasks: 45 created, 38 completed (84% completion)
   • Contexts: 123 items addedListenBrainz Labs APIListenBrainz Labs API
   • Decisions: 18 recorded
   • Files: 203 modified

📊 BY PROJECT:
   1. aidis-core: 8 sessions, avg 75/100 productivity
   2. frontend: 4 sessions, avg 68/100 productivity

🏷️  TOP TAGS:
   1. feature (6 sessions)
   2. refactor (4 sessions)

💡 Avg productivity across Phase 2 sessions: 72.5/100
```

**Underlying Data Structure** (for web UI):
```typescript
interface SessionStats {
  overall: {
    totalSessions: number;
    totalSessionsUnfiltered?: number; // Only if phase2Only=true
    avgDuration: number | null;
    avgProductivity: number | null;
    totalTasksCreated: number;
    totalTasksCompleted: number;
    totalContextsCreated: number;
    totalLOC: number;
    totalTokens: number;
  };
  groups?: Array<{
    groupKey: string; // project name, agent type, or tag
    count: number;
    avgProductivity: number | null;
  }>;
  timeSeries?: Array<{
    date: string; // YYYY-MM-DD
    sessionCount: number;
    avgProductivity: number | null;
  }>;
  topTags?: string[];
}
```

### UI Integration Tips

1. **Dashboard Cards**: Use overall metrics for KPI cards
2. **Charts**: Use timeSeries for trend charts (line/bar)
3. **Leaderboard**: Use groups for top projects/agents table
4. **Tag Cloud**: Use topTags for visual tag representation
5. **Toggle Filter**: Add "Phase 2 Only" checkbox for phase2Only parameter

---

## Tool 3: sessions_compare

### Purpose
Compare two sessions side-by-side with diff indicators. Perfect for session comparison view.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `sessionId1` | string | **Yes** | - | First session UUID |
| `sessionId2` | string | **Yes** | - | Second session UUID |

### Example Usage

#### Compare any two sessions
```typescript
sessions_compare({
  sessionId1: 'abc-123-uuid',
  sessionId2: 'def-456-uuid'
})
// Returns: Side-by-side comparison with diff indicators
```

#### Compare old session vs new session
```typescript
sessions_compare({
  sessionId1: 'old-session-null-phase2',
  sessionId2: 'new-session-with-phase2'
})
// Returns: Comparison with warnings for missing Phase 2 data in session 1
```

### Response Format

**Text Output (MCP):**
```
🔍 SESSION COMPARISON

                          Session 1                    Session 2
                          ---------                    ---------
ID                        abc123...                    def456...
Project                   aidis-core                   frontend
Started                   Oct 5, 14:30                 Oct 5, 12:00
Duration                  2h 15m                       1h 30m        ⬇ 33% shorter

🎯 GOALS:
Session 1: "Implement new API endpoints"
Session 2: "No goal set"                                          ⚠️  Missing

⭐ PRODUCTIVITY:
Session 1: 85/100
Session 2: N/A                                                    ⚠️  Not calculated
                                                                  ⬆ Session 1 is more productive

📋 TASKS:
           Created    Completed    Completion Rate
Session 1: 8          6            75%
Session 2: 5          5            100%                          ⬆ Better completion

💻 CODE:
           LOC Added   LOC Deleted   Net LOC
Session 1: +520        -70           +450
Session 2: N/A         N/A           N/A                         ⚠️  Not tracked

🤖 AI USAGE:
           Tokens In   Tokens Out    Total
Session 1: 45,000      12,000        57,000
Session 2: 32,000      8,500         40,500                      ⬇ 29% fewer tokens

🏷️  TAGS:
Session 1: feature, api, backend
Session 2: None                                                   ⚠️  No tags
```

**Underlying Data Structure** (for web UI):
```typescript
interface SessionComparison {
  session1: SessionListItem;
  session2: SessionListItem;
  differences: {
    duration: { value1: number; value2: number; percentDiff: number };
    productivity: { value1: number | null; value2: number | null; diff: number | null };
    tasks: { completion1: number; completion2: number; diff: number };
    loc: { net1: number | null; net2: number | null; diff: number | null };
    tokens: { total1: number; total2: number; percentDiff: number };
  };
  warnings: string[]; // Missing Phase 2 data warnings
}
```

### UI Integration Tips

1. **Split View**: Show sessions side-by-side in two columns
2. **Diff Indicators**: Use ⬆⬇➡ symbols or color coding
3. **Missing Data**: Show ⚠️ icon for NULL Phase 2 fields
4. **Percentage Changes**: Display in smaller font below values
5. **Insights Panel**: Show key takeaways at bottom

---

## Backend Integration (AIDIS Command)

### Option 1: Direct MCP Tool Calls (Current)

AIDIS Command can call these MCP tools directly via the MCP protocol:

```typescript
// In AIDIS Command backend
import { MCPClient } from './mcp-client';

async function getSessionsList(filters) {
  const response = await MCPClient.callTool('sessions_list', filters);
  // Parse response.content[0].text to extract data
  return parseSessionsList(response);
}
```

**Pros:**
- Works immediately (tools are already exposed)
- No additional API endpoints needed
- Consistent with current architecture

**Cons:**
- Response is formatted text (needs parsing)
- MCP protocol overhead

### Option 2: REST API Wrapper (Future Enhancement)

Create REST API endpoints that wrap the MCP tools:

```typescript
// In AIDIS Command backend (server.ts)
app.get('/api/sessions/list', async (req, res) => {
  const filters = {
    projectId: req.query.projectId,
    dateFrom: req.query.dateFrom,
    // ... map query params to tool params
  };

  // Call SessionTracker methods directly (same as MCP tools)
  const sessions = await SessionTracker.getSessionsList(filters);

  res.json(sessions); // Return pure JSON
});

app.get('/api/sessions/stats', async (req, res) => {
  const stats = await SessionTracker.getSessionStatsEnhanced({
    projectId: req.query.projectId,
    period: req.query.period,
    groupBy: req.query.groupBy,
    phase2Only: req.query.phase2Only === 'true'
  });

  res.json(stats);
});

app.post('/api/sessions/compare', async (req, res) => {
  const { sessionId1, sessionId2 } = req.body;

  // Fetch sessions and build comparison object
  const comparison = await buildComparison(sessionId1, sessionId2);

  res.json(comparison);
});
```

**Pros:**
- Clean JSON responses
- Standard REST API patterns
- Easy to consume in React/Vue frontend
- Better for web UI

**Cons:**
- Requires new endpoints
- Duplicates MCP tool logic
- More code to maintain

**Recommendation:** Start with Option 1 (MCP tools), add Option 2 when building web dashboard.

---

## Frontend Integration Examples

### React Component: SessionBrowser

```typescript
import React, { useState, useEffect } from 'react';

function SessionBrowser() {
  const [sessions, setSessions] = useState([]);
  const [filters, setFilters] = useState({
    limit: 25,
    offset: 0,
    sortBy: 'started_at',
    sortOrder: 'desc'
  });

  useEffect(() => {
    async function loadSessions() {
      // Call sessions_list MCP tool or REST endpoint
      const response = await api.callTool('sessions_list', filters);
      setSessions(response.sessions);
    }
    loadSessions();
  }, [filters]);

  return (
    <div>
      <h1>Sessions</h1>
      <FilterPanel filters={filters} onChange={setFilters} />
      <SessionTable sessions={sessions} />
      <Pagination
        currentPage={Math.floor(filters.offset / filters.limit) + 1}
        onPageChange={(page) => setFilters({
          ...filters,
          offset: (page - 1) * filters.limit
        })}
      />
    </div>
  );
}
```

### React Component: StatsDashboard

```typescript
import React, { useState, useEffect } from 'react';
import { Line, Bar } from 'react-chartjs-2';

function StatsDashboard() {
  const [stats, setStats] = useState(null);
  const [phase2Only, setPhase2Only] = useState(false);

  useEffect(() => {
    async function loadStats() {
      const response = await api.callTool('sessions_stats', {
        period: 'month',
        groupBy: 'project',
        phase2Only
      });
      setStats(response);
    }
    loadStats();
  }, [phase2Only]);

  if (!stats) return <Loading />;

  return (
    <div>
      <h1>Session Statistics</h1>

      <label>
        <input
          type="checkbox"
          checked={phase2Only}
          onChange={(e) => setPhase2Only(e.target.checked)}
        />
        Phase 2 Sessions Only
        {phase2Only && stats.overall.totalSessionsUnfiltered && (
          <span>
            ({stats.overall.totalSessions} of {stats.overall.totalSessionsUnfiltered} total)
          </span>
        )}
      </label>

      <MetricsCards stats={stats.overall} />

      <h2>Productivity Trend</h2>
      <Line data={buildChartData(stats.timeSeries)} />

      <h2>By Project</h2>
      <Bar data={buildGroupChartData(stats.groups)} />
    </div>
  );
}
```

### React Component: SessionComparison

```typescript
import React, { useState, useEffect } from 'react';

function SessionComparison({ sessionId1, sessionId2 }) {
  const [comparison, setComparison] = useState(null);

  useEffect(() => {
    async function loadComparison() {
      const response = await api.callTool('sessions_compare', {
        sessionId1,
        sessionId2
      });
      setComparison(response);
    }
    loadComparison();
  }, [sessionId1, sessionId2]);

  if (!comparison) return <Loading />;

  return (
    <div className="comparison-view">
      <h1>Session Comparison</h1>

      <div className="side-by-side">
        <SessionCard session={comparison.session1} />
        <SessionCard session={comparison.session2} />
      </div>

      <DiffIndicators differences={comparison.differences} />

      {comparison.warnings.length > 0 && (
        <WarningsPanel warnings={comparison.warnings} />
      )}
    </div>
  );
}
```

---

## NULL Handling Best Practices

### Display Patterns

| Phase 2 Field | If NULL | Display As | Color/Style |
|---------------|---------|------------|-------------|
| productivity_score | Yes | "N/A" | Gray, italic |
| lines_net | Yes | "N/A" or "-" | Gray, italic |
| session_goal | Yes | "No goal set" | Gray, italic |
| tags | Yes/empty | "No tags" or "-" | Gray, italic |
| ai_model | Yes | "Not tracked" | Gray, italic |

### Warning Indicators

When comparing old (NULL) vs new (Phase 2) sessions:
- ⚠️ Yellow icon for missing data
- Tooltip: "This session was created before Phase 2 tracking"
- Link: "Learn more about Phase 2 enhancements"

### Filtering Behavior

- `hasGoal: true` → Excludes all old sessions (they have NULL goals)
- `minProductivity: 50` → Excludes all old sessions (they have NULL scores)
- `phase2Only: true` → Excludes all sessions with NULL productivity_score

**UI Tip:** Show filtered count vs total count
```
Showing 12 Phase 2 sessions (86 total sessions available)
```

---

## Performance Considerations

### Query Performance

| Tool | Avg Response Time | Max Sessions Tested | Scalability |
|------|-------------------|---------------------|-------------|
| sessions_list | <50ms | 86 | Excellent (indexed) |
| sessions_stats | <200ms | 86 | Good (aggregates) |
| sessions_compare | <30ms | 2 | Excellent (direct fetch) |

**Database Indexes:**
- v_session_summaries is a virtual view (no storage cost)
- 21 indexes support fast filtering and sorting
- productivity_score index has WHERE clause (non-NULL only)
- GIN index on tags for array operations

### Optimization Tips

1. **Pagination**: Always use limit/offset (don't fetch all sessions)
2. **Caching**: Cache sessions_stats results for 5-10 minutes
3. **Debouncing**: Debounce filter changes in UI (300ms delay)
4. **Lazy Loading**: Load sessions_compare on demand (not on page load)

---

## Testing Recommendations

### Unit Tests (Backend)

```typescript
describe('sessions_list', () => {
  it('should return 25 sessions by default', async () => {
    const response = await callTool('sessions_list', {});
    expect(response.sessions.length).toBe(25);
  });

  it('should filter by hasGoal', async () => {
    const response = await callTool('sessions_list', { hasGoal: true });
    expect(response.sessions.every(s => s.session_goal !== null)).toBe(true);
  });

  it('should handle NULL Phase 2 data gracefully', async () => {
    const response = await callTool('sessions_list', {});
    // Should not throw, should show "N/A" for NULL fields
    expect(response).toBeTruthy();
  });
});
```

### Integration Tests (Frontend)

```typescript
describe('SessionBrowser', () => {
  it('should load and display sessions', async () => {
    render(<SessionBrowser />);
    await waitFor(() => {
      expect(screen.getByText(/Showing \d+ of \d+/)).toBeInTheDocument();
    });
  });

  it('should filter by project', async () => {
    render(<SessionBrowser />);
    fireEvent.change(screen.getByLabelText('Project'), {
      target: { value: 'aidis-core' }
    });
    await waitFor(() => {
      // Verify filtered sessions
    });
  });
});
```

---

## Migration Notes

### Current State (86 Sessions)

- **All sessions have NULL Phase 2 data**
- productivity_score: NULL for all
- session_goal: NULL for all
- tags: NULL or empty for all
- lines_added/deleted/net: NULL for all

### Future State (New Sessions)

- Sessions created after Phase 3 deployment will have Phase 2 data
- Use `phase2Only: true` to focus on new sessions
- Mixed dataset: 86 old + X new sessions

### UI Strategy

**Option A: Show All Sessions**
- Display old sessions with "N/A" indicators
- Good for historical view
- Use by default in sessions_list

**Option B: Phase 2 Only**
- Filter to only new sessions with tracking
- Good for accurate analytics
- Use by default in sessions_stats with toggle

**Recommendation:** Offer both options with clear toggle/filter.

---

## FAQ

### Q: Why do old sessions show "N/A" for productivity?
**A:** Sessions created before Phase 3 deployment don't have Phase 2 tracking data. Use the `phase2Only: true` filter to see only sessions with rich tracking.

### Q: Can I backfill Phase 2 data for old sessions?
**A:** Not recommended. The data doesn't exist (no goals, tags, or LOC were tracked). Focus on new sessions going forward.

### Q: How do I know which sessions have Phase 2 data?
**A:** Filter with `phase2Only: true` or check if `productivity_score IS NOT NULL`.

### Q: What's the difference between sessions_list and sessions_stats?
**A:** `sessions_list` returns individual sessions (paginated list). `sessions_stats` returns aggregate statistics (summaries, averages, trends).

### Q: Can I export sessions to CSV?
**A:** Not currently. Future enhancement could add export functionality.

### Q: How do I integrate with existing AIDIS Command?
**A:** Start by calling MCP tools directly. Later, add REST API endpoints for cleaner frontend integration.

---

## Support & Maintenance

### Database Views

**View:** `v_session_summaries`
- **Type:** Virtual (no storage cost)
- **Auto-updates:** Yes (reflects latest data)
- **Maintenance:** None required

### Performance Monitoring

Monitor these queries in production:
```sql
-- sessions_list performance
EXPLAIN ANALYZE
SELECT * FROM v_session_summaries
WHERE project_id = '...'
ORDER BY started_at DESC
LIMIT 25;

-- sessions_stats performance
EXPLAIN ANALYZE
SELECT AVG(productivity_score) FROM sessions
WHERE productivity_score IS NOT NULL;
```

### Future Enhancements

1. **Materialized view** (if sessions > 1,000)
2. **Full-text search** on goals/descriptions
3. **Export to CSV/JSON**
4. **Session bookmarking**
5. **Custom productivity formulas**

---

## Appendix: Complete API Reference

### sessions_list

**Full Parameter List:**
```typescript
{
  projectId?: string;
  dateFrom?: string; // ISO date YYYY-MM-DD
  dateTo?: string;
  tags?: string[];
  status?: 'active' | 'inactive' | 'all';
  agentType?: string;
  hasGoal?: boolean;
  minProductivity?: number; // 0-100
  sortBy?: 'started_at' | 'duration' | 'productivity' | 'loc';
  sortOrder?: 'asc' | 'desc';
  limit?: number; // 1-100, default: 25
  offset?: number; // default: 0
}
```

### sessions_stats

**Full Parameter List:**
```typescript
{
  projectId?: string;
  period?: 'day' | 'week' | 'month' | 'all'; // default: 'all'
  groupBy?: 'project' | 'agent' | 'tag' | 'none'; // default: 'none'
  phase2Only?: boolean; // default: false
}
```

### sessions_compare

**Full Parameter List:**
```typescript
{
  sessionId1: string; // REQUIRED
  sessionId2: string; // REQUIRED
}
```

---

**Document Version:** 1.0
**Last Updated:** 2025-10-05
**Maintained By:** AIDIS Alpha Team
**Status:** Production Ready for AIDIS Command Integration
