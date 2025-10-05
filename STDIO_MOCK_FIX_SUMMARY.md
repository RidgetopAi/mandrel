# AIDIS STDIO Mock Server - Quick Fix Summary

## The Problem

```
Current State:     Ampcode (stdio) → Mock Server → HTTP Bridge (8080) → AIDIS
                                     ↑
                          Only exposes 5 tools
                          (hardcoded in lines 111-152)

Desired State:     Ampcode (stdio) → Mock Server → HTTP Bridge (8080) → AIDIS
                                     ↑
                          Exposes all 75 tools
                          (fetched dynamically from aidis_help)
```

## The Solution

### 3 Functions to Add

```javascript
// 1. Fetch tool list from HTTP bridge
async fetchAvailableTools() {
  const response = await this.makeHttpCall('aidis_help', {});
  const tools = this.parseToolsFromHelpText(response.result.content[0].text);
  return tools;  // Returns array of 75 tool definitions
}

// 2. Parse tool names and descriptions from help text
parseToolsFromHelpText(helpText) {
  // Match lines: • **tool_name** - Tool description
  const regex = /•\s+\*\*([a-z_]+)\*\*\s+-\s+(.+)/;
  // Returns: [{name, description, inputSchema}]
}

// 3. Fallback if HTTP bridge unavailable
getEssentialTools() {
  return [/* 10 essential tools */];
}
```

### 2 Lines to Change

```javascript
// OLD (line 60):
handleToolCall(request) {

// NEW (line 60):
async handleToolCall(request) {


// OLD (lines 105-154):
if (method === 'tools/list') {
  return { tools: [/* hardcoded 5 tools */] };
}

// NEW (lines 105-110):
if (method === 'tools/list') {
  if (!this.toolCache) {
    this.toolCache = await this.fetchAvailableTools();
  }
  return { tools: this.toolCache };
}
```

## Before vs After

### Before (Current)

```bash
$ echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node aidis-stdio-mock.js

# Response: 5 tools
{
  "tools": [
    {"name": "aidis_help", ...},
    {"name": "aidis_ping", ...},
    {"name": "context_store", ...},
    {"name": "context_search", ...},
    {"name": "project_current", ...}
  ]
}
```

### After (Fixed)

```bash
$ echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node aidis-stdio-mock.js

# Console Output:
🔍 Fetching tool list from AIDIS HTTP bridge...
✅ Discovered 75 AIDIS tools

# Response: 75 tools
{
  "tools": [
    {"name": "aidis_ping", ...},
    {"name": "aidis_status", ...},
    {"name": "context_store", ...},
    {"name": "context_search", ...},
    {"name": "context_get_recent", ...},
    {"name": "project_list", ...},
    {"name": "session_status", ...},
    {"name": "metrics_get_dashboard", ...},
    {"name": "complexity_analyze", ...},
    {"name": "pattern_analyze_project", ...},
    ... (65 more tools)
  ]
}
```

## Impact

### For Ampcode Users
- ✅ Access to **all 75 AIDIS tools** (up from 5)
- ✅ Feature parity with Claude Code
- ✅ No performance impact (cached after first fetch)
- ✅ Automatic fallback if HTTP bridge down

### For Developers
- ✅ **No manual tool registration** - auto-discovered
- ✅ Easy to add new tools (just add to AIDIS server)
- ✅ Maintainable code (~100 new lines vs 1000s)
- ✅ Production-ready error handling

## Testing Checklist

```bash
# 1. Basic startup
node aidis-stdio-mock.js
# Expected: "✅ Discovered 75 AIDIS tools"

# 2. Tool list discovery
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node aidis-stdio-mock.js
# Expected: JSON with 75 tools

# 3. Original tools still work
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"aidis_ping","arguments":{}}}' | node aidis-stdio-mock.js
# Expected: Pong response

# 4. New tools now accessible
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"metrics_get_dashboard","arguments":{}}}' | node aidis-stdio-mock.js
# Expected: Metrics dashboard data

# 5. Fallback works
# Stop HTTP bridge, restart mock server
node aidis-stdio-mock.js
# Expected: "⚠️  Failed to fetch tool list: ..."
#           "📋 Falling back to essential tools"
```

## Implementation Time

- **Coding**: 1 hour
- **Testing**: 1 hour
- **Ampcode Integration**: 1 hour
- **Total**: ~3 hours

## Files Changed

- `/home/ridgetop/aidis/aidis-stdio-mock.js` (~100 new lines, 6 modifications)

## Risk Level

**LOW** ✅

- Fallback ensures basic functionality if fetch fails
- Existing tool call translation unchanged (proven to work)
- Backward compatible (original 5 tools still work)
- Can rollback to backup in 30 seconds

## Success Metrics

✅ All 75 tools appear in Ampcode
✅ Tool calls work correctly
✅ Startup completes in <2 seconds
✅ Fallback activates when bridge down
✅ Zero crashes or hangs

## Next Step

Partner decides:
1. **Proceed with implementation** → Create branch, code, test
2. **Request clarifications** → Answer questions from full report
3. **Alternative approach** → Discuss different strategy

---

**Full Investigation Report**: `/home/ridgetop/aidis/STDIO_MOCK_INVESTIGATION_REPORT.md`
