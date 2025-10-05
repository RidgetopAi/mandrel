# AIDIS Tool Quick Reference Card

## Current State (2025-10-01)

```
┌─────────────────────────────────────────────────────┐
│  AIDIS TOOLS: ACTUAL vs EXPECTED                    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Currently Wired:        86 tools                   │
│  Expected (CLAUDE.md):   47 tools                   │
│  Target after cleanup:   52 tools                   │
│  Gap to close:           35 deprecated tools        │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Tool Categories (Current State)

### ✅ Working Correctly (44 core tools)

| Category | Count | Tools |
|----------|-------|-------|
| **System/Nav** | 5 | ping, status, help, explain, examples |
| **Context** | 4 | store, search, get_recent, stats |
| **Project** | 6 | list, create, switch, current, info, insights |
| **Session** | 5 | assign, status, new, update, details |
| **Naming** | 4 | register, check, suggest, stats |
| **Decisions** | 4 | record, search, update, stats |
| **Tasks** | 6 | create, list, update, details, bulk_update, progress_summary |
| **Code** | 5 | analyze, components, dependencies, impact, stats |
| **Smart Search** | 2 | smart_search, get_recommendations |
| **Git** | 3 | session_commits, commit_sessions, correlate_session |

---

### ✅ Consolidated Correctly (3 complexity tools)

**Complexity (TT009-1 COMPLETE)**:
- `complexity_analyze` - File/commit analysis, detailed metrics
- `complexity_insights` - Dashboard, hotspots, trends, debt, opportunities
- `complexity_manage` - Tracking, alerts, thresholds, performance

**Status**: ✅ Old tools removed, new tools working, clean implementation

---

### ⚠️ Partially Consolidated (5 new + 35 old = 40 tools)

**Metrics (TT009-2 INCOMPLETE)**:

NEW (3 tools) ✅:
- `metrics_collect` - Project collection, start/stop collection
- `metrics_analyze` - Dashboard, core, patterns, trends, correlations
- `metrics_control` - Alerts, performance, aggregation, export

OLD (17 tools) ❌ SHOULD BE REMOVED:
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
- `metrics_aggregate_projects`
- `metrics_aggregate_timeline`
- `metrics_calculate_correlations`
- `metrics_get_executive_summary`
- `metrics_export_data`

---

**Pattern (TT009-3 INCOMPLETE)**:

NEW (2 tools) ✅:
- `pattern_analyze` - Start/stop, commit/project/session analysis, tracking
- `pattern_insights` - Discovered patterns, trends, correlations, alerts, recommendations

OLD (18 tools) ❌ SHOULD BE REMOVED:
- `pattern_detection_start`
- `pattern_detection_stop`
- `pattern_detect_commits`
- `pattern_get_session_insights`
- `pattern_analyze_project`
- `pattern_get_alerts` (TC013)
- `pattern_detection_status`
- `pattern_track_git_activity`
- `pattern_get_discovered`
- `pattern_get_trends`
- `pattern_get_correlations`
- `pattern_get_insights`
- `pattern_get_alerts` (TC017)
- `pattern_get_anomalies`
- `pattern_get_recommendations`
- `pattern_analyze_session`
- `pattern_analyze_commit`
- `pattern_get_performance`

---

## By the Numbers

```
CATEGORY BREAKDOWN
════════════════════════════════════════════════

Core AIDIS Tools                    44 tools ✅
├─ System & Navigation               5 tools
├─ Context Management                4 tools
├─ Project Management                6 tools
├─ Session Management                5 tools
├─ Naming Registry                   4 tools
├─ Technical Decisions               4 tools
├─ Task Management                   6 tools
├─ Code Analysis                     5 tools
├─ Smart Search & AI                 2 tools
└─ Git Integration                   3 tools

Consolidated Tools (Complete)        3 tools ✅
└─ Complexity (TT009-1)              3 tools

Consolidated Tools (New)             5 tools ✅
├─ Metrics (TT009-2)                 3 tools
└─ Pattern (TT009-3)                 2 tools

Deprecated Tools (Old)              35 tools ❌
├─ Metrics (should be removed)      17 tools
└─ Pattern (should be removed)      18 tools

