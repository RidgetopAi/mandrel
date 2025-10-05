# AIDIS Wired Tools Investigation Report
## Complete Analysis of Tool Registration Architecture

**Investigation Date**: 2025-10-01
**Investigator**: Claude Code Agent
**Objective**: Determine the ACTUAL list of wired and available AIDIS tools

---

## EXECUTIVE SUMMARY

### Key Findings
- **Total Tools Defined**: 86 tools in toolDefinitions.ts
- **Total Tools Wired**: 86 tools in server.ts switch statement
- **Expected Tools**: 47 tools (per CLAUDE.md after TT009 consolidation)
- **Discrepancy**: 39 additional tools are still wired (deprecated tools not removed)

### Critical Discovery
**Both old AND new tools are wired simultaneously**. The TT009 consolidation created NEW unified tools but did NOT remove the OLD individual tools. This means:
- ✅ New consolidated tools ARE wired and functional
- ⚠️ Old individual tools are ALSO still wired and functional
- ⚠️ This creates duplication and potential confusion

---

## TOOL REGISTRATION ARCHITECTURE

### How Tools Are Registered

**Location**: `/home/ridgetop/aidis/mcp-server/src/server.ts`
**Pattern**: Switch statement in `executeToolOperation` method
**Lines**: 888-1134

