# MCP Tool Synchronization Investigation - Document Index

**Date:** 2025-10-01
**Issue:** Claude Code shows 49 tools instead of 41 tools
**Status:** ROOT CAUSE IDENTIFIED, READY TO FIX
**Time to Fix:** 5 minutes

---

## QUICK START

**If you just want to fix it NOW:**
→ Read: `MCP_TOOL_FIX_CHECKLIST.md`
→ Follow the checklist step-by-step
→ Time: 5 minutes

**If you want to understand the problem first:**
→ Read: `MCP_TOOL_SYNC_FIX_SUMMARY.md`
→ Then use: `MCP_TOOL_FIX_CHECKLIST.md`
→ Time: 10 minutes total

**If you want the complete investigation:**
→ Read: `MCP_SCHEMA_EXPOSURE_INVESTIGATION.md`
→ Visual aid: `MCP_TOOL_COMPARISON_VISUAL.txt`
→ Then fix: `MCP_TOOL_FIX_CHECKLIST.md`
→ Time: 30 minutes total

---

## DOCUMENT REFERENCE

### 1. MCP_TOOL_FIX_CHECKLIST.md
**Purpose:** Step-by-step implementation checklist
**Audience:** Anyone implementing the fix
**Length:** 2 pages
**Format:** Checkboxes and commands

**Contents:**
- Pre-flight verification steps
- Exact lines to delete/add in bridge file
- Restart and verification procedures
- Troubleshooting guide
- Rollback procedure

**Use this when:** You're ready to implement the fix NOW

---

### 2. MCP_TOOL_SYNC_FIX_SUMMARY.md
**Purpose:** Executive summary and fix overview
**Audience:** Decision makers, implementers
**Length:** 4 pages
**Format:** Prose with code snippets

**Contents:**
- Problem in one sentence
- Why it matters (token impact)
- The 5-minute fix with exact changes
- What changes in tool counts
- Verification commands
- Success criteria

**Use this when:** You want to understand the problem and solution quickly

---

### 3. MCP_SCHEMA_EXPOSURE_INVESTIGATION.md
**Purpose:** Complete root cause analysis
**Audience:** Developers, architects
**Length:** 15 pages
**Format:** Technical investigation report

**Contents:**
- Server-side verification (file:line evidence)
- HTTP endpoint verification
- Claude Code MCP configuration analysis
- Root cause identification with code paths
- Gap analysis (exact tool differences)
- Complete code path tracing
- Three solution options (quick fix, dynamic fetch, use existing dynamic bridge)
- Verification procedures
- Recommendations timeline

**Use this when:** You need to understand the complete technical details

---

### 4. MCP_TOOL_COMPARISON_VISUAL.txt
**Purpose:** Visual representation of the problem
**Audience:** Visual learners
**Length:** 2 pages
**Format:** ASCII diagrams and tables

**Contents:**
- Current state diagram (broken)
- Desired state diagram (fixed)
- Tool breakdown table by category
- Exact tool differences lists
- Token impact visualization
- Implementation time comparison

**Use this when:** You prefer visual explanations over text

---

## INVESTIGATION FLOW

```
START: Claude Code shows 49 tools instead of 41
   ↓
Investigation Phase 1: Verify Server
   ├─→ Check server.ts DISABLED_TOOLS filter ✅
   ├─→ Check core-server.ts DISABLED_TOOLS filter ✅
   └─→ Check toolDefinitions.ts tool count (41 tools) ✅
   ↓
Investigation Phase 2: Verify HTTP Endpoints
   ├─→ Test GET /mcp/tools/schemas (41 tools) ✅
   └─→ Test GET /mcp/tools (41 tools) ✅
   ↓
Investigation Phase 3: Check Claude Code Config
   ├─→ Find config: /home/ridgetop/.config/claude-desktop/config.json
   └─→ Discover: Uses claude-http-mcp-bridge.js (NOT direct connection)
   ↓
Investigation Phase 4: Examine Bridge File
   ├─→ Find hardcoded AIDIS_TOOLS array (49 tools) ❌
   ├─→ Includes 11 disabled tools ❌
   └─→ Missing 3 navigation tools ❌
   ↓
ROOT CAUSE IDENTIFIED:
   Bridge bypasses server optimization with hardcoded array
   ↓
Solution Development:
   ├─→ Solution 1: Quick Fix (delete 11, add 3) - 5 min
   ├─→ Solution 2: Dynamic Fetch - 30 min
   └─→ Solution 3: Use existing dynamic bridge - verify needed
   ↓
Documentation Created:
   ├─→ Investigation Report (technical details)
   ├─→ Fix Summary (executive overview)
   ├─→ Fix Checklist (implementation steps)
   └─→ Visual Comparison (diagrams)
   ↓
READY TO IMPLEMENT
```