────────────────────────────────────────────────
CURRENT TOTAL:                      86 tools
TARGET TOTAL:                       52 tools
CLEANUP NEEDED:                    -35 tools
════════════════════════════════════════════════
```

---

## Quick Lookup: Is This Tool Active?

### How to Check if a Tool is Active

**Rule of Thumb**:
1. If it starts with one of these prefixes, check below:
   - `metrics_*` → Might be deprecated
   - `pattern_*` → Might be deprecated
   - `complexity_*` → All good (TT009-1 complete)

2. Everything else is active ✅

### Complexity Tools: ✅ ALL ACTIVE

| Tool | Status | Use |
|------|--------|-----|
| complexity_analyze | ✅ Active | Analysis operations |
| complexity_insights | ✅ Active | Insights operations |
| complexity_manage | ✅ Active | Management operations |

### Metrics Tools: Check Carefully

**USE THESE** (New TT009-2) ✅:
- `metrics_collect`
- `metrics_analyze`
- `metrics_control`

**AVOID THESE** (Deprecated) ❌:
- Anything else starting with `metrics_*`
- All 17 old metrics tools still work BUT should migrate to new ones

### Pattern Tools: Check Carefully

**USE THESE** (New TT009-3) ✅:
- `pattern_analyze`
- `pattern_insights`

**AVOID THESE** (Deprecated) ❌:
- Anything else starting with `pattern_*`
- All 18 old pattern tools still work BUT should migrate to new ones

---

## Migration Guide

### If You're Using Old Metrics Tools

| Old Tool | New Tool | Operation |
|----------|----------|-----------|
| metrics_collect_project | metrics_collect | operation: "project" |
| metrics_get_dashboard | metrics_analyze | operation: "dashboard" |
| metrics_get_core_metrics | metrics_analyze | operation: "core" |
| metrics_get_pattern_intelligence | metrics_analyze | operation: "patterns" |
| metrics_get_productivity_health | metrics_analyze | operation: "productivity" |
| metrics_get_trends | metrics_analyze | operation: "trends" |
| metrics_start_collection | metrics_collect | operation: "start" |
| metrics_stop_collection | metrics_collect | operation: "stop" |
| metrics_get_alerts | metrics_control | operation: "get_alerts" |
| metrics_acknowledge_alert | metrics_control | operation: "ack_alert" |
| metrics_resolve_alert | metrics_control | operation: "resolve_alert" |
| metrics_get_performance | metrics_control | operation: "performance" |
| metrics_aggregate_projects | metrics_control | operation: "aggregate" |
| metrics_aggregate_timeline | metrics_analyze | operation: "aggregate" |
| metrics_calculate_correlations | metrics_analyze | operation: "correlations" |
| metrics_get_executive_summary | metrics_control | operation: "executive" |
| metrics_export_data | metrics_control | operation: "export" |

### If You're Using Old Pattern Tools

| Old Tool | New Tool | Operation |
|----------|----------|-----------|
| pattern_detection_start | pattern_analyze | operation: "start" |
| pattern_detection_stop | pattern_analyze | operation: "stop" |
| pattern_detect_commits | pattern_analyze | operation: "commits" |
| pattern_analyze_project | pattern_analyze | operation: "project" |
| pattern_analyze_session | pattern_analyze | operation: "session" |
| pattern_analyze_commit | pattern_analyze | operation: "commit" |
| pattern_detection_status | pattern_analyze | operation: "status" |
| pattern_track_git_activity | pattern_analyze | operation: "track" |
| pattern_get_discovered | pattern_analyze | operation: "discovered" |
| pattern_get_performance | pattern_analyze | operation: "performance" |
| pattern_get_session_insights | pattern_insights | operation: "session" |
| pattern_get_trends | pattern_insights | operation: "trends" |
| pattern_get_correlations | pattern_insights | operation: "correlations" |
| pattern_get_insights | pattern_insights | operation: "insights" |
| pattern_get_alerts | pattern_insights | operation: "alerts" |
| pattern_get_anomalies | pattern_insights | operation: "anomalies" |
| pattern_get_recommendations | pattern_insights | operation: "recommendations" |

---

## Cleanup Status

### TT009 Consolidation Phases

```
Phase 1: Complexity (16 → 3)    ████████████████████ 100% ✅
Phase 2: Metrics (17 → 3)       ██████████░░░░░░░░░░  50% ⚠️
Phase 3: Pattern (17 → 2)       ██████████░░░░░░░░░░  50% ⚠️

