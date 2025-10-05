# TT009 Quick Reference Card

**Quick access to key information during implementation**

---

## NUMBERS AT A GLANCE

- **Current tools**: 86
- **Target tools**: 52
- **Tools to remove**: 34 (35 case statements)
- **Metrics to remove**: 17
- **Pattern to remove**: 17 (18 case statements - one duplicate)
- **Estimated time**: 5.5 hours

---

## LINE NUMBERS TO MODIFY

### server.ts
- **Lines 59-60**: Remove pattern handler imports
- **Lines 62**: Remove DevelopmentMetricsHandler import
- **Lines 92**: Remove MetricsAggregationHandler import
- **Lines 1025-1079**: Remove pattern case statements (55 lines)
- **Lines 1095-1116**: Remove metrics case statements (22 lines)

### toolDefinitions.ts
- **Line ~1049**: Start of pattern tool definitions (remove 17)
- **Line ~2027**: Start of metrics tool definitions (remove 17)

---

## TOOLS TO REMOVE - QUICK LIST

### Metrics (17)
```
metrics_collect_project
metrics_get_dashboard
metrics_get_core_metrics
metrics_get_pattern_intelligence
metrics_get_productivity_health
metrics_get_alerts
metrics_acknowledge_alert
metrics_resolve_alert
metrics_get_trends
metrics_get_performance
metrics_start_collection
metrics_stop_collection
metrics_aggregate_projects
metrics_aggregate_timeline
metrics_calculate_correlations
metrics_get_executive_summary
metrics_export_data
```

### Pattern (17 + 1 duplicate)
```
pattern_detection_start
pattern_detection_stop
pattern_detect_commits
pattern_get_session_insights
pattern_analyze_project
pattern_get_alerts (appears twice - lines 1041 and 1063)
pattern_detection_status
pattern_track_git_activity
pattern_get_discovered
pattern_get_trends
pattern_get_correlations
pattern_get_insights
pattern_get_anomalies
pattern_get_recommendations
pattern_analyze_session
pattern_analyze_commit
pattern_get_performance
```

---

## TOOLS TO KEEP (Already Working)

### Consolidated (8)
```
complexity_analyze
complexity_insights
complexity_manage
metrics_collect
metrics_analyze
metrics_control
pattern_analyze
pattern_insights
```

---

## QUICK COMMANDS

### Verify Current State
```bash
# Tool count (should be 86 now, 52 after)
curl -s http://localhost:8080/mcp/tools/schemas | python3 -c "import sys,json; print(len(json.load(sys.stdin)['tools']))"

# Check specific tool exists
curl -X POST http://localhost:8080/mcp/tools/TOOL_NAME -d '{}'
```

### Backup Files
```bash
cp /home/ridgetop/aidis/mcp-server/src/server.ts server.ts.backup-tt009
cp /home/ridgetop/aidis/mcp-server/src/config/toolDefinitions.ts toolDefinitions.ts.backup-tt009
```

### TypeScript Compile
```bash
cd /home/ridgetop/aidis/mcp-server && npx tsc --noEmit
```

### Test Consolidated Tools
```bash
# Metrics
curl -X POST http://localhost:8080/mcp/tools/metrics_collect -d '{"operation":"project"}'
curl -X POST http://localhost:8080/mcp/tools/metrics_analyze -d '{"operation":"dashboard"}'
curl -X POST http://localhost:8080/mcp/tools/metrics_control -d '{"operation":"start"}'

# Pattern
curl -X POST http://localhost:8080/mcp/tools/pattern_analyze -d '{"operation":"detect","scope":"commits"}'
curl -X POST http://localhost:8080/mcp/tools/pattern_insights -d '{"operation":"insights"}'
```

### Verify Deprecated Gone
```bash
# Should return "Unknown tool" error
curl -X POST http://localhost:8080/mcp/tools/metrics_collect_project -d '{}'
curl -X POST http://localhost:8080/mcp/tools/pattern_detection_start -d '{}'
```

---

## HANDLERS TO ARCHIVE

```bash
# Create archive dir
mkdir -p /home/ridgetop/aidis/mcp-server/src/handlers/_deprecated_tt009

# Move files
mv /home/ridgetop/aidis/mcp-server/src/handlers/developmentMetrics.ts _deprecated_tt009/
mv /home/ridgetop/aidis/mcp-server/src/handlers/metricsAggregation.ts _deprecated_tt009/
mv /home/ridgetop/aidis/mcp-server/src/handlers/patternDetection.ts _deprecated_tt009/
mv /home/ridgetop/aidis/mcp-server/src/handlers/patternAnalysis.ts _deprecated_tt009/
```

---

## COMPLETION COMMENTS TO ADD

### After Metrics Removal (line ~1095)
```typescript
      // TT009-2: Deprecated metrics tools removed - Tool Consolidation Phase 2 Complete
      // 17 tools consolidated into metrics_collect, metrics_analyze, metrics_control
```

### After Pattern Removal (line ~1025)
```typescript
      // TT009-3: Deprecated pattern tools removed - Tool Consolidation Phase 3 Complete
      // 17 tools consolidated into pattern_analyze, pattern_insights
```

---

## VALIDATION CHECKLIST (Essential)

After each phase:
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Tool count correct (69 after metrics, 52 after pattern)
- [ ] Consolidated tools work
- [ ] Deprecated tools return 404
- [ ] Server starts successfully

---

## ROLLBACK (If Needed)

### Full Rollback
```bash
git checkout main
git branch -D feature/tt009-phases-2-3-complete
```

### Restore from Backup
```bash
cp server.ts.backup-tt009 server.ts
cp toolDefinitions.ts.backup-tt009 toolDefinitions.ts
```

### Restore Handlers
```bash
cp _deprecated_tt009/*.ts handlers/
```

---

## EXPECTED RESULTS

### Before
- Tool count: **86**
- Status: **TT009 incomplete** (Phases 2 & 3 failed to remove old tools)
- CLAUDE.md: Says 47 tools (wrong)

### After
- Tool count: **52**
- Status: **TT009 complete** (Phases 1, 2, 3 all done)
- CLAUDE.md: Says 52 tools (correct)

---

## PHASE QUICK GUIDE

| Phase | Time | Action | Verification |
|-------|------|--------|--------------|
| A | 30m | Prep, backup | Tool count = 86 |
| B | 1h | Remove metrics | Tool count = 69 |
| C | 1h | Remove pattern | Tool count = 52 |
| D | 30m | Archive handlers | No errors |
| E | 30m | Update docs | Docs accurate |
| F | 1h | Test everything | All tests pass |
| G | 30m | Commit | TT009 done ✅ |

---

## FILES TO MODIFY

1. `/home/ridgetop/aidis/mcp-server/src/server.ts`
2. `/home/ridgetop/aidis/mcp-server/src/config/toolDefinitions.ts`
3. `/home/ridgetop/aidis/CLAUDE.md`

---

## SUCCESS = 52 TOOLS

**Core AIDIS**: 44 tools
**Consolidated**: 8 tools
- Complexity: 3
- Metrics: 3
- Pattern: 2

**Total**: 52 tools ✅

---

**Full Details**: TT009_COMPLETE_CONSOLIDATION_IMPLEMENTATION_PLAN.md
**Summary**: TT009_EXECUTIVE_SUMMARY.md
