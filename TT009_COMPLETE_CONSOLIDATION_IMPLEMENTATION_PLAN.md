# TT009 Complete Consolidation - Implementation Plan

**Document Version**: 1.0
**Date**: 2025-10-01
**Status**: Ready for Partner Review
**Objective**: Complete TT009 Phases 2 & 3 by removing 34 deprecated tools

---

## EXECUTIVE SUMMARY

### Current Situation
- **Tools Currently Wired**: 86 tools
- **Target Tool Count**: 52 tools
- **Tools to Remove**: 34 unique tools (35 case statements)
- **Problem**: TT009 Phases 2 & 3 created new consolidated tools but failed to remove old deprecated tools

### What Needs to Happen
1. **Complete TT009-2 (Metrics)**: Remove 17 deprecated metrics tools
2. **Complete TT009-3 (Pattern)**: Remove 17 deprecated pattern tools (18 case statements)
3. **Update Documentation**: Correct CLAUDE.md tool count from 47 to 52
4. **Archive Old Handlers**: Move deprecated handler files to archive folder
5. **Validate Success**: Ensure all 52 tools work, no deprecated tools accessible

### Success Pattern to Follow
**TT009-1 (Complexity)** was done correctly:
- ✅ Created 3 new consolidated tools
- ✅ Removed 16 old tools from server.ts switch statement
- ✅ Removed old handler imports
- ✅ Added completion comment in code
- ✅ Result: Clean, no duplication

**TT009-2 & TT009-3** were incomplete:
- ✅ Created new consolidated tools
- ❌ Did NOT remove old tools from server.ts
- ❌ Did NOT remove old handler imports
- ❌ No completion comments
- ❌ Result: Duplication, confusion

---

## DEPRECATED TOOLS INVENTORY

### METRICS TOOLS - 17 Deprecated (17 case statements)

#### Development Metrics (12 tools)
Located in: `server.ts` lines 1096-1108
1. `metrics_collect_project`
2. `metrics_get_dashboard`
3. `metrics_get_core_metrics`
4. `metrics_get_pattern_intelligence`
5. `metrics_get_productivity_health`
6. `metrics_get_alerts`
7. `metrics_acknowledge_alert`
8. `metrics_resolve_alert`
9. `metrics_get_trends`
10. `metrics_get_performance`
11. `metrics_start_collection`
12. `metrics_stop_collection`

**Handler**: `DevelopmentMetricsHandler.handleTool(toolName, validatedArgs)`
**Import Line**: Line 62 - `import { DevelopmentMetricsHandler } from './handlers/developmentMetrics.js';`

#### Metrics Aggregation (5 tools)
Located in: `server.ts` lines 1111-1116
13. `metrics_aggregate_projects`
14. `metrics_aggregate_timeline`
15. `metrics_calculate_correlations`
16. `metrics_get_executive_summary`
17. `metrics_export_data`

**Handler**: `MetricsAggregationHandler.handleTool(toolName, validatedArgs)`
**Import Line**: Line 92 - `import { MetricsAggregationHandler } from './handlers/metricsAggregation.js';`

### PATTERN TOOLS - 17 Deprecated (18 case statements)

#### Pattern Detection TC013 (8 tools)
Located in: `server.ts` lines 1026-1048
1. `pattern_detection_start`
2. `pattern_detection_stop`
3. `pattern_detect_commits`
4. `pattern_get_session_insights`
5. `pattern_analyze_project`
6. `pattern_get_alerts` (TC013 version)
7. `pattern_detection_status`
8. `pattern_track_git_activity`

**Handler**: `patternDetectionHandlers.{method_name}(validatedArgs)`
**Import Line**: Line 59 - `import { patternDetectionHandlers } from './handlers/patternDetection.js';`

#### Pattern Analysis TC017 (10 tools, 1 duplicate)
Located in: `server.ts` lines 1051-1079
9. `pattern_get_discovered`
10. `pattern_get_trends`
11. `pattern_get_correlations`
12. `pattern_get_insights`
13. `pattern_get_alerts` (TC017 version - **DUPLICATE**, line 1063)
14. `pattern_get_anomalies`
15. `pattern_get_recommendations`
16. `pattern_analyze_session`
17. `pattern_analyze_commit`
18. `pattern_get_performance`

**Handler**: `patternAnalysisHandlers.{method_name}(validatedArgs)`
**Import Line**: Line 60 - `import { patternAnalysisHandlers } from './handlers/patternAnalysis.js';`

**NOTE**: `pattern_get_alerts` appears TWICE (lines 1041 and 1063) - both must be removed.

### CONSOLIDATED REPLACEMENT TOOLS (Already Created ✅)

#### Metrics Consolidated (TT009-2)
Located in: `server.ts` lines 1082-1087
- `metrics_collect` → `/handlers/metrics/metricsCollect.ts`
- `metrics_analyze` → `/handlers/metrics/metricsAnalyze.ts`
- `metrics_control` → `/handlers/metrics/metricsControl.ts`

#### Pattern Consolidated (TT009-3)
Located in: `server.ts` lines 1090-1093
- `pattern_analyze` → `/handlers/patterns/patternAnalyze.ts`
- `pattern_insights` → `/handlers/patterns/patternInsights.ts`

---

## FILE MODIFICATION GUIDE

### File 1: `/home/ridgetop/aidis/mcp-server/src/server.ts`

#### Action 1: Remove Deprecated Metrics Case Statements
**Lines to DELETE**: 1095-1116 (22 lines total)

```typescript
// DELETE THESE LINES:
      // Development Metrics Tools (to be consolidated in Phase 2)
      case 'metrics_collect_project':
      case 'metrics_get_dashboard':
      case 'metrics_get_core_metrics':
      case 'metrics_get_pattern_intelligence':
      case 'metrics_get_productivity_health':
      case 'metrics_get_alerts':
      case 'metrics_acknowledge_alert':
      case 'metrics_resolve_alert':
      case 'metrics_get_trends':
      case 'metrics_get_performance':
      case 'metrics_start_collection':
      case 'metrics_stop_collection':
        return await DevelopmentMetricsHandler.handleTool(toolName, validatedArgs);

      // TC018: Metrics Aggregation Tools
      case 'metrics_aggregate_projects':
      case 'metrics_aggregate_timeline':
      case 'metrics_calculate_correlations':
      case 'metrics_get_executive_summary':
      case 'metrics_export_data':
        return await MetricsAggregationHandler.handleTool(toolName, validatedArgs);
```

**REPLACE WITH** (add completion comment):
```typescript
      // TT009-2: Deprecated metrics tools removed - Tool Consolidation Phase 2 Complete
      // 17 tools consolidated into metrics_collect, metrics_analyze, metrics_control
```

#### Action 2: Remove Deprecated Pattern Case Statements
**Lines to DELETE**: 1025-1079 (55 lines total)

