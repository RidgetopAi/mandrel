# PROJECT INSIGHTS INVESTIGATION REPORT
**Date**: 2025-10-07  
**Project**: aidis-refactor  
**Focus**: Connecting AIDIS MCP Analytics to AIDIS Command UI  
**Investigator**: Systematic investigation following FOREVER WORKFLOW

---

## EXECUTIVE SUMMARY

Three comprehensive investigations completed analyzing:
1. **AIDIS MCP Server Analytics Capabilities** (41 tools, consolidated from 52)
2. **AIDIS Command Backend API Endpoints** (100+ endpoints across 16 route modules)
3. **AIDIS Command Frontend Analytics UI** (23 analytics components, 67 total files analyzed)

**KEY FINDING**: MCP server has extensive analytics capabilities that are NOT fully exposed through backend API endpoints or frontend UI. Only 11 of 41 MCP tools are currently used by backend.

---

## 1. MCP SERVER ANALYTICS CAPABILITIES ✅

### 1.1 Primary Analytics Tool: `project_insights`

**Location**: `mcp-server/src/handlers/smartSearch.ts:407`

**Purpose**: Comprehensive project health dashboard

**Returns**:
- **Code Statistics**: Components count, complexity metrics
- **Context Insights**: By type with relevance scores
- **Decision Insights**: By type and impact level  
- **Task Insights**: By status and priority
- **AI-Generated Insights**: Code health, knowledge gaps, team efficiency
- **Automated Recommendations**: Next steps and improvements

**Current Integration**:
- ✅ Backend: `/api/projects/:id/insights` endpoint (Line 237 in project.ts)
- ✅ Frontend: `useProjectInsights()` hook displays on Dashboard

### 1.2 Consolidated Analytics Tools (TT009 Refactor)

**Before TT009**: 52 individual tools  
**After TT009**: 41 tools (21% reduction)  
**Token Savings**: 55% reduction (27,500 → 12,300 tokens)

**Metrics Tools (17 → 3)**:
- `metrics_collect` - Collect project/core/productivity metrics
- `metrics_analyze` - Dashboard, trends, correlations, executive summary
- `metrics_control` - Start/stop collection, alerts, performance, export

**Pattern Tools (17 → 2)**:
- `pattern_analyze` - Detection, analysis, tracking operations
- `pattern_insights` - Insights, correlations, recommendations, anomaly detection

**Status**: ❌ NOT integrated in backend or frontend

### 1.3 Database Schema

**Canonical Table**:
- `analytics_events` - Universal event tracking

**6 Metrics Tables**:
- `metrics_collection_sessions`
- `core_metrics`
- `pattern_intelligence_metrics`
- `productivity_health_metrics`
- `metrics_alerts`
- `metrics_trends`

**6 Pattern Tables**:
- `pattern_discovery_sessions`
- `pattern_co_occurrence`
- `pattern_temporal`
- `pattern_developer`
- `pattern_magnitude`
- `pattern_insights_table`

**3 Dashboard Views**:
- `project_metrics_dashboard`
- `developer_productivity_dashboard`
- `high_priority_alerts_dashboard`

**Performance**: 15+ specialized indexes for sub-100ms queries

### 1.4 Other Analytics Tools Available

- `context_search` - Semantic context search
- `context_get_recent` - Recent contexts
- `context_stats` - Context statistics
- `smart_search` - Unified intelligent search
- `task_progress_summary` - Task progress analytics
- `get_recommendations` - AI-powered recommendations
- `session_*` tools - 8 session analytics tools (migrated to REST API)

---

## 2. BACKEND API ENDPOINTS ✅

### 2.1 Current Analytics Endpoints

**Project Analytics**:
- ✅ `GET /api/projects/:id/insights` - Calls MCP `project_insights` tool
- ✅ `GET /api/projects/stats` - Direct DB queries
- ✅ `GET /api/projects/:id/sessions` - Project sessions

**Session Analytics** (8 endpoints):
- ✅ `GET /api/sessions/analytics` - Session overview
- ✅ `GET /api/sessions/trends` - Session trends over time
- ✅ `GET /api/sessions/productive` - Most productive sessions
- ✅ `GET /api/sessions/token-patterns` - Token usage patterns
- ✅ `GET /api/sessions/summaries` - Session summaries
- ✅ `GET /api/sessions/stats-by-period` - Time-period statistics
- ✅ `GET /api/sessions/stats` - Session statistics
- ✅ `GET /api/sessions/current` - Current active session

**Dashboard**:
- ✅ `GET /api/dashboard/stats` - Aggregated dashboard statistics

