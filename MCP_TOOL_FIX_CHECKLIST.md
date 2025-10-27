# MCP Tool Sync Fix - Implementation Checklist

**File:** `/home/ridgetop/aidis/claude-http-mcp-bridge.js`
**Time:** 5 minutes
**Goal:** Reduce from 49 tools (27.5k tokens) to 41 tools (12.3k tokens)

---

## PRE-FLIGHT CHECK

- [ ] Verify server is running and healthy
  ```bash
  curl -s http://localhost:8080/mcp/tools/schemas | grep -o '"count":[0-9]*'
  # Should show: "count":41
  ```

- [ ] Verify current bridge tool count
  ```bash
  grep -c "{ name:" /home/ridgetop/aidis/claude-http-mcp-bridge.js
  # Should show: 49 (before fix)
  ```

- [ ] Backup bridge file (optional but recommended)
  ```bash
  cp /home/ridgetop/aidis/claude-http-mcp-bridge.js /home/ridgetop/aidis/claude-http-mcp-bridge.js.backup
  ```

---

## IMPLEMENTATION STEPS

### Step 1: Delete Code Analysis Tools (5 tools)

- [ ] Open `/home/ridgetop/aidis/claude-http-mcp-bridge.js`
- [ ] Find section: `// Code Analysis (5 tools)` (around line 80)
- [ ] Delete these 5 lines:
  - [ ] `{ name: 'code_analyze', ... },`
  - [ ] `{ name: 'code_components', ... },`
  - [ ] `{ name: 'code_dependencies', ... },`
  - [ ] `{ name: 'code_impact', ... },`
  - [ ] `{ name: 'code_stats', ... },`

### Step 2: Delete Code Complexity Tools (3 tools)

- [ ] Find section: `// Code Complexity (3 consolidated tools - TT009-1)` (around line 91)
- [ ] Delete these 3 lines:
  - [ ] `{ name: 'complexity_analyze', ... },`
  - [ ] `{ name: 'complexity_insights', ... },`
  - [ ] `{ name: 'complexity_manage', ... },`

### Step 3: Delete Git Integration Tools (3 tools)

- [ ] Find section: `// Git Integration (3 tools)` (around line 107)
- [ ] Delete these 3 lines:
  - [ ] `{ name: 'git_session_commits', ... },`
  - [ ] `{ name: 'git_commit_sessions', ... },`
  - [ ] `{ name: 'git_correlate_session', ... }`

### Step 4: Add Navigation Tools (3 tools)

- [ ] Find line: `{ name: 'aidis_status', ... },` (around line 37)
- [ ] After aidis_status, before Context Management section, add:
  ```javascript
  // Navigation Tools (3 tools)
  { name: 'aidis_help', description: 'Display categorized list of all AIDIS tools' },
  { name: 'aidis_explain', description: 'Get detailed help for a specific AIDIS tool' },
  { name: 'aidis_examples', description: 'Get usage examples and patterns for a specific AIDIS tool' },
  ```

### Step 5: Save and Verify File

- [ ] Save the file
- [ ] Verify new tool count
  ```bash
  grep -c "{ name:" /home/ridgetop/aidis/claude-http-mcp-bridge.js
  # Should now show: 41
  ```

- [ ] Verify disabled tools removed
  ```bash
  grep "{ name: '" /home/ridgetop/aidis/claude-http-mcp-bridge.js | grep -E "(code_|complexity_|git_)"
  # Should return: (no results)
  ```

- [ ] Verify navigation tools added
  ```bash
  grep "{ name: '" /home/ridgetop/aidis/claude-http-mcp-bridge.js | grep -E "(aidis_help|aidis_explain|aidis_examples)"
  # Should show all 3 navigation tools
  ```

---

## RESTART CLAUDE CODE

- [ ] Completely quit Claude Code Desktop
  - Windows: File → Exit
  - Mac: Cmd+Q
  - Linux: Close all windows and kill process if needed

- [ ] Reopen Claude Code Desktop

- [ ] Wait for MCP server connection (check status bar)

---

## VERIFICATION

### Check Tool Count in Claude Code