```typescript
// DELETE THESE LINES:
      // TC013: Pattern Detection Tools
      case 'pattern_detection_start':
        return await patternDetectionHandlers.pattern_detection_start(validatedArgs as any);

      case 'pattern_detection_stop':
        return await patternDetectionHandlers.pattern_detection_stop();

      case 'pattern_detect_commits':
        return await patternDetectionHandlers.pattern_detect_commits(validatedArgs as any);

      case 'pattern_get_session_insights':
        return await patternDetectionHandlers.pattern_get_session_insights(validatedArgs as any);

      case 'pattern_analyze_project':
        return await patternDetectionHandlers.pattern_analyze_project(validatedArgs as any);

      case 'pattern_get_alerts':
        return await patternDetectionHandlers.pattern_get_alerts(validatedArgs as any);

      case 'pattern_detection_status':
        return await patternDetectionHandlers.pattern_detection_status();

      case 'pattern_track_git_activity':
        return await patternDetectionHandlers.pattern_track_git_activity();

      // TC017: Pattern Analysis Tools - Comprehensive pattern intelligence API
      case 'pattern_get_discovered':
        return await patternAnalysisHandlers.pattern_get_discovered(validatedArgs as any);

      case 'pattern_get_trends':
        return await patternAnalysisHandlers.pattern_get_trends(validatedArgs as any);

      case 'pattern_get_correlations':
        return await patternAnalysisHandlers.pattern_get_correlations(validatedArgs as any);

      case 'pattern_get_insights':
        return await patternAnalysisHandlers.pattern_get_insights(validatedArgs as any);

      case 'pattern_get_alerts':
        return await patternAnalysisHandlers.pattern_get_alerts(validatedArgs as any);

      case 'pattern_get_anomalies':
        return await patternAnalysisHandlers.pattern_get_anomalies(validatedArgs as any);

      case 'pattern_get_recommendations':
        return await patternAnalysisHandlers.pattern_get_recommendations(validatedArgs as any);

      case 'pattern_analyze_session':
        return await patternAnalysisHandlers.pattern_analyze_session(validatedArgs as any);

      case 'pattern_analyze_commit':
        return await patternAnalysisHandlers.pattern_analyze_commit(validatedArgs as any);

      case 'pattern_get_performance':
        return await patternAnalysisHandlers.pattern_get_performance(validatedArgs as any);
```

**REPLACE WITH** (add completion comment):
```typescript
      // TT009-3: Deprecated pattern tools removed - Tool Consolidation Phase 3 Complete
      // 17 tools consolidated into pattern_analyze, pattern_insights
```

#### Action 3: Remove Handler Imports
**Lines to DELETE**:
- Line 59: `import { patternDetectionHandlers } from './handlers/patternDetection.js';`
- Line 60: `import { patternAnalysisHandlers } from './handlers/patternAnalysis.js';`
- Line 62: `import { DevelopmentMetricsHandler } from './handlers/developmentMetrics.js';`
- Line 92: `import { MetricsAggregationHandler } from './handlers/metricsAggregation.js';`

**Verification**: After removal, these imports should NOT appear in server.ts

### File 2: `/home/ridgetop/aidis/mcp-server/src/config/toolDefinitions.ts`

#### Action: Remove 34 Deprecated Tool Definitions

**Tools to Remove from AIDIS_TOOL_DEFINITIONS array**:

**Metrics (17 tools)**:
1. Tool definition starting at line ~2027: `metrics_collect_project`
2. Find and remove definitions for:
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

**Pattern (17 tools)**:
1. Tool definition starting at line ~1049: `pattern_detection_start`
2. Find and remove definitions for:
   - `pattern_detection_stop`
   - `pattern_detect_commits`
   - `pattern_get_session_insights`
   - `pattern_analyze_project`
   - `pattern_get_alerts`
   - `pattern_detection_status`
   - `pattern_track_git_activity`
   - `pattern_get_discovered`
   - `pattern_get_trends`
   - `pattern_get_correlations`
   - `pattern_get_insights`
   - `pattern_get_anomalies`
   - `pattern_get_recommendations`
   - `pattern_analyze_session`
   - `pattern_analyze_commit`
   - `pattern_get_performance`

**Method**:
- Each tool definition is a complete object in the array
- Find by searching for `name: 'tool_name'`
- Remove the entire object (from opening `{` to closing `},`)
- Ensure array syntax remains valid (proper commas)

**Verification**:
- Tool count should drop from 86 to 52
- Run: `grep -c "name: '" /home/ridgetop/aidis/mcp-server/src/config/toolDefinitions.ts`
- Expected result: 52

### File 3: `/home/ridgetop/aidis/CLAUDE.md`

#### Action: Update Tool Count and Categories

**Line 4**: Change tool count
```markdown
# BEFORE:
**AIDIS: 47 MCP Tools - 100% Operational**

# AFTER:
**AIDIS: 52 MCP Tools - 100% Operational**
```

**Lines 10-24**: Update TT009 status
```markdown
# BEFORE:
### TT009 Complete Tool Consolidation ✅

**Phase 1 - Complexity Tools (TT009-1)**
- `complexity_analyze` - File/commit analysis (replaces 4 tools)
- `complexity_insights` - Dashboard/hotspots/trends/debt/opportunities (replaces 5 tools)
- `complexity_manage` - Tracking/alerts/thresholds/performance (replaces 7 tools)

**Phase 2 - Metrics Tools (TT009-2)**
- `metrics_collect` - Unified collection operations (replaces 6 tools)
- `metrics_analyze` - Analysis/dashboard/trends/correlations (replaces 6 tools)
- `metrics_control` - Control/alerts/performance/export (replaces 5 tools)

**Phase 3 - Pattern Detection (TT009-3)**
- `pattern_analyze` - Detection/analysis/tracking operations (replaces 10 tools)
- `pattern_insights` - Insights/correlations/recommendations (replaces 7 tools)

# AFTER:
### TT009 Tool Consolidation ✅ COMPLETE

**Phase 1 - Complexity (TT009-1)** ✅
- `complexity_analyze` - File/commit analysis (consolidated 16 tools)
- `complexity_insights` - Dashboard/hotspots/trends/debt/opportunities
- `complexity_manage` - Tracking/alerts/thresholds/performance

**Phase 2 - Metrics (TT009-2)** ✅
- `metrics_collect` - Unified collection operations (consolidated 17 tools)
- `metrics_analyze` - Analysis/dashboard/trends/correlations
- `metrics_control` - Control/alerts/performance/export

**Phase 3 - Pattern Detection (TT009-3)** ✅
- `pattern_analyze` - Detection/analysis/tracking operations (consolidated 17 tools)
- `pattern_insights` - Insights/correlations/recommendations
```

**Line 26**: Update tool count summary
```markdown
# BEFORE:
**Tools**: 47 total

# AFTER:
**Tools**: 52 total (44 core + 8 consolidated)
```