**Monitoring** (13 endpoints):
- ✅ `GET /api/monitoring/health`, `/metrics`, `/trends`, `/stats`
- ✅ `GET /api/monitoring/services`, `/alerts`, `/dashboard`

**Embedding Analytics** (9 endpoints):
- ✅ `GET /api/embedding/similarity`, `/projection`, `/cluster`
- ✅ `GET /api/embedding/metrics`, `/knowledge-gaps`

**Task Analytics**:
- ✅ `GET /api/tasks/stats` - Task statistics
- ✅ `GET /api/tasks/lead-time` - Lead time analytics

### 2.2 MCP Integration Status

**Currently Used MCP Tools (11/41 = 27%)**:

From **Naming Controller**:
- `naming_stats`, `naming_check`, `naming_suggest`, `naming_register`, `project_current`

From **Decision Controller**:
- `decision_record`, `decision_search`, `decision_stats`, `decision_update`, `project_switch`

From **Project Controller**:
- `project_insights` ⭐

**MCP Service Architecture**:
- HTTP connection to `localhost:8080`
- Endpoint pattern: `/mcp/tools/{toolName}`
- 10-second timeout
- Text response parsers for structured data extraction

### 2.3 MISSING Backend Endpoints ❌

**Critical Gaps**:

1. **No Metrics Analytics Endpoints**
   - `metrics_analyze` not exposed
   - `metrics_collect` not exposed
   - `metrics_control` not exposed

2. **No Pattern Analytics Endpoints**
   - `pattern_analyze` not exposed
   - `pattern_insights` not exposed

3. **No Smart Search Endpoint**
   - `smart_search` tool not exposed

4. **No AI Recommendations Endpoint**
   - `get_recommendations` tool not exposed

5. **Limited Context Search**
   - Not using MCP `context_search` (using direct DB instead)

**Recommendation**: Create new `/api/analytics` route module with:
```
/api/analytics/
  ├── /metrics          - Expose metrics_analyze
  ├── /patterns         - Expose pattern_analyze & pattern_insights
  ├── /recommendations  - Expose get_recommendations
  └── /smart-search     - Expose smart_search
```

---

## 3. FRONTEND ANALYTICS UI ✅

### 3.1 Analytics Components (23 components)

**Active Components**:
- ✅ `ProjectInsights.tsx` - Uses `/api/projects/:id/insights`
- ✅ `TaskAnalytics.tsx` - Uses `/api/tasks/stats`
- ✅ `AIComprehensionMetrics.tsx` - Uses MCP `complexity_analyze`
- ✅ `CodeHealthCards.tsx`, `CodeTrendCharts.tsx`, `HotspotDetection.tsx` - MCP tools
- ✅ `SessionSummaries.tsx` - Uses sessions API
- ✅ `SystemMonitoring.tsx`, `MonitoringStats.tsx`, `MonitoringAlerts.tsx` - Monitoring APIs
- ✅ `SessionDetail.tsx`, `SessionDetailView.tsx` - Session details
- ✅ `PerformanceDashboard.tsx`, `IntegrationTestDashboard.tsx` - Performance/testing

**Components with Issues**:
- ⚠️ `ErrorMonitoringDashboard.tsx` - Using mock data (TODO comment Line 40)

### 3.2 Frontend Pages

**Dashboard.tsx**:
- ✅ Project insights panel with tabs (Overview, Health Analysis, Raw Data)
- ✅ AI Comprehension section (live updates, code health, trends, hotspots)
- ✅ Session summaries
- ✅ System monitoring panels

**Analytics.tsx**:
- ✅ Session activity stats
- ✅ Recharts area chart (sessions, tokens, contexts, tasks over time)

**ProjectDetail.tsx**:
- ❌ **Analytics Tab PLACEHOLDER** (Lines 275-276)
- Status: "Analytics Coming Soon" alert
- **GAP**: Project-specific analytics dashboard missing

**Tasks.tsx**:
- ✅ `TaskAnalytics` component integrated

### 3.3 Data Visualization Libraries

**Recharts v2.15.4**:
- Used in Analytics.tsx for session trends
- Area charts with multiple series
- Dual Y-axes, tooltips, legends

**@ant-design/plots**:
- Used in TaskAnalytics.tsx
- Pie, bar, column, line, area charts

### 3.4 API Integration Layer

**OpenAPI Generated Clients**: Complete backend API coverage

