# AMP-MCP CONNECTION DEBUG REPORT
**Date**: 2025-09-28  
**Issue**: Amp stdio connection to AIDIS broken after session changes  
**Status**: CRITICAL - Multiple sessions debugging for hours  

---

## PROBLEM STATEMENT

**Symptom**: Amp can't connect to AIDIS via MCP stdio
- Error: `tool "mcp__aidis__aidis_ping" not found`  
- Error: `tool "mcp__aidis__aidis_help" not found`
- All AIDIS MCP tools unavailable to Amp

**Timeline**: Working before this session, broken after changes made tonight

---

## CHANGES MADE IN THIS SESSION (Potential Culprits)

### 1. **PHANTOM TOOL FIX** (Early Session) ⚠️ HIGH SUSPECT
- **What**: Deployed subagent to "fix AIDIS server phantom tool list"
- **Changed**: Modified `mcp-server/src/server.ts` tool registration
- **Impact**: Could have broken core MCP tool listing/registration
- **Evidence**: Tool count went from 96→45 tools

### 2. **STDOUT REDIRECTION CODE** ⚠️ CRITICAL SUSPECT  
- **What**: Git pull (16 commits) introduced stdout hijacking code
- **Location**: Top of `mcp-server/src/server.ts` lines 3-5
- **Code**: 
  ```typescript
  const FORCE_STDIO_SAFE = process.env.AMP_CONNECTING === 'true' || process.env.AIDIS_FORCE_STDIO === 'true';
  if (FORCE_STDIO_SAFE) {
    // Redirects console output to stderr
  ```
- **Why Critical**: MCP stdio REQUIRES stdout for communication frames
- **Fix Applied**: Disabled by setting `FORCE_STDIO_SAFE = false`
- **Status**: Fix may need server restart or deeper correction

### 3. **EMBEDDING DIMENSION SCHEMA CHANGE**
- **What**: Database schema changed from 1536 to 384 dimensions
- **Impact**: Could affect server startup if embedding initialization fails
- **Files**: Database embedding table structure

### 4. **DATABASE PERSISTENCE MIGRATION**
- **What**: Added session_project_mappings table for restart persistence
- **Impact**: New database dependency during startup
- **Files**: Migration 017, ProjectHandler changes

### 5. **GIT PULL - 16 COMMITS** ⚠️ MAJOR SUSPECT
- **What**: Pulled massive refactor with 16 commits of changes
- **Scope**: Complete system overhaul including MCP server changes
- **Evidence**: Brought back semantic embedding page, Oracle refactor phases
- **Risk**: Could have changed MCP protocol, dependencies, or startup requirements

---

## TECHNICAL ANALYSIS

### MCP Configuration Analysis
- **Amp settings**: Uses different config than Claude Code (settings.json vs .mcp.json)
- **Connection method**: Direct stdio to AIDIS MCP server
- **Expected command**: `npx tsx src/server.ts` from `/home/ridgetop/aidis/mcp-server/`

### Server Status Analysis
- **Server running**: ✅ AIDIS process active (PID confirmed)
- **Health endpoint**: ✅ `curl localhost:8080/healthz` works
- **Logs normal**: ✅ No obvious startup errors
- **Tool registration**: ❌ Tools not found by Amp

### Error Pattern Analysis
```
Error: tool "mcp__aidis__aidis_ping" not found
Error: tool "mcp__aidis__aidis_help" not found
```
- **Pattern**: All AIDIS tools missing, not just specific ones
- **Meaning**: Complete MCP tool registration failure, not individual tool issues
- **Implication**: Core MCP protocol communication broken

---

## ROOT CAUSE HYPOTHESES (Priority Order)

### 1. **STDOUT CORRUPTION** (Most Likely)
- **Cause**: Stdout redirection code from git pull  
- **Mechanism**: MCP stdio frames corrupted/redirected to stderr
- **Evidence**: Code specifically mentions "Reserve stdout for MCP frames"
- **Status**: Attempted fix by disabling, may need complete removal

### 2. **TOOL REGISTRATION BROKEN** (High Likelihood)
- **Cause**: Phantom tool fix modified core tool list incorrectly
- **Mechanism**: Tools not properly registered during server initialization
- **Evidence**: Tool count changed dramatically (96→45)
- **Impact**: Amp sees no tools registered

### 3. **MCP PROTOCOL CHANGE** (Medium Likelihood)  
- **Cause**: 16 commits included MCP protocol updates
- **Mechanism**: Different MCP SDK version or protocol requirements
- **Evidence**: Massive refactor included protocol changes
- **Impact**: Amp using old protocol, server using new

### 4. **DEPENDENCY/ENVIRONMENT MISMATCH** (Lower Likelihood)
- **Cause**: Latest version requires different Node/env setup
- **Mechanism**: Missing environment variables or wrong Node version
- **Evidence**: New config loading from `/config/environments/`