---

## HANDLER FILES TO ARCHIVE

**DO NOT DELETE** - Move to archive folder for reference

### Files to Archive
1. `/home/ridgetop/aidis/mcp-server/src/handlers/developmentMetrics.ts`
2. `/home/ridgetop/aidis/mcp-server/src/handlers/metricsAggregation.ts`
3. `/home/ridgetop/aidis/mcp-server/src/handlers/patternDetection.ts`
4. `/home/ridgetop/aidis/mcp-server/src/handlers/patternAnalysis.ts`

### Archive Process
```bash
# Create archive directory
mkdir -p /home/ridgetop/aidis/mcp-server/src/handlers/_deprecated_tt009

# Move files to archive
mv /home/ridgetop/aidis/mcp-server/src/handlers/developmentMetrics.ts \
   /home/ridgetop/aidis/mcp-server/src/handlers/_deprecated_tt009/

mv /home/ridgetop/aidis/mcp-server/src/handlers/metricsAggregation.ts \
   /home/ridgetop/aidis/mcp-server/src/handlers/_deprecated_tt009/

mv /home/ridgetop/aidis/mcp-server/src/handlers/patternDetection.ts \
   /home/ridgetop/aidis/mcp-server/src/handlers/_deprecated_tt009/

mv /home/ridgetop/aidis/mcp-server/src/handlers/patternAnalysis.ts \
   /home/ridgetop/aidis/mcp-server/src/handlers/_deprecated_tt009/

# Create README in archive
cat > /home/ridgetop/aidis/mcp-server/src/handlers/_deprecated_tt009/README.md << 'EOF'
# Deprecated TT009 Handlers Archive

**Date Archived**: 2025-10-01
**Reason**: TT009 Tool Consolidation Phases 2 & 3 completion

These handlers were replaced by consolidated tools:
- developmentMetrics.ts → metrics_collect, metrics_analyze, metrics_control
- metricsAggregation.ts → metrics_collect, metrics_analyze, metrics_control
- patternDetection.ts → pattern_analyze, pattern_insights
- patternAnalysis.ts → pattern_analyze, pattern_insights

**Do not restore** - kept for reference only.
EOF
```

---

## STEP-BY-STEP IMPLEMENTATION PLAN

### PHASE A: Preparation (No Code Changes)
**Duration**: 30 minutes

- [ ] **A1**: Create git branch
  ```bash
  git checkout -b feature/tt009-phases-2-3-complete
  git status
  ```

- [ ] **A2**: Create backup of current state
  ```bash
  cp /home/ridgetop/aidis/mcp-server/src/server.ts \
     /home/ridgetop/aidis/mcp-server/src/server.ts.backup-tt009

  cp /home/ridgetop/aidis/mcp-server/src/config/toolDefinitions.ts \
     /home/ridgetop/aidis/mcp-server/src/config/toolDefinitions.ts.backup-tt009
  ```

- [ ] **A3**: Verify current tool count (should be 86)
  ```bash
  curl -s http://localhost:8080/mcp/tools/schemas | \
    python3 -c "import sys,json; print(len(json.load(sys.stdin)['tools']))"
  ```

- [ ] **A4**: Test consolidated tools are working
  ```bash
  # Test metrics_collect
  curl -X POST http://localhost:8080/mcp/tools/metrics_collect \
    -H "Content-Type: application/json" \
    -d '{"operation": "project"}'

  # Test pattern_analyze
  curl -X POST http://localhost:8080/mcp/tools/pattern_analyze \
    -H "Content-Type: application/json" \
    -d '{"operation": "detect", "scope": "commits"}'
  ```

- [ ] **A5**: Document exact line numbers to modify
  ```bash
  # Verify line numbers match this plan
  sed -n '1095,1116p' /home/ridgetop/aidis/mcp-server/src/server.ts
  sed -n '1025,1079p' /home/ridgetop/aidis/mcp-server/src/server.ts
  ```

### PHASE B: Remove Deprecated Metrics Tools
**Duration**: 1 hour

- [ ] **B1**: Remove metrics case statements from server.ts (lines 1095-1116)
  - Delete 22 lines total
  - Add completion comment
  - Verify syntax is valid

- [ ] **B2**: Remove metrics handler imports from server.ts
  - Line 62: Remove `DevelopmentMetricsHandler` import
  - Line 92: Remove `MetricsAggregationHandler` import

- [ ] **B3**: Remove metrics tool definitions from toolDefinitions.ts
  - Remove 17 tool definitions
  - Ensure array syntax remains valid
  - Verify commas are correct

- [ ] **B4**: Compile TypeScript
  ```bash
  cd /home/ridgetop/aidis/mcp-server
  npx tsc --noEmit
  ```
  Expected: No errors

- [ ] **B5**: Test metrics consolidated tools still work
  ```bash
  # Start server
  npx tsx src/server.ts &
  SERVER_PID=$!

  # Test metrics_collect
  curl -X POST http://localhost:8080/mcp/tools/metrics_collect \
    -H "Content-Type: application/json" \
    -d '{"operation": "project"}'

  # Stop server
  kill $SERVER_PID
  ```

- [ ] **B6**: Verify tool count dropped from 86 to 69
  ```bash
  curl -s http://localhost:8080/mcp/tools/schemas | \
    python3 -c "import sys,json; print(len(json.load(sys.stdin)['tools']))"
  ```

- [ ] **B7**: Verify deprecated metrics tools return 404
  ```bash
  curl -X POST http://localhost:8080/mcp/tools/metrics_collect_project \
    -H "Content-Type: application/json" -d '{}'
  # Expected: Error "Unknown tool"
  ```

### PHASE C: Remove Deprecated Pattern Tools
**Duration**: 1 hour

- [ ] **C1**: Remove pattern case statements from server.ts (lines 1025-1079)
  - Delete 55 lines total (including duplicate pattern_get_alerts)
  - Add completion comment
  - Verify syntax is valid

- [ ] **C2**: Remove pattern handler imports from server.ts
  - Line 59: Remove `patternDetectionHandlers` import
  - Line 60: Remove `patternAnalysisHandlers` import

- [ ] **C3**: Remove pattern tool definitions from toolDefinitions.ts
  - Remove 17 tool definitions
  - Ensure array syntax remains valid
  - Verify commas are correct

- [ ] **C4**: Compile TypeScript
  ```bash
  cd /home/ridgetop/aidis/mcp-server
  npx tsc --noEmit
  ```
  Expected: No errors

- [ ] **C5**: Test pattern consolidated tools still work
  ```bash
  # Test pattern_analyze
  curl -X POST http://localhost:8080/mcp/tools/pattern_analyze \
    -H "Content-Type: application/json" \
    -d '{"operation": "detect", "scope": "commits"}'

  # Test pattern_insights
  curl -X POST http://localhost:8080/mcp/tools/pattern_insights \
    -H "Content-Type: application/json" \
    -d '{"operation": "insights"}'
  ```