**Custom Hooks**:
- `useDashboardStats()` - Dashboard overview
- `useProjects()`, `useProject()`, `useProjectStats()`, `useProjectInsights()`
- `useSessionAnalytics()`, `useSessionTrends()`
- `useFileAIComprehension()` - Calls MCP `complexity_analyze`
- `useProjectAIInsights()` - Calls MCP `project_insights`
- `useCodeHealthTrends()`, `useCodeHotspots()` - Call MCP `complexity_insights`

**MCP API Client**:
- File: `frontend/src/api/aidisApiClient.ts`
- Direct HTTP calls to `localhost:8080`
- Endpoint: `/v2/mcp/tools/{toolName}` or `/mcp/tools/{toolName}`
- Retry logic with exponential backoff
- 30-second timeout

**Active MCP Tool Calls from Frontend**:
- `project_insights` (via useProjectInsights)
- `complexity_analyze` (via useFileAIComprehension)
- `complexity_insights` (via useCodeHealthTrends, useCodeHotspots)

### 3.5 MISSING Frontend Components ❌

**Critical Gaps**:

1. **Project-Specific Analytics Dashboard**
   - Currently: Placeholder in ProjectDetail.tsx
   - Needed: Full analytics tab with metrics, patterns, trends

2. **AIDIS Metrics Dashboard**
   - No UI for `metrics_analyze` data
   - No visualization of development metrics
   - No metrics collection interface

3. **Pattern Analysis Dashboard**
   - No UI for `pattern_analyze` results
   - No pattern insights visualization
   - No pattern detection interface

4. **Decision Analytics Dashboard**
   - Decisions exist, but no trend analysis
   - No impact visualization
   - No decision effectiveness tracking

5. **Naming Analytics Dashboard**
   - Naming registry exists, but no analytics
   - No convention compliance trends
   - No suggestion effectiveness metrics

---

## 4. COMPREHENSIVE GAP ANALYSIS

### 4.1 MCP → Backend → Frontend Flow

| MCP Tool | Backend Endpoint | Frontend Component | Status |
|----------|------------------|-------------------|--------|
| `project_insights` | ✅ `/api/projects/:id/insights` | ✅ ProjectInsights.tsx | 🟢 CONNECTED |
| `metrics_analyze` | ❌ Missing | ❌ Missing | 🔴 NOT CONNECTED |
| `metrics_collect` | ❌ Missing | ❌ Missing | 🔴 NOT CONNECTED |
| `metrics_control` | ❌ Missing | ❌ Missing | 🔴 NOT CONNECTED |
| `pattern_analyze` | ❌ Missing | ❌ Missing | 🔴 NOT CONNECTED |
| `pattern_insights` | ❌ Missing | ❌ Missing | 🔴 NOT CONNECTED |
| `smart_search` | ❌ Missing | ❌ Missing | 🔴 NOT CONNECTED |
| `get_recommendations` | ❌ Missing | ❌ Missing | 🔴 NOT CONNECTED |
| `context_search` | ⚠️ Direct DB instead | ⚠️ Uses REST API | 🟡 PARTIAL |
| `context_get_recent` | ⚠️ Direct DB instead | ⚠️ Uses REST API | 🟡 PARTIAL |
| `task_progress_summary` | ❌ Missing | ❌ Missing | 🔴 NOT CONNECTED |
| `decision_*` tools | ✅ Basic CRUD | ⚠️ No analytics | 🟡 PARTIAL |
| `naming_*` tools | ✅ Basic CRUD | ⚠️ No analytics | 🟡 PARTIAL |
| `session_*` tools | ✅ REST API migration | ✅ SessionAnalytics | 🟢 CONNECTED |

**Summary**:
- 🟢 **Fully Connected**: 2/14 (14%)
- 🟡 **Partially Connected**: 4/14 (29%)
- 🔴 **Not Connected**: 8/14 (57%)

### 4.2 Database Schema → API Exposure

| Database View/Table | MCP Tool | Backend API | Frontend UI | Status |
|---------------------|----------|-------------|-------------|--------|
| `project_metrics_dashboard` | `metrics_analyze` | ❌ | ❌ | 🔴 NOT EXPOSED |
| `developer_productivity_dashboard` | `metrics_analyze` | ❌ | ❌ | 🔴 NOT EXPOSED |
| `high_priority_alerts_dashboard` | `metrics_control` | ❌ | ❌ | 🔴 NOT EXPOSED |
| `metrics_collection_sessions` | `metrics_collect` | ❌ | ❌ | 🔴 NOT EXPOSED |
| `pattern_discovery_sessions` | `pattern_analyze` | ❌ | ❌ | 🔴 NOT EXPOSED |
| `pattern_insights_table` | `pattern_insights` | ❌ | ❌ | 🔴 NOT EXPOSED |
| Sessions tables | Session APIs | ✅ | ✅ | 🟢 EXPOSED |
| Analytics events | `project_insights` | ✅ Partial | ✅ | 🟡 PARTIAL |