- [ ] Open Claude Code
- [ ] Type `/context` or check MCP context menu
- [ ] Verify shows: **41 tools** (not 49)
- [ ] Verify shows: **~12.3k tokens** (not ~27.5k)

### Test Navigation Tools

- [ ] Run: `aidis_help`
  - Should display categorized tool list

- [ ] Run: `aidis_explain context_store`
  - Should show detailed help for context_store

- [ ] Run: `aidis_examples context_store`
  - Should show usage examples

### Test Existing Tools Still Work

- [ ] Run: `aidis_ping`
  - Should return: "Pong! AIDIS is running..."

- [ ] Run: `project_current`
  - Should show current project info

- [ ] Run: `context_store(content: "Test fix verification", type: "code")`
  - Should successfully store context

### Verify Disabled Tools Are Gone

- [ ] Try: `code_analyze`
  - Should show: Tool not found or unavailable

- [ ] Try: `complexity_insights`
  - Should show: Tool not found or unavailable

- [ ] Try: `git_session_commits`
  - Should show: Tool not found or unavailable

---

## TROUBLESHOOTING

### If tool count is still 49:

- [ ] Verify file was saved correctly
- [ ] Check if Claude Code is using a different bridge file
  ```bash
  cat /home/ridgetop/.config/claude-desktop/config.json | grep "args"
  # Should show: ["claude-http-mcp-bridge.js"]
  ```
- [ ] Restart Claude Code again (complete quit + reopen)
- [ ] Check if multiple Claude Code instances are running

### If tools don't work after fix:

- [ ] Verify AIDIS server is still running
  ```bash
  curl -s http://localhost:8080/mcp/tools/aidis_ping
  # Should return success response
  ```
- [ ] Check bridge process is running
  ```bash
  ps aux | grep claude-http-mcp-bridge | grep -v grep
  # Should show node process running bridge
  ```
- [ ] Check Claude Code logs for errors
- [ ] Restore backup and try again

### If syntax errors in bridge file:

- [ ] Check all lines end with commas (except last tool in array)
- [ ] Verify no duplicate tool names
- [ ] Ensure proper JSON formatting
- [ ] Run Node.js syntax check:
  ```bash
  node -c /home/ridgetop/aidis/claude-http-mcp-bridge.js
  # Should show: (no output = syntax OK)
  ```

---

## ROLLBACK PROCEDURE

If anything goes wrong, restore the backup:

```bash
# Restore backup
cp /home/ridgetop/aidis/claude-http-mcp-bridge.js.backup /home/ridgetop/aidis/claude-http-mcp-bridge.js

# Restart Claude Code
# Verify you're back to 49 tools
```

---

## SUCCESS CONFIRMATION

When ALL these are true, the fix is complete:

✅ Bridge file has exactly 41 tool definitions
✅ Claude Code shows 41 tools at ~12.3k tokens
✅ Navigation tools work (aidis_help, aidis_explain, aidis_examples)
✅ Existing tools still work normally (aidis_ping, project_current, etc.)
✅ Disabled tools are unavailable (code_*, complexity_*, git_*)
✅ No errors in Claude Code MCP connection
✅ Token savings: 15,200 tokens (55% reduction achieved)

---

## NEXT STEPS AFTER SUCCESS

- [ ] Update CLAUDE.md to reflect successful 41-tool optimization
- [ ] Mark TT009 Phases 2-3 as FULLY COMPLETE
- [ ] Store completion context in AIDIS
  ```
  context_store(
    content: "Successfully synchronized MCP bridge with server optimization. Bridge now exposes 41 tools instead of 49, achieving 55% token reduction (15,200 tokens saved). Navigation tools (aidis_help, aidis_explain, aidis_examples) now available in Claude Code.",
    type: "completion",
    tags: ["TT009", "token-optimization", "mcp-bridge", "synchronization"]
  )
  ```
- [ ] Consider implementing dynamic tool fetching for long-term maintainability (see investigation report)

---

**Ready to implement?** Start with Pre-Flight Check, then work through steps sequentially.
**Estimated time:** 5 minutes
**Risk level:** LOW (easily reversible with backup)