- [ ] **C6**: Verify tool count dropped from 69 to 52
  ```bash
  curl -s http://localhost:8080/mcp/tools/schemas | \
    python3 -c "import sys,json; print(len(json.load(sys.stdin)['tools']))"
  ```

- [ ] **C7**: Verify deprecated pattern tools return 404
  ```bash
  curl -X POST http://localhost:8080/mcp/tools/pattern_detection_start \
    -H "Content-Type: application/json" -d '{}'
  # Expected: Error "Unknown tool"
  ```

### PHASE D: Archive Old Handlers
**Duration**: 30 minutes

- [ ] **D1**: Create archive directory
  ```bash
  mkdir -p /home/ridgetop/aidis/mcp-server/src/handlers/_deprecated_tt009
  ```

- [ ] **D2**: Move deprecated handler files to archive
  ```bash
  mv /home/ridgetop/aidis/mcp-server/src/handlers/developmentMetrics.ts \
     /home/ridgetop/aidis/mcp-server/src/handlers/_deprecated_tt009/

  mv /home/ridgetop/aidis/mcp-server/src/handlers/metricsAggregation.ts \
     /home/ridgetop/aidis/mcp-server/src/handlers/_deprecated_tt009/

  mv /home/ridgetop/aidis/mcp-server/src/handlers/patternDetection.ts \
     /home/ridgetop/aidis/mcp-server/src/handlers/_deprecated_tt009/

  mv /home/ridgetop/aidis/mcp-server/src/handlers/patternAnalysis.ts \
     /home/ridgetop/aidis/mcp-server/src/handlers/_deprecated_tt009/
  ```

- [ ] **D3**: Create archive README
  ```bash
  cat > /home/ridgetop/aidis/mcp-server/src/handlers/_deprecated_tt009/README.md << 'EOF'
  # Deprecated TT009 Handlers Archive

  **Date Archived**: 2025-10-01
  **Reason**: TT009 Tool Consolidation Phases 2 & 3 completion

  These handlers were replaced by consolidated tools:
  - developmentMetrics.ts → metrics_collect, metrics_analyze, metrics_control
  - metricsAggregation.ts → metrics_collect, metrics_analyze, metrics_control
  - patternDetection.ts → pattern_analyze, pattern_insights
  - patternAnalysis.ts → pattern_analyze, pattern_insights

  **Do not restore** - kept for reference only.
  EOF
  ```

- [ ] **D4**: Verify no broken imports
  ```bash
  cd /home/ridgetop/aidis/mcp-server
  npx tsc --noEmit
  ```
  Expected: No errors related to missing handlers

- [ ] **D5**: Verify server starts successfully
  ```bash
  npx tsx src/server.ts &
  sleep 3
  curl http://localhost:8080/health
  # Expected: {"status":"healthy"}
  pkill -f "tsx src/server.ts"
  ```

### PHASE E: Update Documentation
**Duration**: 30 minutes

- [ ] **E1**: Update CLAUDE.md tool count (line 4)
  ```markdown
  **AIDIS: 52 MCP Tools - 100% Operational**
  ```

- [ ] **E2**: Update CLAUDE.md TT009 status section (lines 10-24)
  - Mark all phases as ✅ COMPLETE
  - Update tool counts (16, 17, 17 consolidated)

- [ ] **E3**: Update CLAUDE.md tool count summary (line 26)
  ```markdown
  **Tools**: 52 total (44 core + 8 consolidated)
  ```

- [ ] **E4**: Create migration guide document
  ```bash
  cat > /home/ridgetop/aidis/TT009_MIGRATION_GUIDE.md << 'EOF'
  # TT009 Migration Guide
  # Old Tool → New Tool Mapping

  ## Metrics Tools

  ### OLD: Individual metrics tools
  - metrics_collect_project → metrics_collect with {operation: "project"}
  - metrics_get_dashboard → metrics_analyze with {operation: "dashboard"}
  - metrics_get_core_metrics → metrics_analyze with {operation: "core"}
  ... (complete mapping)

  ## Pattern Tools

  ### OLD: Individual pattern tools
  - pattern_detection_start → pattern_analyze with {operation: "detect"}
  - pattern_get_insights → pattern_insights with {operation: "insights"}
  ... (complete mapping)
  EOF
  ```

- [ ] **E5**: Update toolDefinitions.ts header comment
  ```typescript
  /**
   * AIDIS Tool Definitions
   *
   * Shared module containing all 52 AIDIS MCP tool definitions.
   * This module serves as the single source of truth for tool schemas
   * used by both the main MCP server and the HTTP bridge.
   *
   * Last Updated: 2025-10-01
   * TT009 Consolidation: Complete (Phases 1, 2, 3)
   */
  ```

### PHASE F: Testing & Validation
**Duration**: 1 hour

- [ ] **F1**: TypeScript compilation passes
  ```bash
  cd /home/ridgetop/aidis/mcp-server
  npx tsc --noEmit
  ```
  Expected: No errors

- [ ] **F2**: Server starts successfully
  ```bash
  npx tsx src/server.ts &
  SERVER_PID=$!
  sleep 3
  curl http://localhost:8080/health
  # Expected: {"status":"healthy"}
  ```

- [ ] **F3**: Verify tool count is exactly 52
  ```bash
  curl -s http://localhost:8080/mcp/tools/schemas | \
    python3 -c "import sys,json; print('Tool count:', len(json.load(sys.stdin)['tools']))"
  # Expected: Tool count: 52
  ```

- [ ] **F4**: Verify all 52 tools from AIDIS-tool-list.md are accessible
  ```bash
  # Test random sample of tools
  curl -X POST http://localhost:8080/mcp/tools/aidis_ping -d '{}'
  curl -X POST http://localhost:8080/mcp/tools/context_store -d '{"content":"test","type":"code"}'
  curl -X POST http://localhost:8080/mcp/tools/complexity_analyze -d '{"operation":"file","file":"test.ts"}'
  curl -X POST http://localhost:8080/mcp/tools/metrics_collect -d '{"operation":"project"}'
  curl -X POST http://localhost:8080/mcp/tools/pattern_analyze -d '{"operation":"detect","scope":"commits"}'
  ```

- [ ] **F5**: Verify deprecated tools return 404
  ```bash
  # Test that old tools are gone
  curl -X POST http://localhost:8080/mcp/tools/metrics_collect_project -d '{}'
  # Expected: Error "Unknown tool"

  curl -X POST http://localhost:8080/mcp/tools/pattern_detection_start -d '{}'
  # Expected: Error "Unknown tool"
  ```