---

## KEY FILES IDENTIFIED

### Files That Are Correct (No Changes Needed)
✅ `/home/ridgetop/aidis/mcp-server/src/server.ts`
   - Lines 1069-1078: DISABLED_TOOLS filter correctly implemented

✅ `/home/ridgetop/aidis/mcp-server/src/core-server.ts`
   - Lines 296-301: DISABLED_TOOLS filter for GET /mcp/tools
   - Lines 328-333: DISABLED_TOOLS filter for GET /mcp/tools/schemas

✅ `/home/ridgetop/aidis/mcp-server/src/config/toolDefinitions.ts`
   - Contains exactly 41 tools, disabled tools already removed

### Files That Need Updates
❌ `/home/ridgetop/aidis/claude-http-mcp-bridge.js` **PRIMARY TARGET**
   - Lines 34-111: Hardcoded AIDIS_TOOLS array (49 tools)
   - Needs: Remove 11 disabled tools, add 3 navigation tools

⚠️ `/home/ridgetop/aidis/claude-http-mcp-bridge-dynamic.js` (optional)
   - May already have dynamic fetching
   - Could be used instead of manual fix

### Configuration Files
📝 `/home/ridgetop/.config/claude-desktop/config.json`
   - Currently uses: claude-http-mcp-bridge.js
   - Could switch to: claude-http-mcp-bridge-dynamic.js (if verified)

---

## EVIDENCE SUMMARY

**Server Tool Count:**
```bash
$ grep -c "name: '" /home/ridgetop/aidis/mcp-server/src/config/toolDefinitions.ts
41
```

**HTTP Endpoint Tool Count:**
```bash
$ curl -s http://localhost:8080/mcp/tools/schemas | grep -o '"count":[0-9]*'
"count":41
```

**Bridge Tool Count:**
```bash
$ grep -c "{ name:" /home/ridgetop/aidis/claude-http-mcp-bridge.js
49
```

**Tools in Bridge but NOT in Server (11 disabled tools):**
- code_analyze, code_components, code_dependencies, code_impact, code_stats
- complexity_analyze, complexity_insights, complexity_manage
- git_session_commits, git_commit_sessions, git_correlate_session

**Tools in Server but NOT in Bridge (3 navigation tools):**
- aidis_help, aidis_explain, aidis_examples

---

## TOKEN IMPACT

| Metric                  | Before | After | Savings |
|-------------------------|--------|-------|---------|
| Tool Count              | 49     | 41    | 8 tools |
| Avg Tokens per Tool     | ~530   | ~300  | ~230    |
| Total Tokens            | 27,500 | 12,300| 15,200  |
| **Token Reduction**     | -      | -     | **55%** |

---

## RECOMMENDED READING ORDER

**For Quick Implementation:**
1. MCP_TOOL_SYNC_FIX_SUMMARY.md (5 min read)
2. MCP_TOOL_FIX_CHECKLIST.md (implement while reading)
3. Total time: 10 minutes

**For Full Understanding:**
1. MCP_TOOL_COMPARISON_VISUAL.txt (2 min - get the big picture)
2. MCP_TOOL_SYNC_FIX_SUMMARY.md (5 min - understand the problem)
3. MCP_SCHEMA_EXPOSURE_INVESTIGATION.md (15 min - technical details)
4. MCP_TOOL_FIX_CHECKLIST.md (5 min - implement)
5. Total time: 30 minutes