---

## 5. PRIORITIZED WORK PLAN

### Phase 1: Fix Project Detail Analytics Tab (IMMEDIATE)

**Current State**: Placeholder in `ProjectDetail.tsx` Lines 275-276

**Required**:
1. ✅ Backend endpoint exists: `/api/projects/:id/insights`
2. ✅ MCP tool exists: `project_insights`
3. ✅ Frontend hook exists: `useProjectInsights()`
4. ❌ UI implementation: Replace placeholder with actual dashboard

**Work Items**:
- [ ] Design project analytics dashboard layout
- [ ] Implement charts for code statistics
- [ ] Implement decision impact visualization
- [ ] Implement task progress visualization
- [ ] Add AI insights display panel
- [ ] Add recommendations section
- [ ] Remove "Analytics Coming Soon" placeholder
- [ ] Test with real project data

**Estimated Effort**: 1-2 days  
**Priority**: HIGH  
**Impact**: Immediate value, uses existing infrastructure

---

### Phase 2: Add Metrics Analytics (HIGH VALUE)

**Required Backend Work**:
1. Create `/api/analytics/metrics` route module
2. Implement endpoint for `metrics_analyze` tool
3. Implement endpoint for `metrics_collect` tool
4. Add response parsers in MCP service

**API Endpoints Needed**:
```
GET  /api/analytics/metrics/dashboard?projectId=X
GET  /api/analytics/metrics/trends?projectId=X&timeframe=30d
GET  /api/analytics/metrics/correlations?projectId=X
POST /api/analytics/metrics/collect
```

**Required Frontend Work**:
1. Create `MetricsDashboard.tsx` component
2. Create `MetricsTrends.tsx` component
3. Create hooks: `useMetrics()`, `useMetricsTrends()`
4. Add visualizations (line charts, heatmaps)
5. Add to ProjectDetail or new Analytics tab

**Estimated Effort**: 3-4 days  
**Priority**: HIGH  
**Impact**: Exposes 3 consolidated MCP tools (metrics_analyze, metrics_collect, metrics_control)

---

### Phase 3: Add Pattern Analytics (HIGH VALUE)

**Required Backend Work**:
1. Create `/api/analytics/patterns` route module
2. Implement endpoint for `pattern_analyze` tool
3. Implement endpoint for `pattern_insights` tool
4. Add response parsers in MCP service

**API Endpoints Needed**:
```
POST /api/analytics/patterns/analyze
GET  /api/analytics/patterns/insights?projectId=X
GET  /api/analytics/patterns/correlations?projectId=X
GET  /api/analytics/patterns/recommendations?projectId=X
```

**Required Frontend Work**:
1. Create `PatternsDashboard.tsx` component
2. Create `PatternInsights.tsx` component
3. Create hooks: `usePatterns()`, `usePatternInsights()`
4. Add visualizations (network graphs, timelines)
5. Add to ProjectDetail or Analytics page

**Estimated Effort**: 3-4 days  
**Priority**: HIGH  
**Impact**: Exposes 2 consolidated MCP tools (pattern_analyze, pattern_insights)

---

### Phase 4: Add Smart Search & Recommendations (MEDIUM VALUE)

**Required Backend Work**:
1. Create `/api/analytics/smart-search` endpoint
2. Create `/api/analytics/recommendations` endpoint
3. Integrate `smart_search` MCP tool
4. Integrate `get_recommendations` MCP tool

**Required Frontend Work**:
1. Add smart search bar component
2. Add recommendations panel to Dashboard
3. Create hooks: `useSmartSearch()`, `useRecommendations()`

**Estimated Effort**: 2-3 days  
**Priority**: MEDIUM  
**Impact**: Unified search + AI-powered guidance

---

### Phase 5: Enhance Decision & Naming Analytics (LOW PRIORITY)

**Current State**: Basic CRUD exists, no analytics

**Required Work**:
1. Add decision trend charts
2. Add decision impact analysis
3. Add naming convention compliance dashboard
4. Add naming suggestion effectiveness metrics

**Estimated Effort**: 2-3 days  
**Priority**: LOW  
**Impact**: Polish existing features

---

## 6. TECHNICAL RECOMMENDATIONS

### 6.1 Backend Architecture