- [ ] **F6**: Test consolidated tools have feature parity
  ```bash
  # Verify metrics_collect handles all operations
  curl -X POST http://localhost:8080/mcp/tools/metrics_collect \
    -H "Content-Type: application/json" \
    -d '{"operation": "project"}'

  curl -X POST http://localhost:8080/mcp/tools/metrics_collect \
    -H "Content-Type: application/json" \
    -d '{"operation": "start"}'

  # Verify pattern_analyze handles all operations
  curl -X POST http://localhost:8080/mcp/tools/pattern_analyze \
    -H "Content-Type: application/json" \
    -d '{"operation": "detect", "scope": "commits"}'

  curl -X POST http://localhost:8080/mcp/tools/pattern_analyze \
    -H "Content-Type: application/json" \
    -d '{"operation": "project"}'
  ```

- [ ] **F7**: Check server logs for errors
  ```bash
  # Review logs for any warnings or errors
  tail -100 /home/ridgetop/aidis/run/aidis-mcp-server.log
  ```

- [ ] **F8**: Verify stdio mock sees 52 tools
  ```bash
  # Stop current server
  kill $SERVER_PID

  # Start with stdio mock
  node /home/ridgetop/aidis/aidis-stdio-mock.js
  # Check output for tool count
  ```

- [ ] **F9**: Run comprehensive tool test
  ```bash
  # Create and run test script
  npx tsx /home/ridgetop/aidis/test-all-52-tools.ts
  ```

### PHASE G: Git Commit & Documentation
**Duration**: 30 minutes

- [ ] **G1**: Stage all changes
  ```bash
  git add mcp-server/src/server.ts
  git add mcp-server/src/config/toolDefinitions.ts
  git add CLAUDE.md
  git add mcp-server/src/handlers/_deprecated_tt009/
  git add TT009_MIGRATION_GUIDE.md
  ```

- [ ] **G2**: Create commit
  ```bash
  git commit -m "$(cat <<'EOF'
  Complete TT009 Tool Consolidation Phases 2 & 3

  Remove 34 deprecated tools (35 case statements) to achieve target of 52 tools.

  Completed:
  - TT009-2 (Metrics): Removed 17 deprecated metrics tools
    * 12 Development Metrics tools
    * 5 Metrics Aggregation tools
  - TT009-3 (Pattern): Removed 17 deprecated pattern tools (18 case statements)
    * 8 Pattern Detection (TC013) tools
    * 10 Pattern Analysis (TC017) tools (includes duplicate pattern_get_alerts)

  Changes:
  - server.ts: Removed 77 lines (35 case statements + imports)
  - toolDefinitions.ts: Removed 34 tool definitions
  - CLAUDE.md: Updated tool count from 47 to 52
  - Archived 4 deprecated handler files to _deprecated_tt009/

  All consolidated tools verified working:
  - metrics_collect, metrics_analyze, metrics_control (TT009-2)
  - pattern_analyze, pattern_insights (TT009-3)

  Tool count verified: 86 → 52 ✅

  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>
  EOF
  )"
  ```

- [ ] **G3**: Verify commit
  ```bash
  git show --stat
  git log -1 --format='%an %ae'
  ```

- [ ] **G4**: Update TT009 tracking document
  ```bash
  cat >> /home/ridgetop/aidis/TT009_COMPLETION_STATUS.md << 'EOF'

  ## TT009 Phases 2 & 3 Completion - 2025-10-01

  **Status**: ✅ COMPLETE

  ### Summary
  - Removed 34 deprecated tools (35 case statements)
  - Final tool count: 52 tools
  - All phases of TT009 now complete

  ### Phases
  - TT009-1 (Complexity): ✅ Complete (16 → 3 tools)
  - TT009-2 (Metrics): ✅ Complete (17 → 3 tools)
  - TT009-3 (Pattern): ✅ Complete (17 → 2 tools)

  ### Verification
  - TypeScript compilation: ✅ Pass
  - Server startup: ✅ Success
  - Tool count: ✅ 52
  - Deprecated tools: ✅ Inaccessible
  - Consolidated tools: ✅ Working
  EOF
  ```

---

## RISK ASSESSMENT & MITIGATION

### Risk 1: Breaking Existing Functionality
**Probability**: Low
**Impact**: High

**Mitigation**:
- ✅ New consolidated tools already created and tested
- ✅ Feature parity verified before removal
- ✅ Comprehensive testing in Phase F
- ✅ Backup files created in Phase A
- ✅ Git branch allows easy rollback

**Recovery**:
```bash
# If consolidated tools don't work:
git checkout main
# Or restore specific files:
cp server.ts.backup-tt009 server.ts
```

### Risk 2: Missing Dependencies
**Probability**: Very Low
**Impact**: Medium

**Mitigation**:
- ✅ All handler imports will be removed
- ✅ No other files import deprecated handlers
- ✅ TypeScript compilation will catch any issues
- ✅ Archive handlers kept for reference

**Recovery**:
```bash
# If missing dependency found:
cp _deprecated_tt009/handlerFile.ts .
# Fix dependency, then re-archive
```

### Risk 3: Users Still Calling Old Tools
**Probability**: Low (internal system)
**Impact**: Low

**Mitigation**:
- ✅ Migration guide created
- ✅ Old tools will return clear error message
- ✅ Consolidated tools handle all use cases
- ✅ Testing verifies feature parity

**Recovery**:
- Error messages guide users to new tools
- Migration guide provides exact mappings

### Risk 4: Build or Runtime Errors
**Probability**: Very Low
**Impact**: High

**Mitigation**:
- ✅ TypeScript compilation after each phase
- ✅ Server restart test after each phase
- ✅ Comprehensive testing in Phase F
- ✅ Backup files and git branch

**Recovery**:
```bash
# Immediate rollback:
git checkout main
# Or selective rollback:
git checkout main -- mcp-server/src/server.ts
```

### Risk 5: Tool Count Mismatch
**Probability**: Very Low
**Impact**: Low

**Mitigation**:
- ✅ Exact count verified: 34 tools to remove
- ✅ Tool count validation in Phase F
- ✅ Multiple verification steps

**Recovery**:
- Recount tools using verification scripts
- Identify any missed definitions

---

## VALIDATION CHECKLIST

### Code Validation ✅

- [ ] TypeScript compiles without errors
  ```bash
  cd /home/ridgetop/aidis/mcp-server && npx tsc --noEmit
  ```

- [ ] No deprecated handler imports in server.ts
  ```bash
  grep -E "(DevelopmentMetricsHandler|MetricsAggregationHandler|patternDetectionHandlers|patternAnalysisHandlers)" \
    /home/ridgetop/aidis/mcp-server/src/server.ts
  # Expected: No matches
  ```

- [ ] No deprecated case statements in server.ts
  ```bash
  grep -E "(metrics_collect_project|pattern_detection_start)" \
    /home/ridgetop/aidis/mcp-server/src/server.ts
  # Expected: No matches
  ```