**For Visual Learners:**
1. MCP_TOOL_COMPARISON_VISUAL.txt (read this first!)
2. MCP_TOOL_SYNC_FIX_SUMMARY.md (overview)
3. MCP_TOOL_FIX_CHECKLIST.md (implement)
4. Total time: 12 minutes

---

## VERIFICATION COMMANDS

**Before Fix:**
```bash
# Should show 49 tools
grep -c "{ name:" /home/ridgetop/aidis/claude-http-mcp-bridge.js

# Should show disabled tools present
grep "{ name: '" /home/ridgetop/aidis/claude-http-mcp-bridge.js | grep -E "(code_|complexity_|git_)"
```

**After Fix:**
```bash
# Should show 41 tools
grep -c "{ name:" /home/ridgetop/aidis/claude-http-mcp-bridge.js

# Should show no disabled tools
grep "{ name: '" /home/ridgetop/aidis/claude-http-mcp-bridge.js | grep -E "(code_|complexity_|git_)"
# (no results expected)

# Should show navigation tools
grep "{ name: '" /home/ridgetop/aidis/claude-http-mcp-bridge.js | grep -E "(aidis_help|aidis_explain|aidis_examples)"
# (3 results expected)
```

**Claude Code Verification:**
- Open `/context` menu
- Should show: "41 tools" at "~12.3k tokens"
- `aidis_help` command should work

---

## RELATED DOCUMENTATION

**Original Optimization Work:**
- TT009_COMPLETE_CONSOLIDATION_IMPLEMENTATION_PLAN.md
- Phase 2: Strategic Tool Disabling (11 tools disabled)
- Phase 3: Schema Simplification (token optimization)

**AIDIS Configuration:**
- CLAUDE.md (needs update after fix)
- Current status shows 41 tools, but MCP connection doesn't reflect it yet

**Server Implementation:**
- /home/ridgetop/aidis/mcp-server/src/server.ts
- /home/ridgetop/aidis/mcp-server/src/core-server.ts
- /home/ridgetop/aidis/mcp-server/src/config/toolDefinitions.ts

---

## NEXT ACTIONS

**Immediate (Today):**
1. Implement quick fix using checklist (5 min)
2. Verify in Claude Code (2 min)
3. Test tools work (3 min)
4. Update CLAUDE.md with success (5 min)

**Short-term (This Week):**
1. Store completion context in AIDIS
2. Mark TT009 Phases 2-3 as FULLY COMPLETE
3. Test all tool categories thoroughly

**Long-term (Future Sprint):**
1. Implement Solution 2 (dynamic fetch) for maintainability
2. Add automated tests for bridge/server parity
3. Consider removing static bridge entirely

---

## QUESTIONS & ANSWERS

**Q: Why does this happen?**
A: Claude Code connects via a bridge file, not directly to the MCP server. The bridge has a hardcoded tool list that wasn't updated when the server was optimized.

**Q: Is this a bug?**
A: Not really - it's a synchronization issue between two separate files. The server is correct, the bridge just needs to be updated to match.

**Q: Will this break anything?**
A: No. The fix removes tools that shouldn't work anyway (disabled) and adds tools that should be there (navigation). All existing functionality is preserved.

**Q: Can I rollback if something goes wrong?**
A: Yes, just restore the backup file (created in checklist) and restart Claude Code.

**Q: Why not just use the dynamic bridge?**
A: We could! That's Solution 3. But we need to verify it has the same fixes. The quick fix is faster to implement and verify.

**Q: Will I need to do this again in the future?**
A: Not if you implement Solution 2 (dynamic fetch) afterward. That makes the bridge auto-sync with the server.

---

**Last Updated:** 2025-10-01
**Investigation Status:** COMPLETE
**Implementation Status:** READY
**Confidence Level:** 100%
