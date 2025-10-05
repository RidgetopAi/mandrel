# TT009 Tool Consolidation - Executive Summary

**Date**: 2025-10-01
**Status**: Plan Ready for Approval
**Timeline**: 5.5 hours (can be split over 2 days)

---

## THE PROBLEM

**Current State**: AIDIS has **86 tools wired**, but should only have **52 tools**

**Root Cause**: TT009 Phases 2 & 3 created new consolidated tools but **forgot to remove old deprecated tools**

**Result**: Both old AND new tools exist simultaneously, creating:
- ❌ Tool duplication and confusion
- ❌ Incorrect documentation (CLAUDE.md says 47, actually 86)
- ❌ Technical debt (4 deprecated handler files still active)
- ❌ Incomplete consolidation project

---

## THE SOLUTION

**Remove 34 deprecated tools (35 case statements) in 3 systematic phases**:

1. **Phase B**: Remove 17 deprecated metrics tools
2. **Phase C**: Remove 17 deprecated pattern tools (18 case statements - one duplicate)
3. **Phases D-G**: Archive handlers, update docs, validate thoroughly

**Follow TT009-1 Success Pattern**:
- TT009-1 (Complexity) was done correctly: created new tools AND removed old tools ✅
- TT009-2 & TT009-3 were incomplete: created new tools but kept old tools ❌

---

## WHAT GETS REMOVED

### Metrics Tools (17 tools, lines 1095-1116 in server.ts)

**Development Metrics (12)**:
- metrics_collect_project
- metrics_get_dashboard
- metrics_get_core_metrics
- metrics_get_pattern_intelligence
- metrics_get_productivity_health
- metrics_get_alerts
- metrics_acknowledge_alert
- metrics_resolve_alert
- metrics_get_trends
- metrics_get_performance
- metrics_start_collection
- metrics_stop_collection

**Metrics Aggregation (5)**:
- metrics_aggregate_projects
- metrics_aggregate_timeline
- metrics_calculate_correlations
- metrics_get_executive_summary
- metrics_export_data

### Pattern Tools (17 tools, lines 1025-1079 in server.ts)

**Pattern Detection TC013 (8)**:
- pattern_detection_start
- pattern_detection_stop
- pattern_detect_commits
- pattern_get_session_insights
- pattern_analyze_project
- pattern_get_alerts (TC013 version)
- pattern_detection_status
- pattern_track_git_activity

**Pattern Analysis TC017 (10, with duplicate)**:
- pattern_get_discovered
- pattern_get_trends
- pattern_get_correlations
- pattern_get_insights
- pattern_get_alerts (TC017 version - DUPLICATE)
- pattern_get_anomalies
- pattern_get_recommendations
- pattern_analyze_session
- pattern_analyze_commit
- pattern_get_performance

---

## WHAT STAYS (Already Working ✅)

### Consolidated Replacement Tools

**Complexity (TT009-1)** - Already complete:
- complexity_analyze
- complexity_insights
- complexity_manage

**Metrics (TT009-2)** - Already created:
- metrics_collect → replaces all 17 metrics tools
- metrics_analyze
- metrics_control

**Pattern (TT009-3)** - Already created:
- pattern_analyze → replaces all 17 pattern tools
- pattern_insights

**Plus 44 core AIDIS tools** (Context, Project, Session, etc.)

---

## FILES TO MODIFY

1. **`/mcp-server/src/server.ts`**
   - Remove 35 case statements (77 lines total with comments)
   - Remove 4 handler imports
   - Add completion comments

2. **`/mcp-server/src/config/toolDefinitions.ts`**
   - Remove 34 tool definitions
   - Tool count: 86 → 52

3. **`/CLAUDE.md`**
   - Update tool count: 47 → 52
   - Mark TT009 Phases 2 & 3 as complete

4. **Archive (not delete)**
   - Move 4 deprecated handler files to `_deprecated_tt009/`

---

## IMPLEMENTATION PHASES

| Phase | Time | What Happens | Validation |
|-------|------|--------------|------------|
| **A: Prep** | 30 min | Git branch, backups, verify current state | Tool count = 86 |
| **B: Metrics** | 1 hour | Remove 17 metrics tools, test | Tool count = 69 |
| **C: Pattern** | 1 hour | Remove 17 pattern tools, test | Tool count = 52 |
| **D: Archive** | 30 min | Move deprecated handlers | No broken imports |
| **E: Docs** | 30 min | Update CLAUDE.md, create migration guide | Docs accurate |
| **F: Test** | 1 hour | Comprehensive validation | All 52 tools work |
| **G: Commit** | 30 min | Git commit, final docs | TT009 complete |
| **Total** | **5.5 hours** | | **52 tools ✅** |

---

## VALIDATION CRITERIA

### Code ✅
- [ ] TypeScript compiles without errors
- [ ] No deprecated handler imports
- [ ] Completion comments added for Phases 2 & 3
- [ ] Follows TT009-1 pattern exactly

### Tool Count ✅
- [ ] HTTP endpoint returns exactly 52 tools
- [ ] toolDefinitions.ts has exactly 52 tools
- [ ] Matches AIDIS-tool-list.md exactly