Overall Progress:               ██████████████░░░░░░  70%
```

**What's Done**:
- ✅ New consolidated tools created
- ✅ New tools wired and working
- ✅ Complexity consolidation complete

**What's Remaining**:
- ❌ Remove old metrics tool registrations
- ❌ Remove old pattern tool registrations
- ❌ Update toolDefinitions.ts
- ❌ Update CLAUDE.md
- ❌ Archive deprecated handler files

---

## Action Items

### For Developers

**If you're using AIDIS tools**:
1. ✅ Core tools (context, project, session, etc.) - No changes needed
2. ✅ Complexity tools - No changes needed (already consolidated)
3. ⚠️ Metrics tools - Migrate to new consolidated tools
4. ⚠️ Pattern tools - Migrate to new consolidated tools

**If you're maintaining AIDIS**:
1. ❌ Complete TT009-2 (remove 17 old metrics tools)
2. ❌ Complete TT009-3 (remove 18 old pattern tools)
3. ❌ Update CLAUDE.md with correct count (52 tools)
4. ❌ Test consolidated tools for feature parity
5. ❌ Archive deprecated handler files

### For Documentation

**Update these files**:
- `/CLAUDE.md` - Change "47 tools" to "52 tools" (or clarify)
- `/docs/AIDIS_MCP_SERVER_REFERENCE_GUIDE.md` - Update tool listings
- `/docs/TODO/todo.md` - Add TT009 completion tasks

---

## Quick Decision Tree

```
Are you using AIDIS tools?
│
├─ Yes, core tools (context, project, session, etc.)
│  └─ ✅ Keep using them, no changes needed
│
├─ Yes, complexity tools
│  └─ ✅ Already consolidated, keep using them
│
├─ Yes, metrics tools
│  ├─ Using metrics_collect/analyze/control?
│  │  └─ ✅ Good! Keep using them
│  └─ Using metrics_get_dashboard, etc?
│     └─ ⚠️ Still works, but migrate to new tools
│
├─ Yes, pattern tools
│  ├─ Using pattern_analyze/insights?
│  │  └─ ✅ Good! Keep using them
│  └─ Using pattern_detection_start, etc?
│     └─ ⚠️ Still works, but migrate to new tools
│
└─ Maintaining AIDIS?
   └─ ❌ Complete TT009-2 and TT009-3 cleanup
```

---

## FAQ

**Q: Why does CLAUDE.md say 47 tools but there are 86?**
A: TT009 consolidation is incomplete. Phases 2 & 3 created new tools but didn't remove old ones.

**Q: Are the old tools broken?**
A: No! Both old and new tools work. But we have duplication.

**Q: Should I use old or new tools?**
A: Use new consolidated tools (metrics_collect/analyze/control, pattern_analyze/insights).

**Q: When will cleanup happen?**
A: Waiting for decision from partner. See investigation report for options.

**Q: What if I need a specific old tool feature?**
A: New consolidated tools should have feature parity. Check with `operation` parameter.

**Q: Is this a breaking change?**
A: If we remove old tools, yes. That's why we need to decide on approach.

**Q: How was complexity consolidation different?**
A: TT009-1 removed old tools when adding new ones. TT009-2 & 3 didn't remove old tools.

**Q: What's the recommended tool count?**
A: 52 tools total (44 core + 8 consolidated), or document as 49 + 3 navigation.

---

## File Locations

**Investigation Reports**:
- Summary: `/home/ridgetop/aidis/AIDIS_TOOL_INVESTIGATION_SUMMARY.md`
- Full Report: `/home/ridgetop/aidis/AIDIS_WIRED_TOOLS_INVESTIGATION_REPORT.md`
- Architecture: `/home/ridgetop/aidis/AIDIS_TOOL_ARCHITECTURE_DIAGRAM.md`
- Quick Ref: `/home/ridgetop/aidis/AIDIS_TOOL_QUICK_REFERENCE.md` (this file)

**Source Code**:
- Tool Registration: `/home/ridgetop/aidis/mcp-server/src/server.ts` (lines 890-1134)
- Tool Definitions: `/home/ridgetop/aidis/mcp-server/src/config/toolDefinitions.ts`
- Complexity Handlers: `/home/ridgetop/aidis/mcp-server/src/handlers/complexity/`
- Metrics Handlers: `/home/ridgetop/aidis/mcp-server/src/handlers/metrics/`
- Pattern Handlers: `/home/ridgetop/aidis/mcp-server/src/handlers/patterns/`

**Documentation**:
- Project Guide: `/home/ridgetop/aidis/CLAUDE.md`
- Reference: `/home/ridgetop/aidis/docs/AIDIS_MCP_SERVER_REFERENCE_GUIDE.md`

---

**Last Updated**: 2025-10-01
**Version**: 1.0
**Status**: Investigation Complete - Awaiting Cleanup Decision