```typescript
private async executeToolOperation(toolName: string, validatedArgs: any): Promise<any> {
  switch (toolName) {
    case 'aidis_ping':
      return await this.handlePing(validatedArgs as { message?: string });

    case 'context_store':
      return await this.handleContextStore(validatedArgs as any);

    // ... 84 more cases ...

    default:
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${toolName}`
      );
  }
}
```

### Handler Architecture

Tools are connected to handlers in three ways:

1. **Direct Methods** (40 tools)
   - Handlers defined as private methods in server.ts
   - Example: `case 'aidis_ping': return await this.handlePing(args);`
   - Used for: System, Context, Project, Session, Naming, Decisions, Tasks, Code Analysis, Git

2. **External Handler Classes** (41 tools)
   - Handlers imported from separate handler files
   - Example: `case 'pattern_detection_start': return await patternDetectionHandlers.pattern_detection_start(args);`
   - Used for: Pattern Detection, Pattern Analysis, Development Metrics, Metrics Aggregation

3. **Unified Handler Functions** (5 tools)
   - New TT009 consolidated handlers
   - Example: `case 'complexity_analyze': return await handleComplexityAnalyze(args);`
   - Used for: Complexity (3), Metrics (3), Pattern (2) - but only 5 actually in consolidated form

---

## COMPLETE WIRED TOOL INVENTORY

### SYSTEM HEALTH (5 tools wired, 2 expected)

✅ **Expected Tools**:
1. `aidis_ping` → Handler: server.ts:1257 (handlePing)
2. `aidis_status` → Handler: server.ts:1276 (handleStatus)

⚠️ **Additional Tools** (Navigation - should these count?):
3. `aidis_help` → Handler: server.ts:1306 (handleHelp)
4. `aidis_explain` → Handler: server.ts:1311 (handleExplain)
5. `aidis_examples` → Handler: server.ts:1316 (handleExamples)

---

### CONTEXT MANAGEMENT (4 tools, as expected ✅)

1. `context_store` → Handler: server.ts:1324 (handleContextStore)
2. `context_search` → Handler: server.ts:1357 (handleContextSearch)
3. `context_get_recent` → Handler: server.ts:1425 (handleContextGetRecent)
4. `context_stats` → Handler: server.ts:1468 (handleContextStats)

**Status**: ✅ Perfect match

---

### PROJECT MANAGEMENT (6 tools, as expected ✅)

1. `project_list` → Handler: server.ts:1495 (handleProjectList)
2. `project_create` → Handler: server.ts:1541 (handleProjectCreate)
3. `project_switch` → Handler: server.ts:1571 (handleProjectSwitch)
4. `project_current` → Handler: server.ts:1667 (handleProjectCurrent)
5. `project_info` → Handler: server.ts:1720 (handleProjectInfo)
6. `project_insights` → Handler: server.ts:3136 (handleProjectInsights)

**Status**: ✅ Perfect match

---

### SESSION MANAGEMENT (5 tools, as expected ✅)

1. `session_assign` → Handler: server.ts:3587 (handleSessionAssign)
2. `session_status` → Handler: server.ts:3605 (handleSessionStatus)
3. `session_new` → Handler: server.ts:3648 (handleSessionNew)
4. `session_update` → Handler: server.ts:3666 (handleSessionUpdate)
5. `session_details` → Handler: server.ts:3736 (handleSessionDetails)

**Status**: ✅ Perfect match

---

### NAMING REGISTRY (4 tools, as expected ✅)

1. `naming_register` → Handler: server.ts:1763 (handleNamingRegister)
2. `naming_check` → Handler: server.ts:1796 (handleNamingCheck)
3. `naming_suggest` → Handler: server.ts:1864 (handleNamingSuggest)
4. `naming_stats` → Handler: server.ts:1907 (handleNamingStats)

**Status**: ✅ Perfect match

---

### TECHNICAL DECISIONS (4 tools, as expected ✅)

1. `decision_record` → Handler: server.ts:1935 (handleDecisionRecord)
2. `decision_search` → Handler: server.ts:1979 (handleDecisionSearch)
3. `decision_update` → Handler: server.ts:2034 (handleDecisionUpdate)
4. `decision_stats` → Handler: server.ts:2063 (handleDecisionStats)

**Status**: ✅ Perfect match

---

### TASK MANAGEMENT (6 tools wired, 4 expected)

✅ **Expected Tools**:
1. `task_create` → Handler: server.ts:2242 (handleTaskCreate)
2. `task_list` → Handler: server.ts:2284 (handleTaskList)
3. `task_update` → Handler: server.ts:2351 (handleTaskUpdate)
4. `task_details` → Handler: server.ts:2516 (handleTaskDetails)

⚠️ **Additional Tools**:
5. `task_bulk_update` → Handler: server.ts:2381 (handleTaskBulkUpdate)
6. `task_progress_summary` → Handler: server.ts:2451 (handleTaskProgressSummary)

**Status**: ⚠️ 2 extra tools (bulk_update and progress_summary added but not in count)

---

### CODE ANALYSIS (5 tools, as expected ✅)

1. `code_analyze` → Handler: server.ts:2815 (handleCodeAnalyze)
2. `code_components` → Handler: server.ts:2854 (handleCodeComponents)
3. `code_dependencies` → Handler: server.ts:2902 (handleCodeDependencies)
4. `code_impact` → Handler: server.ts:2943 (handleCodeImpact)
5. `code_stats` → Handler: server.ts:2996 (handleCodeStats)

**Status**: ✅ Perfect match

---

### SMART SEARCH & AI (2 tools, as expected ✅)

1. `smart_search` → Handler: server.ts:3028 (handleSmartSearch)
2. `get_recommendations` → Handler: server.ts:3083 (handleRecommendations)

**Status**: ✅ Perfect match

---

### GIT INTEGRATION (3 tools, as expected ✅)

1. `git_session_commits` → Handler: server.ts:3814 (handleGitSessionCommits)
2. `git_commit_sessions` → Handler: server.ts:3884 (handleGitCommitSessions)
3. `git_correlate_session` → Handler: server.ts:3960 (handleGitCorrelateSession)

**Status**: ✅ Perfect match

---

### COMPLEXITY TOOLS (3 consolidated + 0 individual = 3 total ✅)

**TT009-1 Consolidated Tools** (Expected and Wired):
1. `complexity_analyze` → Handler: handlers/complexity/complexityAnalyze.ts:379
2. `complexity_insights` → Handler: handlers/complexity/complexityInsights.ts:443
3. `complexity_manage` → Handler: handlers/complexity/complexityManage.ts:697

**Old Individual Tools**: ❌ REMOVED (TT009-1 complete)
- Comment in server.ts:1125-1126 confirms: "TC015: Deprecated complexity tools removed - TT009-1 Tool Consolidation Phase 1 Complete"
- "16 tools consolidated into complexity_analyze, complexity_insights, complexity_manage"

**Status**: ✅ Perfect - old tools removed, new tools working

---

### METRICS TOOLS (3 consolidated + 17 individual = 20 total ⚠️)

**TT009-2 Consolidated Tools** (NEW - Expected):
1. `metrics_collect` → Handler: handlers/metrics/metricsCollect.ts:29
2. `metrics_analyze` → Handler: handlers/metrics/metricsAnalyze.ts:26
3. `metrics_control` → Handler: handlers/metrics/metricsControl.ts:30

**Old Individual Tools** (STILL WIRED - Should be deprecated):
4. `metrics_collect_project` → Handler: handlers/developmentMetrics.ts (DevelopmentMetricsHandler.handleTool)
5. `metrics_get_dashboard` → Handler: handlers/developmentMetrics.ts
6. `metrics_get_core_metrics` → Handler: handlers/developmentMetrics.ts
7. `metrics_get_pattern_intelligence` → Handler: handlers/developmentMetrics.ts
8. `metrics_get_productivity_health` → Handler: handlers/developmentMetrics.ts
9. `metrics_get_alerts` → Handler: handlers/developmentMetrics.ts
10. `metrics_acknowledge_alert` → Handler: handlers/developmentMetrics.ts
11. `metrics_resolve_alert` → Handler: handlers/developmentMetrics.ts
12. `metrics_get_trends` → Handler: handlers/developmentMetrics.ts
13. `metrics_get_performance` → Handler: handlers/developmentMetrics.ts
14. `metrics_start_collection` → Handler: handlers/developmentMetrics.ts
15. `metrics_stop_collection` → Handler: handlers/developmentMetrics.ts

**Metrics Aggregation Tools** (TC018 - STILL WIRED):
16. `metrics_aggregate_projects` → Handler: handlers/metricsAggregation.ts (MetricsAggregationHandler.handleTool)
17. `metrics_aggregate_timeline` → Handler: handlers/metricsAggregation.ts
18. `metrics_calculate_correlations` → Handler: handlers/metricsAggregation.ts
19. `metrics_get_executive_summary` → Handler: handlers/metricsAggregation.ts
20. `metrics_export_data` → Handler: handlers/metricsAggregation.ts

**Status**: ⚠️ **DUPLICATION ISSUE** - Both old (17 tools) and new (3 tools) are wired
**Comment in server.ts:1095**: "Development Metrics Tools (to be consolidated in Phase 2)"

---

### PATTERN TOOLS (2 consolidated + 18 individual = 20 total ⚠️)

**TT009-3 Consolidated Tools** (NEW - Expected):
1. `pattern_analyze` → Handler: handlers/patterns/patternAnalyze.ts:41
2. `pattern_insights` → Handler: handlers/patterns/patternInsights.ts:26

**Pattern Detection Tools** (TC013 - STILL WIRED):
3. `pattern_detection_start` → Handler: handlers/patternDetection.ts (patternDetectionHandlers.pattern_detection_start)
4. `pattern_detection_stop` → Handler: handlers/patternDetection.ts
5. `pattern_detect_commits` → Handler: handlers/patternDetection.ts
6. `pattern_get_session_insights` → Handler: handlers/patternDetection.ts
7. `pattern_analyze_project` → Handler: handlers/patternDetection.ts
8. `pattern_get_alerts` → Handler: handlers/patternDetection.ts (duplicate with pattern_analysis)
9. `pattern_detection_status` → Handler: handlers/patternDetection.ts
10. `pattern_track_git_activity` → Handler: handlers/patternDetection.ts

**Pattern Analysis Tools** (TC017 - STILL WIRED):
11. `pattern_get_discovered` → Handler: handlers/patternAnalysis.ts (patternAnalysisHandlers.pattern_get_discovered)
12. `pattern_get_trends` → Handler: handlers/patternAnalysis.ts
13. `pattern_get_correlations` → Handler: handlers/patternAnalysis.ts
14. `pattern_get_insights` → Handler: handlers/patternAnalysis.ts
15. `pattern_get_alerts` → Handler: handlers/patternAnalysis.ts (duplicate with pattern_detection)
16. `pattern_get_anomalies` → Handler: handlers/patternAnalysis.ts
17. `pattern_get_recommendations` → Handler: handlers/patternAnalysis.ts
18. `pattern_analyze_session` → Handler: handlers/patternAnalysis.ts
19. `pattern_analyze_commit` → Handler: handlers/patternAnalysis.ts
20. `pattern_get_performance` → Handler: handlers/patternAnalysis.ts

**Status**: ⚠️ **DUPLICATION ISSUE** - Both old (18 tools) and new (2 tools) are wired

---

## SUMMARY BY CATEGORY

| Category | Expected | Wired | Status | Notes |
|----------|----------|-------|--------|-------|
| System Health | 2 | 5 | ⚠️ | +3 navigation tools (help, explain, examples) |
| Context Management | 4 | 4 | ✅ | Perfect |
| Project Management | 6 | 6 | ✅ | Perfect |
| Session Management | 5 | 5 | ✅ | Perfect |
| Naming Registry | 4 | 4 | ✅ | Perfect |
| Technical Decisions | 4 | 4 | ✅ | Perfect |
| Task Management | 4 | 6 | ⚠️ | +2 tools (bulk_update, progress_summary) |
| Code Analysis | 5 | 5 | ✅ | Perfect |
| Smart Search & AI | 2 | 2 | ✅ | Perfect |
| Git Integration | 3 | 3 | ✅ | Perfect |
| **Complexity** | **3** | **3** | ✅ | **Clean consolidation - old tools removed** |
| **Metrics** | **3** | **20** | ❌ | **+17 deprecated tools still wired** |
| **Pattern** | **2** | **20** | ❌ | **+18 deprecated tools still wired** |
| **TOTAL** | **47** | **86** | ❌ | **+39 deprecated tools** |

---

## DETAILED ANALYSIS

### What Went Right

1. **Complexity Consolidation (TT009-1)** ✅
   - Successfully consolidated 16 tools → 3 tools
   - Old tools REMOVED from server.ts
   - Comment documents the completion
   - Clean implementation with dedicated handler directory

2. **Core Tools** ✅
   - Context, Project, Session, Naming, Decisions all working perfectly
   - Code Analysis and Git Integration stable
   - Smart Search operational

### What Went Wrong

1. **Metrics Consolidation (TT009-2)** ⚠️
   - New consolidated tools created and wired ✅
   - Old individual tools NOT removed ❌
   - Both old and new tools functional simultaneously
   - Comment says "to be consolidated in Phase 2" but Phase 2 is supposedly complete

2. **Pattern Consolidation (TT009-3)** ⚠️
   - New consolidated tools created and wired ✅
   - Old TC013 (Pattern Detection) tools NOT removed ❌
   - Old TC017 (Pattern Analysis) tools NOT removed ❌
   - Both old and new tools functional simultaneously

3. **Task Management** ⚠️
   - Two additional tools (bulk_update, progress_summary) not in original 47 count
   - Unclear if these are intentional additions or scope creep

4. **Navigation Tools** ⚠️
   - Three tools (help, explain, examples) not counted in original 47
   - These are essential tools, should they be in System Health count?

---

## ROOT CAUSE ANALYSIS

### Why 86 Tools Instead of 47?

**TT009 Consolidation was INCOMPLETE**:

1. **Phase 1 (Complexity)**: ✅ COMPLETE
   - Created new consolidated handlers
   - Removed old tool registrations from switch statement
   - Removed old handler imports
   - Added completion comment

2. **Phase 2 (Metrics)**: ⚠️ INCOMPLETE
   - Created new consolidated handlers ✅
   - Added new tool registrations ✅
   - Did NOT remove old tool registrations ❌
   - Did NOT remove old handler imports ❌
   - Comment says "to be consolidated" (future tense)

3. **Phase 3 (Pattern)**: ⚠️ INCOMPLETE
   - Created new consolidated handlers ✅
   - Added new tool registrations ✅
   - Did NOT remove old tool registrations ❌
   - Did NOT remove old handler imports ❌
   - No completion comment

### Evidence from server.ts

**Line 1095-1108** (Metrics):
```typescript
// TT009-2: Phase 2 Metrics Consolidation Tools
case 'metrics_collect':
  return await handleMetricsCollect(validatedArgs);