- [ ] Completion comments added
  ```bash
  grep "TT009-2.*Phase 2 Complete" /home/ridgetop/aidis/mcp-server/src/server.ts
  grep "TT009-3.*Phase 3 Complete" /home/ridgetop/aidis/mcp-server/src/server.ts
  # Expected: Both found
  ```

### Tool Count Validation ✅

- [ ] HTTP endpoint returns exactly 52 tools
  ```bash
  curl -s http://localhost:8080/mcp/tools/schemas | \
    python3 -c "import sys,json; tools=json.load(sys.stdin)['tools']; print(f'Count: {len(tools)}'); assert len(tools)==52"
  ```

- [ ] toolDefinitions.ts contains exactly 52 tools
  ```bash
  count=$(grep -c "name: '" /home/ridgetop/aidis/mcp-server/src/config/toolDefinitions.ts)
  echo "Tool definitions: $count"
  [ "$count" -eq 52 ] && echo "✅ Correct count" || echo "❌ Wrong count"
  ```

- [ ] AIDIS-tool-list.md matches exactly
  ```bash
  # Manual verification: Compare tool list from HTTP endpoint with AIDIS-tool-list.md
  curl -s http://localhost:8080/mcp/tools/schemas | \
    python3 -c "import sys,json; [print(t['name']) for t in json.load(sys.stdin)['tools']]" | \
    sort > /tmp/actual_tools.txt

  # Compare with expected (manual review required)
  ```

### Functionality Validation ✅

- [ ] All 52 tools from AIDIS-tool-list.md are callable
  ```bash
  # Test sample from each category
  curl -X POST http://localhost:8080/mcp/tools/aidis_ping -d '{}'
  curl -X POST http://localhost:8080/mcp/tools/complexity_analyze -d '{"operation":"file","file":"test.ts"}'
  curl -X POST http://localhost:8080/mcp/tools/metrics_collect -d '{"operation":"project"}'
  curl -X POST http://localhost:8080/mcp/tools/pattern_analyze -d '{"operation":"detect","scope":"commits"}'
  # All should return valid responses (not 404)
  ```

- [ ] Deprecated tools return 404
  ```bash
  curl -X POST http://localhost:8080/mcp/tools/metrics_collect_project -d '{}'
  curl -X POST http://localhost:8080/mcp/tools/pattern_detection_start -d '{}'
  # Both should return "Unknown tool" error
  ```

- [ ] Consolidated tools handle all use cases
  ```bash
  # Test metrics operations
  curl -X POST http://localhost:8080/mcp/tools/metrics_collect \
    -d '{"operation":"project"}'
  curl -X POST http://localhost:8080/mcp/tools/metrics_analyze \
    -d '{"operation":"dashboard"}'
  curl -X POST http://localhost:8080/mcp/tools/metrics_control \
    -d '{"operation":"start"}'

  # Test pattern operations
  curl -X POST http://localhost:8080/mcp/tools/pattern_analyze \
    -d '{"operation":"detect","scope":"commits"}'
  curl -X POST http://localhost:8080/mcp/tools/pattern_insights \
    -d '{"operation":"insights"}'
  ```

### Server Health Validation ✅

- [ ] Server starts without errors
  ```bash
  npx tsx /home/ridgetop/aidis/mcp-server/src/server.ts &
  sleep 3
  curl http://localhost:8080/health
  # Expected: {"status":"healthy"}
  ```

- [ ] No errors in server logs
  ```bash
  tail -100 /home/ridgetop/aidis/run/aidis-mcp-server.log | grep -i error
  # Expected: No critical errors
  ```

- [ ] No runtime errors when calling tools
  ```bash
  # Check logs after testing tools
  tail -50 /home/ridgetop/aidis/run/aidis-mcp-server.log
  ```

### Documentation Validation ✅

- [ ] CLAUDE.md updated with correct count (52)
  ```bash
  grep "52 MCP Tools" /home/ridgetop/aidis/CLAUDE.md
  # Expected: Match found
  ```

- [ ] CLAUDE.md shows all TT009 phases complete
  ```bash
  grep -A 10 "TT009.*Complete" /home/ridgetop/aidis/CLAUDE.md
  # Expected: Shows Phases 1, 2, 3 all complete
  ```

- [ ] Migration guide created
  ```bash
  [ -f /home/ridgetop/aidis/TT009_MIGRATION_GUIDE.md ] && echo "✅ Exists" || echo "❌ Missing"
  ```

- [ ] TT009 marked complete in docs
  ```bash
  grep "TT009.*COMPLETE" /home/ridgetop/aidis/TT009_COMPLETION_STATUS.md
  # Expected: Match found
  ```

---

## ROLLBACK PROCEDURES

### Immediate Rollback (If Critical Issue Found)

**Scenario**: Something is badly broken, need to revert everything immediately

```bash
# Option 1: Rollback to main branch
git checkout main
git branch -D feature/tt009-phases-2-3-complete

# Option 2: Restore from backup files
cp /home/ridgetop/aidis/mcp-server/src/server.ts.backup-tt009 \
   /home/ridgetop/aidis/mcp-server/src/server.ts

cp /home/ridgetop/aidis/mcp-server/src/config/toolDefinitions.ts.backup-tt009 \
   /home/ridgetop/aidis/mcp-server/src/config/toolDefinitions.ts

# Option 3: Restore handlers from archive
cp /home/ridgetop/aidis/mcp-server/src/handlers/_deprecated_tt009/*.ts \
   /home/ridgetop/aidis/mcp-server/src/handlers/

# Restart server
pkill -f "tsx src/server.ts"
npx tsx /home/ridgetop/aidis/mcp-server/src/server.ts &
```

### Partial Rollback (If One Phase Has Issues)

**Scenario**: Metrics removal is fine, but pattern removal has issues

```bash
# Rollback only pattern changes
git show HEAD:mcp-server/src/server.ts | \
  sed -n '1025,1079p' > /tmp/pattern_cases.txt

# Manually restore pattern case statements
# (Edit server.ts and re-add pattern cases)

# Or rollback specific file sections using git
git checkout HEAD~1 -- mcp-server/src/server.ts
# Then manually reapply metrics changes
```

### Handler Restore (If Dependency Found)

**Scenario**: Discovered that a handler is still needed

```bash
# Restore specific handler from archive
cp /home/ridgetop/aidis/mcp-server/src/handlers/_deprecated_tt009/developmentMetrics.ts \
   /home/ridgetop/aidis/mcp-server/src/handlers/

# Re-add import to server.ts
# (Edit server.ts and add import statement)

# Re-add case statements if needed
# (Edit server.ts and add case statements)

# Recompile and test
npx tsc --noEmit
npx tsx src/server.ts
```

### Tool Definition Restore (If Missing Tool Found)

**Scenario**: Accidentally removed a tool that should have been kept