---

## DIAGNOSTIC STEPS COMPLETED

1. **✅ Disabled stdout redirection** in server.ts
2. **✅ Restarted server** with `./restart-aidis.sh`
3. **✅ Verified server health** endpoint working
4. **✅ Confirmed server process running**
5. **❌ Still no MCP tool recognition**

---

## NEXT STEPS FOR NEW SESSION

### Immediate Debugging Actions

1. **Test Tool Registration Directly**:
   ```bash
   cd /home/ridgetop/aidis/mcp-server
   npx tsx -e "
   import { Server } from '@modelcontextprotocol/sdk/server/index.js';
   const server = new Server({name: 'test'}, {capabilities: {}});
   console.log('MCP SDK loaded');
   "
   ```

2. **Check Tool List in Server**:
   - Look for `ListToolsRequestSchema` handler in server.ts
   - Verify tool registration array is correct
   - Check if tool names changed

3. **Inspect Latest Version Changes**:
   ```bash
   git diff 1881c89..HEAD mcp-server/src/server.ts | grep -A10 -B10 "tool"
   ```

4. **Test Different Startup Methods**:
   - Try `npx tsx src/server.ts` (direct)
   - Try `npm run dev` (watch mode)
   - Try with environment variables
   - Try with `--inspect` flag for debugging

### Potential Quick Fixes

1. **Complete Stdout Removal**:
   ```typescript
   // Remove entire FORCE_STDIO_SAFE block from server.ts lines 1-20
   ```

2. **Environment Variable Check**:
   ```bash
   export AMP_CONNECTING=false
   export AIDIS_FORCE_STDIO=false
   unset AMP_CONNECTING
   unset AIDIS_FORCE_STDIO
   ```

3. **Revert Tool Changes**:
   - Check if phantom tool fix broke tool registration
   - Restore original tool list if needed

4. **Use Clean MCP Server**:
   - Try `core-server.ts` instead of `server.ts`
   - Use bridge connection temporarily

---

## SESSION WORK STATUS

### Completed Tonight (Safely Stashed)
- **✅ Priority 1**: Session naming functionality complete
- **✅ Priority 2**: Session analytics with MCP sessions  
- **✅ Emergency fixes**: localStorage project selector, agent session details
- **✅ Updated AGENTS.md**: Corrected tool counts

### Oracle Session Investigation
- **Status**: Based on old version (now invalid)
- **Context**: Saved in ORACLE-SESSION-INVESTIGATION.md
- **Tasks**: TS001-TS008 created and completed
- **Note**: May need fresh Oracle review with latest version

---

## GIT SITUATION RESOLVED

### What Happened
- **Issue**: Local branch 16 commits behind origin
- **Cause**: Previous session did `git reset` to "pre-refactor-baseline-2025-09-12"  
- **Recovery**: Successfully pulled latest version ✅
- **Result**: All missing work restored (semantic embedding, settings, etc.)

### Work Status
- **✅ Latest version**: All missing features back
- **✅ Our work**: Safely stashed as "Session Analytics Work - Priority 1&2 Complete"
- **✅ Recovery**: Can reapply stashed work if needed

---

## DEBUGGING CHECKLIST FOR NEW SESSION

### Critical Questions to Answer
1. **What exact tool names** does the latest server register?
2. **Did tool names change** in the 16 commits?
3. **Is the stdout redirection** completely removed/disabled?
4. **Are there new environment requirements** for the latest version?
5. **Does Amp's MCP config need updating** for the new version?

### Files to Investigate
- **Primary**: `mcp-server/src/server.ts` - tool registration
- **Secondary**: `mcp-server/src/core-server.ts` - alternate server
- **Config**: `config/environments/.env.development` - new config system
- **Bridge**: `claude-http-mcp-bridge.js` - working tool list (42 tools)

### Success Criteria
- **✅ MCP tools found**: `mcp__aidis__aidis_ping` works
- **✅ Tool list accessible**: `mcp__aidis__aidis_help` shows tool catalog
- **✅ Full functionality**: All AIDIS tools available to Amp

---

## FINAL NOTES

**Key Insight**: The stdout redirection code was **specifically designed** to handle Amp connections (`AMP_CONNECTING=true`) but ironically **broke Amp stdio communication**. This is likely the root cause.

**Success Path**: Remove stdout hijacking completely + verify tool registration matches expected names.

**Fallback**: If direct server fails, the HTTP bridge (`claude-http-mcp-bridge.js`) is working with 42 tools and could be used temporarily.

**Recovery State**: All work saved, system recovered, need MCP connection fix to continue.

---

**End of Debug Report** - Good luck with the fresh session! 🎯