case 'metrics_analyze':
  return await handleMetricsAnalyze(validatedArgs);
case 'metrics_control':
  return await handleMetricsControl(validatedArgs);

// Development Metrics Tools (to be consolidated in Phase 2)
case 'metrics_collect_project':
case 'metrics_get_dashboard':
// ... 10 more old tools still wired
```

**Line 1089-1094** (Pattern):
```typescript
// TT009-3: Phase 3 Pattern Consolidation Tools
case 'pattern_analyze':
  return await handlePatternAnalyze(validatedArgs);
case 'pattern_insights':
  return await handlePatternInsights(validatedArgs);
```

**Line 1026-1080** (Old pattern tools still wired):
```typescript
// TC013: Pattern Detection Tools
case 'pattern_detection_start':
  return await patternDetectionHandlers.pattern_detection_start(validatedArgs);
// ... 7 more TC013 tools

// TC017: Pattern Analysis Tools - Comprehensive pattern intelligence API
case 'pattern_get_discovered':
  return await patternAnalysisHandlers.pattern_get_discovered(validatedArgs);
// ... 9 more TC017 tools
```

---

## RECOMMENDED ACTIONS

### Immediate Actions (Complete TT009 Phases 2 & 3)

#### 1. Complete Metrics Consolidation (TT009-2)

**Remove from server.ts (lines 1096-1108)**:
- `metrics_collect_project`
- `metrics_get_dashboard`
- `metrics_get_core_metrics`
- `metrics_get_pattern_intelligence`
- `metrics_get_productivity_health`
- `metrics_get_alerts`
- `metrics_acknowledge_alert`
- `metrics_resolve_alert`
- `metrics_get_trends`
- `metrics_get_performance`
- `metrics_start_collection`
- `metrics_stop_collection`

**Remove from server.ts (lines 1111-1116)**:
- `metrics_aggregate_projects`
- `metrics_aggregate_timeline`
- `metrics_calculate_correlations`
- `metrics_get_executive_summary`
- `metrics_export_data`

**Remove from server.ts imports (lines 62, 92)**:
```typescript
import { DevelopmentMetricsHandler } from './handlers/developmentMetrics.js';
import { MetricsAggregationHandler } from './handlers/metricsAggregation.js';
```

**Remove from toolDefinitions.ts**:
- Remove all 17 deprecated metrics tool definitions

#### 2. Complete Pattern Consolidation (TT009-3)

**Remove from server.ts (lines 1026-1048)** - TC013 Pattern Detection:
- `pattern_detection_start`
- `pattern_detection_stop`
- `pattern_detect_commits`
- `pattern_get_session_insights`
- `pattern_analyze_project`
- `pattern_get_alerts` (TC013 version)
- `pattern_detection_status`
- `pattern_track_git_activity`

**Remove from server.ts (lines 1051-1079)** - TC017 Pattern Analysis:
- `pattern_get_discovered`
- `pattern_get_trends`
- `pattern_get_correlations`
- `pattern_get_insights`
- `pattern_get_alerts` (TC017 version)
- `pattern_get_anomalies`
- `pattern_get_recommendations`
- `pattern_analyze_session`
- `pattern_analyze_commit`
- `pattern_get_performance`

**Remove from server.ts imports (lines 59-60)**:
```typescript
import { patternDetectionHandlers } from './handlers/patternDetection.js';
import { patternAnalysisHandlers } from './handlers/patternAnalysis.js';
```

**Remove from toolDefinitions.ts**:
- Remove all 18 deprecated pattern tool definitions

#### 3. Update CLAUDE.md

Current CLAUDE.md says "47 MCP Tools - 100% Operational" but doesn't clarify:
- Should navigation tools (help, explain, examples) be counted?
- Should task bulk operations be counted?

**Suggested new count**:
- Base: 39 tools (confirmed categories)
- Navigation: +3 (help, explain, examples)
- Task bulk ops: +2 (bulk_update, progress_summary)
- Complexity: +3 (consolidated)
- Metrics: +3 (consolidated)
- Pattern: +2 (consolidated)
- **Total: 52 tools**

Or if navigation is separate:
- **Core AIDIS: 49 tools**
- **Navigation: 3 tools**

### Secondary Actions

1. **Document Tool Consolidation Pattern**
   - Create guide showing how TT009-1 was done correctly
   - Use as template for future consolidations

2. **Update Tool Categories in CLAUDE.md**
   - Navigation: 3 tools (help, explain, examples)
   - Task Management: 6 tools (include bulk_update, progress_summary)
   - Clarify final count

3. **Add Deprecation Warnings**
   - If keeping old tools temporarily, add deprecation warnings to tool definitions
   - Log warnings when old tools are used

4. **Testing**
   - Test that new consolidated tools have feature parity
   - Verify no functionality lost in consolidation
   - Test edge cases

---

## TECHNICAL DEBT

### Files to Archive/Remove (After consolidation complete)

**Handler Files**:
- `/home/ridgetop/aidis/mcp-server/src/handlers/developmentMetrics.ts`
- `/home/ridgetop/aidis/mcp-server/src/handlers/metricsAggregation.ts`
- `/home/ridgetop/aidis/mcp-server/src/handlers/patternDetection.ts`
- `/home/ridgetop/aidis/mcp-server/src/handlers/patternAnalysis.ts`

**Service Files** (check dependencies first):
- May need to keep services but remove MCP tool wiring
- Pattern detector and metrics collector might be used internally

### Migration Path

1. **Week 1**: Remove deprecated tool registrations from server.ts
2. **Week 2**: Remove deprecated tool definitions from toolDefinitions.ts
3. **Week 3**: Test consolidated tools for feature parity
4. **Week 4**: Archive old handler files (don't delete yet)
5. **Week 5**: Update documentation and CLAUDE.md
6. **Week 6**: Monitor for issues, final cleanup

---

## CONCLUSIONS

### Current State
- **86 tools are wired and functional**
- **47 tools is the target after full consolidation**
- **39 tools need to be deprecated and removed**

### Why This Happened
1. TT009 Phase 1 (Complexity) was completed correctly
2. TT009 Phases 2 & 3 (Metrics & Pattern) created NEW tools but didn't remove OLD tools
3. Both old and new tools are currently operational
4. No breaking changes were made (safe but cluttered)

### Next Steps
1. **Complete TT009-2**: Remove 17 deprecated metrics tools
2. **Complete TT009-3**: Remove 18 deprecated pattern tools
3. **Update CLAUDE.md**: Clarify final tool count (47 or 52?)
4. **Test consolidated tools**: Ensure feature parity
5. **Archive old handlers**: Keep for reference, remove from production

### Success Criteria
- ✅ Only consolidated tools wired in server.ts
- ✅ Old handler imports removed
- ✅ Tool definitions match wired tools (47-52 total)
- ✅ All tests passing
- ✅ CLAUDE.md updated with accurate count
- ✅ No functionality lost

---

## APPENDIX: COMPLETE TOOL LIST

### Currently Wired (86 tools)

**System & Navigation (5)**:
1. aidis_ping
2. aidis_status
3. aidis_help
4. aidis_explain
5. aidis_examples

**Context (4)**:
6. context_store
7. context_search
8. context_get_recent
9. context_stats

**Project (6)**:
10. project_list
11. project_create
12. project_switch
13. project_current
14. project_info
15. project_insights

**Session (5)**:
16. session_assign
17. session_status
18. session_new
19. session_update
20. session_details

**Naming (4)**:
21. naming_register
22. naming_check
23. naming_suggest
24. naming_stats

**Decisions (4)**:
25. decision_record
26. decision_search
27. decision_update
28. decision_stats

**Tasks (6)**:
29. task_create
30. task_list
31. task_update
32. task_details
33. task_bulk_update
34. task_progress_summary

**Code Analysis (5)**:
35. code_analyze
36. code_components
37. code_dependencies
38. code_impact
39. code_stats

**Smart Search (2)**:
40. smart_search
41. get_recommendations

**Git (3)**:
42. git_session_commits
43. git_commit_sessions
44. git_correlate_session

**Complexity - Consolidated ✅ (3)**:
45. complexity_analyze
46. complexity_insights
47. complexity_manage

**Metrics - Consolidated ⚠️ (3 new + 17 old = 20)**:
48. metrics_collect (NEW)
49. metrics_analyze (NEW)
50. metrics_control (NEW)
51. metrics_collect_project (DEPRECATED)
52. metrics_get_dashboard (DEPRECATED)
53. metrics_get_core_metrics (DEPRECATED)
54. metrics_get_pattern_intelligence (DEPRECATED)
55. metrics_get_productivity_health (DEPRECATED)
56. metrics_get_alerts (DEPRECATED)
57. metrics_acknowledge_alert (DEPRECATED)
58. metrics_resolve_alert (DEPRECATED)
59. metrics_get_trends (DEPRECATED)
60. metrics_get_performance (DEPRECATED)
61. metrics_start_collection (DEPRECATED)
62. metrics_stop_collection (DEPRECATED)
63. metrics_aggregate_projects (DEPRECATED)
64. metrics_aggregate_timeline (DEPRECATED)
65. metrics_calculate_correlations (DEPRECATED)
66. metrics_get_executive_summary (DEPRECATED)
67. metrics_export_data (DEPRECATED)

**Pattern - Consolidated ⚠️ (2 new + 18 old = 20)**:
68. pattern_analyze (NEW)
69. pattern_insights (NEW)
70. pattern_detection_start (DEPRECATED)
71. pattern_detection_stop (DEPRECATED)
72. pattern_detect_commits (DEPRECATED)
73. pattern_get_session_insights (DEPRECATED)
74. pattern_analyze_project (DEPRECATED)
75. pattern_get_alerts (DEPRECATED - TC013)
76. pattern_detection_status (DEPRECATED)
77. pattern_track_git_activity (DEPRECATED)
78. pattern_get_discovered (DEPRECATED)
79. pattern_get_trends (DEPRECATED)
80. pattern_get_correlations (DEPRECATED)
81. pattern_get_insights (DEPRECATED)
82. pattern_get_alerts (DEPRECATED - TC017)
83. pattern_get_anomalies (DEPRECATED)
84. pattern_get_recommendations (DEPRECATED)
85. pattern_analyze_session (DEPRECATED)
86. pattern_analyze_commit (DEPRECATED)
87. pattern_get_performance (DEPRECATED)

**Total**: 86 tools (87 including duplicate pattern_get_alerts)

### Target After Cleanup (47-52 tools)

Tools 1-47 above (removing tools 51-87 marked DEPRECATED)

Final count depends on:
- Are navigation tools (help, explain, examples) counted separately?
- Are task bulk operations (bulk_update, progress_summary) official?

**Recommended**: Document as **49 core tools + 3 navigation tools = 52 total**

---

**Report Generated**: 2025-10-01
**Status**: Investigation Complete
**Next Action**: Review with partner and decide on cleanup approach