### Functionality ✅
- [ ] All 52 tools callable and working
- [ ] Deprecated 34 tools return 404
- [ ] Consolidated tools have feature parity
- [ ] No functionality lost

### Documentation ✅
- [ ] CLAUDE.md shows 52 tools
- [ ] TT009 Phases 1, 2, 3 all marked complete
- [ ] Migration guide created

---

## RISK MITIGATION

### Risk 1: Breaking Functionality
**Mitigation**: New tools already exist and tested ✅

### Risk 2: Missing Dependencies
**Mitigation**: Archive handlers (not delete), TypeScript compilation catches issues ✅

### Risk 3: Users Calling Old Tools
**Mitigation**: Migration guide, clear error messages ✅

### Risk 4: Build/Runtime Errors
**Mitigation**: Test after each phase, git branch for rollback ✅

---

## ROLLBACK OPTIONS

**Option 1 - Full Rollback**:
```bash
git checkout main
```

**Option 2 - Restore from Backup**:
```bash
cp server.ts.backup-tt009 server.ts
cp toolDefinitions.ts.backup-tt009 toolDefinitions.ts
```

**Option 3 - Restore Handlers**:
```bash
cp _deprecated_tt009/*.ts handlers/
```

---

## SUCCESS METRICS

**Before**: 86 tools (47 expected, 39 deprecated extras)
**After**: 52 tools (44 core + 8 consolidated)

**Completion Checklist**:
- ✅ 52 tools wired and accessible
- ✅ 34 deprecated tools removed and inaccessible
- ✅ TypeScript compiles
- ✅ Server starts
- ✅ All tests pass
- ✅ Documentation accurate
- ✅ TT009 Phases 1, 2, 3 complete

---

## TIMELINE OPTIONS

### Option A: Single Day (5.5 hours)
- Morning: Phases A-C (3 hours)
- Afternoon: Phases D-G (2.5 hours)

### Option B: Two Days (Recommended)
- Day 1 Morning: Phases A-C (3 hours)
- Day 1 Afternoon: Phases D-E (1 hour)
- Day 2 Morning: Phases F-G (1.5 hours)

### Option C: Conservative (Three Days)
- Day 1: Phase B (Metrics) - 1.5 hours
- Day 2: Phase C (Pattern) - 1.5 hours
- Day 3: Phases D-G (Cleanup & docs) - 2.5 hours

---

## MIGRATION GUIDE SUMMARY

**Old Metrics Tools → metrics_collect/analyze/control**:
```typescript
// OLD
await aidis.call('metrics_get_dashboard', {});

// NEW
await aidis.call('metrics_analyze', { operation: 'dashboard' });
```

**Old Pattern Tools → pattern_analyze/insights**:
```typescript
// OLD
await aidis.call('pattern_detection_start', {});

// NEW
await aidis.call('pattern_analyze', { operation: 'start' });
```

---

## WHAT MAKES THIS PLAN DIFFERENT?

### Previous Attempts Failed Because:
- ❌ Created new tools but didn't remove old ones
- ❌ No clear removal plan
- ❌ No systematic validation

### This Plan Succeeds Because:
- ✅ Exact list of 34 tools to remove (verified)
- ✅ Following TT009-1 success pattern
- ✅ Phased approach with validation at each step
- ✅ Multiple rollback options
- ✅ Comprehensive testing
- ✅ Partner review before execution

---

## NEXT STEPS

1. **Partner Review** - Review this plan and the detailed implementation plan
2. **Approve or Adjust** - Decide if plan is acceptable or needs changes
3. **Execute Phases A-G** - Follow step-by-step implementation
4. **Validate Success** - Verify all 52 tools working, 34 tools removed
5. **Mark TT009 Complete** - All phases (1, 2, 3) done ✅

---

## DELIVERABLES

**Documents**:
- [x] Executive Summary (this document)
- [x] Detailed Implementation Plan (TT009_COMPLETE_CONSOLIDATION_IMPLEMENTATION_PLAN.md)
- [ ] Migration Guide (created during Phase E)
- [ ] Completion Report (created during Phase G)

**Code Changes**:
- [ ] server.ts - Remove 77 lines (35 case statements + imports)
- [ ] toolDefinitions.ts - Remove 34 tool definitions
- [ ] CLAUDE.md - Update tool count and status
- [ ] Archive 4 deprecated handler files

**Validation**:
- [ ] Tool count: 86 → 52
- [ ] All tests passing
- [ ] Documentation accurate
- [ ] TT009 complete

---

**Status**: ⏸️ Ready for Partner Review
**Decision Needed**: Approve plan and schedule execution
**Full Details**: See TT009_COMPLETE_CONSOLIDATION_IMPLEMENTATION_PLAN.md

---

*Evidence-based plan created from:*
- *AIDIS_TOOL_INVESTIGATION_SUMMARY.md*
- *AIDIS_WIRED_TOOLS_INVESTIGATION_REPORT.md*
- *Direct code inspection and verification*