**Recommended Structure**:
```
backend/src/
├── routes/
│   └── analytics.ts          # New unified analytics routes
├── controllers/
│   └── analytics.ts          # New analytics controller
├── services/
│   ├── metricsAnalytics.ts   # Metrics service
│   ├── patternAnalytics.ts   # Pattern service
│   └── mcp.ts                # Existing MCP service (extend)
```

**MCP Service Extensions**:
- Add `callMetricsAnalyze()` method
- Add `callPatternAnalyze()` method
- Add response type definitions
- Add error handling for new tools

### 6.2 Frontend Architecture

**Recommended Structure**:
```
frontend/src/
├── components/analytics/
│   ├── MetricsDashboard.tsx      # New
│   ├── MetricsTrends.tsx         # New
│   ├── PatternsDashboard.tsx     # New
│   ├── PatternInsights.tsx       # New
│   ├── SmartSearchBar.tsx        # New
│   └── RecommendationsPanel.tsx  # New
├── hooks/
│   ├── useMetrics.ts             # New
│   ├── usePatterns.ts            # New
│   ├── useSmartSearch.ts         # New
│   └── useRecommendations.ts     # New
├── pages/
│   └── ProjectDetail.tsx         # Update analytics tab
```

**Design Consistency**:
- Follow existing Ant Design patterns
- Reuse Recharts for time-series data
- Use @ant-design/plots for categorical data
- Match existing component styling

### 6.3 Testing Strategy

**Backend Tests**:
- Unit tests for new analytics controllers
- Integration tests for MCP tool calls
- Mock MCP responses for faster testing

**Frontend Tests**:
- Component tests with React Testing Library
- Mock API responses
- Snapshot tests for charts

---

## 7. RISK ASSESSMENT

### 7.1 Low Risk Items ✅

- **Project Detail Analytics Tab**: All infrastructure exists, just needs UI implementation
- **Session Analytics**: Already working well
- **Monitoring**: Already implemented

### 7.2 Medium Risk Items ⚠️

- **Metrics Analytics**: MCP tools consolidated recently (TT009), may need debugging
- **Pattern Analytics**: Complex data structures, visualization may be challenging
- **Error Handling**: New endpoints need robust error handling

### 7.3 High Risk Items 🔴

- **Database Performance**: Dashboard views may be slow with large datasets
- **Real-time Updates**: Pattern/metrics may need WebSocket support for live data
- **Breaking Changes**: Ensure backward compatibility with existing API clients

---

## 8. SUCCESS METRICS

**Measure Success By**:

1. **Coverage**: % of MCP analytics tools exposed through API
   - Current: 27% (11/41 tools)
   - Target: 80%+ (33/41 tools)

2. **Feature Completeness**: Project Detail Analytics Tab
   - Current: 0% (placeholder)
   - Target: 100% (fully functional)

3. **User Value**: Dashboard load time
   - Current: Unknown
   - Target: <2 seconds (from AIDIS_REFACTOR_MASTER_PLAN.md)

4. **Test Coverage**: New analytics endpoints
   - Current: 0%
   - Target: 80%+ (from refactor plan)

---

## 9. NEXT STEPS FOR REVIEW

**Questions for Partner**:

1. **Priority Confirmation**: Agree on Phase 1 (Project Detail Analytics Tab) as starting point?
2. **Scope Validation**: Should we tackle all phases or focus on Phase 1 + Phase 2?
3. **Timeline**: Working incrementally or batch multiple phases?
4. **Design Decisions**: Any specific visualization preferences for metrics/patterns?
5. **Breaking Changes**: Okay to extend existing APIs or prefer new versioned endpoints?

**Ready for Implementation Phase Once Approved** ✅

---

## 10. INVESTIGATION METADATA

**Files Analyzed**: 200+ files across MCP server, backend, and frontend

**Key Directories**:
- `mcp-server/src/handlers/` - MCP tool implementations
- `mcp-server/src/services/` - Analytics services
- `mcp-server/migrations/` - Database schema
- `aidis-command/backend/src/routes/` - API routes
- `aidis-command/backend/src/controllers/` - API controllers
- `aidis-command/frontend/src/components/analytics/` - Analytics UI
- `aidis-command/frontend/src/hooks/` - Data fetching hooks

**Tools Used**:
- Grep for code pattern search
- Read for file analysis
- Finder for semantic code search
- 3 parallel investigation subagents

**Investigation Time**: ~15 minutes  
**Report Compilation**: Complete  
**Status**: Ready for partner review

---

**END OF INVESTIGATION REPORT**
