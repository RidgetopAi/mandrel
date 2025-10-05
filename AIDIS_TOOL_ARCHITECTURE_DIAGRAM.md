# AIDIS Tool Architecture Diagram

## Tool Registration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    AIDIS MCP SERVER                              │
│                     (server.ts)                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  MCP Request → validateTool() → executeToolOperation()          │
│                                     │                            │
│                                     ▼                            │
│              ┌──────────────────────────────────────┐            │
│              │   SWITCH STATEMENT (86 cases)        │            │
│              │   Lines 890-1134                     │            │
│              └──────────────────────────────────────┘            │
│                      │                                           │
│         ┌────────────┼────────────┐                             │
│         ▼            ▼            ▼                             │
│   ┌─────────┐  ┌─────────┐  ┌──────────┐                       │
│   │ Direct  │  │External │  │Unified   │                       │
│   │ Methods │  │Handler  │  │Functions │                       │
│   │(40 tools│  │Classes  │  │(5 tools) │                       │
│   │         │  │(41 tools│  │          │                       │
│   └─────────┘  └─────────┘  └──────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

## Handler Architecture Breakdown

### Direct Methods (40 tools in server.ts)
```
┌──────────────────────────────────────────────────────────┐
│ DIRECT METHODS IN SERVER.TS                              │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ System (5):           handlePing()                       │
│                       handleStatus()                     │
│                       handleHelp()                       │
│                       handleExplain()                    │
│                       handleExamples()                   │
│                                                           │
│ Context (4):          handleContextStore()               │
│                       handleContextSearch()              │
│                       handleContextGetRecent()           │
│                       handleContextStats()               │
│                                                           │
│ Project (6):          handleProjectList()                │
│                       handleProjectCreate()              │
│                       handleProjectSwitch()              │
│                       handleProjectCurrent()             │
│                       handleProjectInfo()                │
│                       handleProjectInsights()            │
│                                                           │
│ Session (5):          handleSessionAssign()              │
│                       handleSessionStatus()              │
│                       handleSessionNew()                 │
│                       handleSessionUpdate()              │
│                       handleSessionDetails()             │
│                                                           │
│ Naming (4):           handleNamingRegister()             │
│                       handleNamingCheck()                │
│                       handleNamingSuggest()              │
│                       handleNamingStats()                │
│                                                           │
│ Decisions (4):        handleDecisionRecord()             │
│                       handleDecisionSearch()             │
│                       handleDecisionUpdate()             │
│                       handleDecisionStats()              │
│                                                           │
│ Tasks (6):            handleTaskCreate()                 │
│                       handleTaskList()                   │
│                       handleTaskUpdate()                 │
│                       handleTaskDetails()                │
│                       handleTaskBulkUpdate()             │
│                       handleTaskProgressSummary()        │
│                                                           │
│ Code (5):             handleCodeAnalyze()                │
│                       handleCodeComponents()             │
│                       handleCodeDependencies()           │
│                       handleCodeImpact()                 │
│                       handleCodeStats()                  │
│                                                           │
│ Smart Search (2):     handleSmartSearch()                │
│                       handleRecommendations()            │
│                                                           │
│ Git (3):              handleGitSessionCommits()          │
│                       handleGitCommitSessions()          │
│                       handleGitCorrelateSession()        │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### External Handler Classes (41 tools - DEPRECATED)
```
┌────────────────────────────────────────────────────────────┐
│ EXTERNAL HANDLERS (TO BE REMOVED)                         │
├────────────────────────────────────────────────────────────┤
│                                                             │
│ handlers/patternDetection.ts (8 tools)                     │
│   └─ patternDetectionHandlers                             │
│       ├─ pattern_detection_start                          │
│       ├─ pattern_detection_stop                           │
│       ├─ pattern_detect_commits                           │
│       ├─ pattern_get_session_insights                     │
│       ├─ pattern_analyze_project                          │
│       ├─ pattern_get_alerts                               │
│       ├─ pattern_detection_status                         │
│       └─ pattern_track_git_activity                       │
│                                                             │
│ handlers/patternAnalysis.ts (10 tools)                     │
│   └─ patternAnalysisHandlers                              │
│       ├─ pattern_get_discovered                           │
│       ├─ pattern_get_trends                               │
│       ├─ pattern_get_correlations                         │
│       ├─ pattern_get_insights                             │
│       ├─ pattern_get_alerts                               │
│       ├─ pattern_get_anomalies                            │
│       ├─ pattern_get_recommendations                      │
│       ├─ pattern_analyze_session                          │
│       ├─ pattern_analyze_commit                           │
│       └─ pattern_get_performance                          │
│                                                             │
│ handlers/developmentMetrics.ts (12 tools)                  │
│   └─ DevelopmentMetricsHandler.handleTool()               │
│       ├─ metrics_collect_project                          │
│       ├─ metrics_get_dashboard                            │
│       ├─ metrics_get_core_metrics                         │
│       ├─ metrics_get_pattern_intelligence                 │
│       ├─ metrics_get_productivity_health                  │
│       ├─ metrics_get_alerts                               │
│       ├─ metrics_acknowledge_alert                        │
│       ├─ metrics_resolve_alert                            │
│       ├─ metrics_get_trends                               │
│       ├─ metrics_get_performance                          │
│       ├─ metrics_start_collection                         │
│       └─ metrics_stop_collection                          │
│                                                             │
│ handlers/metricsAggregation.ts (5 tools)                   │
│   └─ MetricsAggregationHandler.handleTool()               │
│       ├─ metrics_aggregate_projects                       │
│       ├─ metrics_aggregate_timeline                       │
│       ├─ metrics_calculate_correlations                   │
│       ├─ metrics_get_executive_summary                    │
│       └─ metrics_export_data                              │
│                                                             │
│ handlers/codeComplexity.ts (6 tools) - ALREADY REMOVED    │
│   └─ CodeComplexityHandler (deprecated - TT009-1)         │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### Unified Handler Functions (8 tools - NEW TT009)
```
┌────────────────────────────────────────────────────────────┐
│ UNIFIED HANDLERS (TT009 CONSOLIDATION)                     │
├────────────────────────────────────────────────────────────┤
│                                                             │
│ handlers/complexity/ (TT009-1 ✅ COMPLETE)                 │
│   ├─ complexityAnalyze.ts                                 │
│   │   └─ handleComplexityAnalyze()                        │
│   │       └─ Consolidates: file analysis, commit analysis │
│   ├─ complexityInsights.ts                                │
│   │   └─ handleComplexityInsights()                       │
│   │       └─ Consolidates: dashboard, hotspots, trends,   │
│   │           technical debt, refactoring opportunities    │
│   └─ complexityManage.ts                                  │
│       └─ handleComplexityManage()                         │
│           └─ Consolidates: tracking, alerts, thresholds,  │
│               performance monitoring                       │
│                                                             │
│ handlers/metrics/ (TT009-2 ⚠️ INCOMPLETE)                  │
│   ├─ metricsCollect.ts                                    │
│   │   └─ handleMetricsCollect()                           │
│   │       └─ Should consolidate: project collection,      │
│   │           collection control                          │
│   ├─ metricsAnalyze.ts                                    │
│   │   └─ handleMetricsAnalyze()                           │
│   │       └─ Should consolidate: dashboard, core metrics, │
│   │           pattern intelligence, trends, correlations  │
│   └─ metricsControl.ts                                    │
│       └─ handleMetricsControl()                           │
│           └─ Should consolidate: alerts, performance,     │
│               aggregation, export                         │
│                                                             │
│ handlers/patterns/ (TT009-3 ⚠️ INCOMPLETE)                 │
│   ├─ patternAnalyze.ts                                    │
│   │   └─ handlePatternAnalyze()                           │
│   │       └─ Should consolidate: detection start/stop,    │
│   │           commit analysis, project analysis           │
│   └─ patternInsights.ts                                   │
│       └─ handlePatternInsights()                          │
│           └─ Should consolidate: discovered patterns,     │
│               trends, correlations, insights, alerts,     │
│               anomalies, recommendations                  │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

## Tool Count Evolution

### Original State (Before TT009)
```
┌──────────────────────────────────────┐
│ BEFORE TT009 CONSOLIDATION           │
├──────────────────────────────────────┤
│ Core Tools:             44 tools     │
│ Complexity Tools:       16 tools     │
│ Metrics Tools:          17 tools     │
│ Pattern Tools:          17 tools     │
├──────────────────────────────────────┤
│ TOTAL:                  94 tools     │
└──────────────────────────────────────┘
```

### Current State (TT009 Partial)
```
┌──────────────────────────────────────┐
│ CURRENT STATE (INCOMPLETE)           │
├──────────────────────────────────────┤
│ Core Tools:             44 tools  ✅ │
│ Complexity Consolidated: 3 tools  ✅ │
│ Complexity Old:          0 tools  ✅ │
│ Metrics Consolidated:    3 tools  ✅ │
│ Metrics Old:            17 tools  ❌ │
│ Pattern Consolidated:    2 tools  ✅ │
│ Pattern Old:            18 tools  ❌ │
├──────────────────────────────────────┤
│ TOTAL:                  86 tools     │
│ (Should be: 47-52 tools)             │
└──────────────────────────────────────┘
```

### Target State (TT009 Complete)
```
┌──────────────────────────────────────┐
│ TARGET STATE (AFTER CLEANUP)         │
├──────────────────────────────────────┤
│ Core Tools:             44 tools  ✅ │
│   - System/Nav:          5 tools     │
│   - Context:             4 tools     │
│   - Project:             6 tools     │
│   - Session:             5 tools     │
│   - Naming:              4 tools     │
│   - Decisions:           4 tools     │
│   - Tasks:               6 tools     │
│   - Code:                5 tools     │
│   - Smart Search:        2 tools     │
│   - Git:                 3 tools     │
│                                       │
│ Complexity Consolidated: 3 tools  ✅ │
│ Metrics Consolidated:    3 tools  ✅ │
│ Pattern Consolidated:    2 tools  ✅ │
├──────────────────────────────────────┤
│ TOTAL:                  52 tools     │
│                                       │
│ OR (if nav separate):                │
│ Core AIDIS:             49 tools     │
│ Navigation:              3 tools     │
└──────────────────────────────────────┘
```

## TT009 Consolidation Progress

```
TT009 TOOL CONSOLIDATION PHASES
═══════════════════════════════════════════════════════════

Phase 1: COMPLEXITY (16 → 3 tools) ✅ COMPLETE
┌────────────────────────────────────────────────┐
│ ✅ Created: complexity_analyze                 │
│ ✅ Created: complexity_insights                │
│ ✅ Created: complexity_manage                  │
│ ✅ Removed: 16 old complexity tools            │
│ ✅ Updated: server.ts switch statement         │
│ ✅ Updated: toolDefinitions.ts                 │
│ ✅ Added: Completion comment in code           │
└────────────────────────────────────────────────┘

Phase 2: METRICS (17 → 3 tools) ⚠️ INCOMPLETE
┌────────────────────────────────────────────────┐
│ ✅ Created: metrics_collect                    │
│ ✅ Created: metrics_analyze                    │
│ ✅ Created: metrics_control                    │
│ ❌ Remove: 12 developmentMetrics tools         │
│ ❌ Remove: 5 metricsAggregation tools          │
│ ⚠️  Updated: server.ts (added new, kept old)   │
│ ❌ Update: toolDefinitions.ts                  │
│ ⚠️  Comment: "to be consolidated in Phase 2"   │
└────────────────────────────────────────────────┘

Phase 3: PATTERNS (17 → 2 tools) ⚠️ INCOMPLETE
┌────────────────────────────────────────────────┐
│ ✅ Created: pattern_analyze                    │
│ ✅ Created: pattern_insights                   │
│ ❌ Remove: 8 patternDetection tools            │
│ ❌ Remove: 10 patternAnalysis tools            │
│ ⚠️  Updated: server.ts (added new, kept old)   │
│ ❌ Update: toolDefinitions.ts                  │
│ ❌ Add: Completion comment                     │
└────────────────────────────────────────────────┘
```

## Side-by-Side Comparison

### Metrics Tools: Old vs New

```
┌─────────────────────────────────────┬─────────────────────────────────┐
│ OLD (17 tools - TO BE REMOVED)      │ NEW (3 tools - CONSOLIDATED)    │
├─────────────────────────────────────┼─────────────────────────────────┤
│                                     │                                 │
│ Collection (3 tools):               │ metrics_collect                 │
│   - metrics_collect_project         │   operation: "project"          │
│   - metrics_start_collection        │   operation: "start"            │
│   - metrics_stop_collection         │   operation: "stop"             │
│                                     │                                 │
│ Analysis (7 tools):                 │ metrics_analyze                 │
│   - metrics_get_dashboard           │   operation: "dashboard"        │
│   - metrics_get_core_metrics        │   operation: "core"             │
│   - metrics_get_pattern_intelligence│   operation: "patterns"         │
│   - metrics_get_productivity_health │   operation: "productivity"     │
│   - metrics_get_trends              │   operation: "trends"           │
│   - metrics_aggregate_timeline      │   operation: "aggregate"        │
│   - metrics_calculate_correlations  │   operation: "correlations"     │
│                                     │                                 │
│ Control (7 tools):                  │ metrics_control                 │
│   - metrics_get_alerts              │   operation: "get_alerts"       │
│   - metrics_acknowledge_alert       │   operation: "ack_alert"        │
│   - metrics_resolve_alert           │   operation: "resolve_alert"    │
│   - metrics_get_performance         │   operation: "performance"      │
│   - metrics_aggregate_projects      │   operation: "aggregate"        │
│   - metrics_get_executive_summary   │   operation: "executive"        │
│   - metrics_export_data             │   operation: "export"           │
│                                     │                                 │
└─────────────────────────────────────┴─────────────────────────────────┘
```

### Pattern Tools: Old vs New

```
┌─────────────────────────────────────┬─────────────────────────────────┐
│ OLD (18 tools - TO BE REMOVED)      │ NEW (2 tools - CONSOLIDATED)    │
├─────────────────────────────────────┼─────────────────────────────────┤
│                                     │                                 │
│ Detection & Analysis (10 tools):    │ pattern_analyze                 │
│   - pattern_detection_start         │   operation: "start"            │
│   - pattern_detection_stop          │   operation: "stop"             │
│   - pattern_detect_commits          │   operation: "commits"          │
│   - pattern_analyze_project         │   operation: "project"          │
│   - pattern_analyze_session         │   operation: "session"          │
│   - pattern_analyze_commit          │   operation: "commit"           │
│   - pattern_detection_status        │   operation: "status"           │
│   - pattern_track_git_activity      │   operation: "track"            │
│   - pattern_get_discovered          │   operation: "discovered"       │
│   - pattern_get_performance         │   operation: "performance"      │
│                                     │                                 │
│ Insights & Intelligence (8 tools):  │ pattern_insights                │
│   - pattern_get_session_insights    │   operation: "session"          │
│   - pattern_get_trends              │   operation: "trends"           │
│   - pattern_get_correlations        │   operation: "correlations"     │
│   - pattern_get_insights            │   operation: "insights"         │
│   - pattern_get_alerts              │   operation: "alerts"           │
│   - pattern_get_anomalies           │   operation: "anomalies"        │
│   - pattern_get_recommendations     │   operation: "recommendations"  │
│                                     │                                 │
└─────────────────────────────────────┴─────────────────────────────────┘
```

## Cleanup Checklist

### Files to Modify
```
✅ /mcp-server/src/server.ts
   - Remove case statements for deprecated tools (lines 1026-1116)
   - Remove handler imports (lines 59-60, 62, 92)
   - Update comments to mark completion

✅ /mcp-server/src/config/toolDefinitions.ts
   - Remove 35 deprecated tool definitions
   - Keep 52 active tool definitions
   - Verify schema matches consolidated tools

⚠️  /CLAUDE.md
   - Update tool count (47 → 52 or clarify)
   - Remove references to deprecated tools
   - Update category counts

⚠️  /docs/AIDIS_MCP_SERVER_REFERENCE_GUIDE.md
   - Update tool listings
   - Document consolidated tools
   - Add migration guide
```

### Files to Archive
```
📦 /mcp-server/src/handlers/developmentMetrics.ts
📦 /mcp-server/src/handlers/metricsAggregation.ts
📦 /mcp-server/src/handlers/patternDetection.ts
📦 /mcp-server/src/handlers/patternAnalysis.ts
📦 /mcp-server/src/handlers/codeComplexity.ts (already deprecated)

→ Move to: /backups/deprecated-handlers-tt009/
```

### Testing Required
```
□ Test metrics_collect with all operations
□ Test metrics_analyze with all operations
□ Test metrics_control with all operations
□ Test pattern_analyze with all operations
□ Test pattern_insights with all operations
□ Verify no breaking changes
□ Check dependent services still work
□ Validate HTTP bridge compatibility
```

---

**Diagram Version**: 1.0
**Last Updated**: 2025-10-01
**Status**: Investigation Complete - Ready for Cleanup