```bash
# Restore from backup
cp /home/ridgetop/aidis/mcp-server/src/config/toolDefinitions.ts.backup-tt009 \
   /tmp/toolDefinitions.backup.ts

# Extract specific tool definition
# (Manually copy the tool definition from backup to current file)

# Verify tool count
grep -c "name: '" /home/ridgetop/aidis/mcp-server/src/config/toolDefinitions.ts
```

---

## MIGRATION GUIDE FOR USERS

### Deprecated Metrics Tools → New Consolidated Tools

| Old Tool | New Tool | Example |
|----------|----------|---------|
| `metrics_collect_project` | `metrics_collect` | `{operation: "project"}` |
| `metrics_get_dashboard` | `metrics_analyze` | `{operation: "dashboard"}` |
| `metrics_get_core_metrics` | `metrics_analyze` | `{operation: "core"}` |
| `metrics_get_pattern_intelligence` | `metrics_analyze` | `{operation: "patterns"}` |
| `metrics_get_productivity_health` | `metrics_analyze` | `{operation: "productivity"}` |
| `metrics_get_alerts` | `metrics_control` | `{operation: "get_alerts"}` |
| `metrics_acknowledge_alert` | `metrics_control` | `{operation: "acknowledge_alert", alertId: "..."}` |
| `metrics_resolve_alert` | `metrics_control` | `{operation: "resolve_alert", alertId: "..."}` |
| `metrics_get_trends` | `metrics_analyze` | `{operation: "trends"}` |
| `metrics_get_performance` | `metrics_analyze` | `{operation: "performance"}` |
| `metrics_start_collection` | `metrics_control` | `{operation: "start"}` |
| `metrics_stop_collection` | `metrics_control` | `{operation: "stop"}` |
| `metrics_aggregate_projects` | `metrics_analyze` | `{operation: "aggregate", scope: "projects"}` |
| `metrics_aggregate_timeline` | `metrics_analyze` | `{operation: "aggregate", scope: "timeline"}` |
| `metrics_calculate_correlations` | `metrics_analyze` | `{operation: "correlations"}` |
| `metrics_get_executive_summary` | `metrics_analyze` | `{operation: "executive_summary"}` |
| `metrics_export_data` | `metrics_control` | `{operation: "export"}` |

### Deprecated Pattern Tools → New Consolidated Tools

| Old Tool | New Tool | Example |
|----------|----------|---------|
| `pattern_detection_start` | `pattern_analyze` | `{operation: "start"}` |
| `pattern_detection_stop` | `pattern_analyze` | `{operation: "stop"}` |
| `pattern_detect_commits` | `pattern_analyze` | `{operation: "detect", scope: "commits"}` |
| `pattern_get_session_insights` | `pattern_insights` | `{operation: "session", sessionId: "..."}` |
| `pattern_analyze_project` | `pattern_analyze` | `{operation: "project"}` |
| `pattern_get_alerts` | `pattern_insights` | `{operation: "alerts"}` |
| `pattern_detection_status` | `pattern_analyze` | `{operation: "status"}` |
| `pattern_track_git_activity` | `pattern_analyze` | `{operation: "track", scope: "git"}` |
| `pattern_get_discovered` | `pattern_insights` | `{operation: "discovered"}` |
| `pattern_get_trends` | `pattern_insights` | `{operation: "trends"}` |
| `pattern_get_correlations` | `pattern_insights` | `{operation: "correlations"}` |
| `pattern_get_insights` | `pattern_insights` | `{operation: "insights"}` |
| `pattern_get_anomalies` | `pattern_insights` | `{operation: "anomalies"}` |
| `pattern_get_recommendations` | `pattern_insights` | `{operation: "recommendations"}` |
| `pattern_analyze_session` | `pattern_analyze` | `{operation: "analyze", scope: "session", sessionId: "..."}` |
| `pattern_analyze_commit` | `pattern_analyze` | `{operation: "analyze", scope: "commit", commitId: "..."}` |
| `pattern_get_performance` | `pattern_insights` | `{operation: "performance"}` |

### Usage Examples

**Before (Old Tools)**:
```typescript
// OLD: Call individual tool
await aidis.call('metrics_get_dashboard', {});
await aidis.call('pattern_detection_start', {});
```

**After (Consolidated Tools)**:
```typescript
// NEW: Call consolidated tool with operation
await aidis.call('metrics_analyze', { operation: 'dashboard' });
await aidis.call('pattern_analyze', { operation: 'start' });
```

---

## SUCCESS CRITERIA

### Code Quality ✅
- [ ] TypeScript compiles without errors
- [ ] No deprecated handler imports in codebase
- [ ] All case statements use consolidated tools
- [ ] Completion comments added for TT009-2 and TT009-3
- [ ] Code follows existing patterns (matches TT009-1)

### Tool Count ✅
- [ ] Exactly 52 tools available via HTTP endpoint
- [ ] Exactly 52 tools defined in toolDefinitions.ts
- [ ] Tool list matches AIDIS-tool-list.md exactly
- [ ] No deprecated tools accessible

### Functionality ✅
- [ ] All consolidated tools (8 total) are working
- [ ] Deprecated tools (34 total) return 404
- [ ] Feature parity verified for all use cases
- [ ] No functionality lost in consolidation
- [ ] Server starts without errors

### Documentation ✅
- [ ] CLAUDE.md updated to show 52 tools
- [ ] CLAUDE.md shows TT009 Phases 1, 2, 3 complete
- [ ] Migration guide created
- [ ] Archive README created
- [ ] Completion status documented

### Deployment ✅
- [ ] Server runs in production
- [ ] No errors in logs
- [ ] HTTP bridge working correctly
- [ ] stdio mock reports 52 tools
- [ ] All tests passing

---

## TIMELINE ESTIMATE

| Phase | Duration | Description |
|-------|----------|-------------|
| **Phase A** | 30 min | Preparation - git branch, backups, verification |
| **Phase B** | 1 hour | Remove metrics tools - code + testing |
| **Phase C** | 1 hour | Remove pattern tools - code + testing |
| **Phase D** | 30 min | Archive handlers |
| **Phase E** | 30 min | Update documentation |
| **Phase F** | 1 hour | Comprehensive testing & validation |
| **Phase G** | 30 min | Git commit & final documentation |
| **Buffer** | 30 min | Unexpected issues |
| **TOTAL** | **5.5 hours** | Complete implementation |

**Recommended Schedule**:
- Day 1 Morning: Phases A-C (3 hours)
- Day 1 Afternoon: Phases D-E (1 hour)
- Day 2 Morning: Phases F-G (1.5 hours)

---

## FINAL NOTES

### What Makes This Plan Different from Previous Attempts?

1. **Clear Scope**: Exact list of 34 tools to remove (not guessing)
2. **Verified Evidence**: Based on investigation reports, not assumptions
3. **Success Pattern**: Following TT009-1 which worked correctly
4. **Phased Approach**: Metrics first, then patterns, with validation at each step
5. **Comprehensive Testing**: Not just "does it compile" but "does it work"
6. **Rollback Ready**: Multiple recovery options if anything goes wrong

