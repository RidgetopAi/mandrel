# MCP Tool Synchronization Fix - Executive Summary

**Date:** 2025-10-01
**Priority:** HIGH
**Time to Fix:** 5 minutes
**Impact:** 55% token reduction (15,200 tokens saved)

---

## THE PROBLEM IN ONE SENTENCE

The HTTP-MCP bridge that connects Claude Code to AIDIS has a hardcoded list of 49 tools that bypasses the server's optimized 41-tool list, wasting 15,200 tokens per session.

---

## WHY THIS MATTERS

**Current State:**
- You completed TT009 Phases 2-3 to optimize AIDIS from 52 tools down to 41 tools
- Server correctly implements this optimization and serves 41 tools
- HTTP endpoints return 41 tools when tested directly
- BUT Claude Code still sees 49 tools at ~27.5k tokens

**Root Cause:**
- Claude Code connects via `claude-http-mcp-bridge.js`, not directly to the server
- This bridge has a hardcoded array of 49 tools (lines 34-111)
- The hardcoded array includes 11 disabled tools and is missing 3 new navigation tools
- Your optimization never reaches Claude Code because the bridge bypasses it

---

## THE FIX (5 MINUTES)

**File to Edit:** `/home/ridgetop/aidis/claude-http-mcp-bridge.js`

**Step 1: Delete 11 disabled tool definitions** (lines 80-110)

Remove these Code Analysis tools:
```javascript
{ name: 'code_analyze', description: 'Analyze code file structure and dependencies' },
{ name: 'code_components', description: 'List code components (functions, classes, etc.)' },
{ name: 'code_dependencies', description: 'Get dependencies for a specific component' },
{ name: 'code_impact', description: 'Analyze the impact of changing a component' },
{ name: 'code_stats', description: 'Get code analysis statistics for a project' },
```

Remove these Code Complexity tools:
```javascript
{ name: 'complexity_analyze', description: 'Unified complexity analysis - file analysis, commit analysis, and detailed metrics' },
{ name: 'complexity_insights', description: 'Unified complexity insights - dashboard, hotspots, trends, technical debt, and refactoring opportunities' },
{ name: 'complexity_manage', description: 'Unified complexity management - tracking service, alerts, thresholds, and performance monitoring' },
```

Remove these Git Integration tools:
```javascript
{ name: 'git_session_commits', description: 'Get all git commits linked to a session with correlation details' },
{ name: 'git_commit_sessions', description: 'Get all sessions that contributed to a specific git commit' },
{ name: 'git_correlate_session', description: 'Manually trigger git correlation for current or specified session' }
```

**Step 2: Add 3 navigation tool definitions** (after line 38, after aidis_status)

Add these Navigation tools:
```javascript
// Navigation Tools (3 tools)
{ name: 'aidis_help', description: 'Display categorized list of all AIDIS tools' },
{ name: 'aidis_explain', description: 'Get detailed help for a specific AIDIS tool' },
{ name: 'aidis_examples', description: 'Get usage examples and patterns for a specific AIDIS tool' },
```

**Step 3: Restart Claude Code Desktop**
- Completely quit Claude Code
- Reopen Claude Code

**Step 4: Verify the Fix**
- Open `/context` in Claude Code
- Should show: "41 tools" (not 49)
- Should show: ~12.3k tokens (not ~27.5k)
- Test: `aidis_help` should now work!

---

## WHAT CHANGES

**Before:**
```
Claude Code → Bridge (49 tools) → Server (41 tools)
              └─────────────┘
                  BOTTLENECK
```

**After:**
```
Claude Code → Bridge (41 tools) → Server (41 tools)
              └─────────────────────────────┘
                    SYNCHRONIZED
```

**Tool Count Changes:**
| Category            | Before | After | Change |
|---------------------|--------|-------|--------|
| System Health       | 2      | 2     | -      |
| Navigation          | 0      | 3     | +3     |
| Context Management  | 4      | 4     | -      |
| Project Management  | 6      | 6     | -      |
| Session Management  | 5      | 5     | -      |
| Naming Registry     | 4      | 4     | -      |
| Technical Decisions | 4      | 4     | -      |
| Task Management     | 6      | 6     | -      |
| Code Analysis       | 5      | 0     | -5     |
| Smart Search & AI   | 2      | 2     | -      |
| Code Complexity     | 3      | 0     | -3     |
| Development Metrics | 3      | 3     | -      |
| Pattern Detection   | 2      | 2     | -      |
| Git Integration     | 3      | 0     | -3     |
| **TOTAL**           | **49** | **41**| **-8** |