### Why This Will Work

1. **New Tools Already Exist**: Consolidated tools are already implemented and tested
2. **Clean Removal Pattern**: Following exact pattern from TT009-1 success
3. **Systematic Validation**: Testing after each phase, not just at the end
4. **Partner Review**: This plan will be reviewed before implementation
5. **No Guessing**: Every line number, every tool name, every verification step documented

### Critical Success Factors

1. **Follow the plan exactly** - don't skip verification steps
2. **Test after each phase** - catch issues early
3. **Keep backups** - git branch + backup files
4. **Verify tool count** - must be exactly 52 at the end
5. **Partner review** - get approval before executing

---

## APPENDIX: VERIFICATION SCRIPTS

### Script 1: Count All Tools
```bash
#!/bin/bash
# /tmp/count_tools.sh

echo "=== TOOL COUNT VERIFICATION ==="
echo ""

# Count in toolDefinitions.ts
DEF_COUNT=$(grep -c "name: '" /home/ridgetop/aidis/mcp-server/src/config/toolDefinitions.ts)
echo "Tools in toolDefinitions.ts: $DEF_COUNT"

# Count via HTTP endpoint
HTTP_COUNT=$(curl -s http://localhost:8080/mcp/tools/schemas | \
  python3 -c "import sys,json; print(len(json.load(sys.stdin)['tools']))")
echo "Tools via HTTP endpoint: $HTTP_COUNT"

# Expected count
EXPECTED=52
echo "Expected count: $EXPECTED"
echo ""

# Validation
if [ "$DEF_COUNT" -eq "$EXPECTED" ] && [ "$HTTP_COUNT" -eq "$EXPECTED" ]; then
  echo "✅ SUCCESS: Tool count is correct ($EXPECTED)"
  exit 0
else
  echo "❌ FAILURE: Tool count mismatch"
  exit 1
fi
```

### Script 2: Test Consolidated Tools
```bash
#!/bin/bash
# /tmp/test_consolidated_tools.sh

echo "=== TESTING CONSOLIDATED TOOLS ==="
echo ""

# Test Complexity (TT009-1)
echo "Testing complexity_analyze..."
curl -X POST http://localhost:8080/mcp/tools/complexity_analyze \
  -H "Content-Type: application/json" \
  -d '{"operation":"file","file":"test.ts"}' \
  -w "\nStatus: %{http_code}\n"

echo ""
echo "Testing complexity_insights..."
curl -X POST http://localhost:8080/mcp/tools/complexity_insights \
  -H "Content-Type: application/json" \
  -d '{"operation":"dashboard"}' \
  -w "\nStatus: %{http_code}\n"

echo ""
echo "Testing complexity_manage..."
curl -X POST http://localhost:8080/mcp/tools/complexity_manage \
  -H "Content-Type: application/json" \
  -d '{"operation":"track"}' \
  -w "\nStatus: %{http_code}\n"

# Test Metrics (TT009-2)
echo ""
echo "Testing metrics_collect..."
curl -X POST http://localhost:8080/mcp/tools/metrics_collect \
  -H "Content-Type: application/json" \
  -d '{"operation":"project"}' \
  -w "\nStatus: %{http_code}\n"

echo ""
echo "Testing metrics_analyze..."
curl -X POST http://localhost:8080/mcp/tools/metrics_analyze \
  -H "Content-Type: application/json" \
  -d '{"operation":"dashboard"}' \
  -w "\nStatus: %{http_code}\n"

echo ""
echo "Testing metrics_control..."
curl -X POST http://localhost:8080/mcp/tools/metrics_control \
  -H "Content-Type: application/json" \
  -d '{"operation":"start"}' \
  -w "\nStatus: %{http_code}\n"

# Test Pattern (TT009-3)
echo ""
echo "Testing pattern_analyze..."
curl -X POST http://localhost:8080/mcp/tools/pattern_analyze \
  -H "Content-Type: application/json" \
  -d '{"operation":"detect","scope":"commits"}' \
  -w "\nStatus: %{http_code}\n"

echo ""
echo "Testing pattern_insights..."
curl -X POST http://localhost:8080/mcp/tools/pattern_insights \
  -H "Content-Type: application/json" \
  -d '{"operation":"insights"}' \
  -w "\nStatus: %{http_code}\n"

echo ""
echo "✅ All consolidated tools tested"
```

### Script 3: Verify Deprecated Tools Are Gone
```bash
#!/bin/bash
# /tmp/verify_deprecated_gone.sh

echo "=== VERIFYING DEPRECATED TOOLS ARE INACCESSIBLE ==="
echo ""

# Test deprecated metrics
echo "Testing deprecated metrics tools (should return 404)..."
curl -X POST http://localhost:8080/mcp/tools/metrics_collect_project \
  -H "Content-Type: application/json" -d '{}' \
  -w "\nStatus: %{http_code}\n" 2>&1 | grep -q "Unknown tool" && echo "✅ metrics_collect_project: Gone" || echo "❌ metrics_collect_project: Still exists"

curl -X POST http://localhost:8080/mcp/tools/metrics_get_dashboard \
  -H "Content-Type: application/json" -d '{}' \
  -w "\nStatus: %{http_code}\n" 2>&1 | grep -q "Unknown tool" && echo "✅ metrics_get_dashboard: Gone" || echo "❌ metrics_get_dashboard: Still exists"

# Test deprecated pattern
echo ""
echo "Testing deprecated pattern tools (should return 404)..."
curl -X POST http://localhost:8080/mcp/tools/pattern_detection_start \
  -H "Content-Type: application/json" -d '{}' \
  -w "\nStatus: %{http_code}\n" 2>&1 | grep -q "Unknown tool" && echo "✅ pattern_detection_start: Gone" || echo "❌ pattern_detection_start: Still exists"

curl -X POST http://localhost:8080/mcp/tools/pattern_get_discovered \
  -H "Content-Type: application/json" -d '{}' \
  -w "\nStatus: %{http_code}\n" 2>&1 | grep -q "Unknown tool" && echo "✅ pattern_get_discovered: Gone" || echo "❌ pattern_get_discovered: Still exists"

echo ""
echo "✅ Verification complete"
```

---

**Plan Status**: Ready for Partner Review
**Next Action**: Review plan with partner, get approval, execute phases A-G
**Expected Outcome**: 52 tools, TT009 complete, clean codebase

**DO NOT IMPLEMENT THIS PLAN WITHOUT PARTNER APPROVAL**

---

*This plan was created systematically using evidence from:*
- *AIDIS_TOOL_INVESTIGATION_SUMMARY.md*
- *AIDIS_WIRED_TOOLS_INVESTIGATION_REPORT.md*
- *AIDIS-tool-list.md*
- *Direct code inspection and verification*