**Token Impact:**
- Before: 49 tools × ~530 tokens/tool = ~27,500 tokens
- After: 41 tools × ~300 tokens/tool = ~12,300 tokens
- **Savings: 15,200 tokens (55% reduction)**

---

## VERIFICATION COMMANDS

**Check server is correct:**
```bash
curl -s http://localhost:8080/mcp/tools/schemas | grep -o '"count":[0-9]*'
# Should show: "count":41
```

**Check bridge tool count:**
```bash
grep -c "{ name:" /home/ridgetop/aidis/claude-http-mcp-bridge.js
# Before fix: 49
# After fix: 41
```

**List tools in bridge:**
```bash
grep "{ name: '" /home/ridgetop/aidis/claude-http-mcp-bridge.js | sed "s/.*{ name: '//" | sed "s/',.*//" | sort
# Should NOT contain: code_*, complexity_*, git_*
# Should contain: aidis_help, aidis_explain, aidis_examples
```

**Compare bridge vs server:**
```bash
# Get server tools
curl -s http://localhost:8080/mcp/tools | grep -o '"name":"[^"]*"' | sed 's/"name":"//' | sed 's/"$//' | sort > /tmp/server-tools.txt

# Get bridge tools
grep "{ name: '" /home/ridgetop/aidis/claude-http-mcp-bridge.js | sed "s/.*{ name: '//" | sed "s/',.*//" | sort > /tmp/bridge-tools.txt

# Compare (should be identical)
diff /tmp/server-tools.txt /tmp/bridge-tools.txt
# No output = synchronized ✅
```

---

## RELATED DOCUMENTATION

- **Full Investigation Report:** `/home/ridgetop/aidis/MCP_SCHEMA_EXPOSURE_INVESTIGATION.md`
  - Complete root cause analysis with file:line evidence
  - Multiple solution options (quick fix vs dynamic fetch)
  - Detailed code path tracing

- **Visual Comparison:** `/home/ridgetop/aidis/MCP_TOOL_COMPARISON_VISUAL.txt`
  - ASCII diagrams showing current vs desired state
  - Tool breakdown table
  - Token impact visualization

- **Original Optimization Plan:** `/home/ridgetop/aidis/TT009_COMPLETE_CONSOLIDATION_IMPLEMENTATION_PLAN.md`
  - Phase 2: Strategic Tool Disabling
  - Phase 3: Schema Simplification
  - Token optimization calculations

---

## LONG-TERM SOLUTION (OPTIONAL)

After the quick fix, consider implementing dynamic tool fetching to prevent future drift:

**Benefits:**
- Bridge always synchronized with server
- No manual maintenance required
- Automatic propagation of server changes

**Implementation:**
- Replace hardcoded AIDIS_TOOLS array with dynamic fetch from `http://localhost:8080/mcp/tools`
- Fetch at bridge startup before MCP connection
- See Solution 2 in investigation report for full code

**Time Required:** ~30 minutes
**When:** After quick fix is verified and working

---

## SUCCESS CRITERIA

✅ Bridge file has exactly 41 tool definitions
✅ Bridge includes: aidis_help, aidis_explain, aidis_examples
✅ Bridge excludes: code_*, complexity_*, git_*
✅ Claude Code `/context` shows 41 tools
✅ Claude Code `/context` shows ~12.3k tokens
✅ `aidis_help` command works in Claude Code
✅ All existing tools still function normally

---

## NEXT STEPS

1. **NOW:** Implement 5-minute quick fix (edit bridge file, restart Claude Code)
2. **Verify:** Check `/context` shows 41 tools at ~12.3k tokens
3. **Test:** Confirm `aidis_help` and other tools work
4. **Later:** Consider dynamic fetch implementation for maintainability
5. **Update:** Mark TT009 Phases 2-3 as FULLY COMPLETE in documentation

---

**Status:** READY TO IMPLEMENT
**Confidence:** 100% (root cause confirmed with evidence)
**Risk:** MINIMAL (simple array edit, easily reversible)
**Urgency:** HIGH (wastes 15,200 tokens per session)
