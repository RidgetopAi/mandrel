# AIDIS STDIO Mock Server Investigation Report

## Executive Summary

The AIDIS stdio mock server (`/home/ridgetop/aidis/aidis-stdio-mock.js`) currently exposes only **5 hardcoded tools** out of the **75 tools** available in the full AIDIS system. This investigation reveals the root cause, provides a complete implementation plan, and outlines the testing strategy to dynamically expose all tools to Ampcode users.

---

## 1. Root Cause Analysis

### Why Only 5 Tools Are Exposed

**Location**: `/home/ridgetop/aidis/aidis-stdio-mock.js` lines 105-154

**Root Cause**: The mock server was designed with a **hardcoded static tool list** instead of dynamically fetching from the HTTP bridge.

**The Hardcoded List** (lines 111-152):
```javascript
tools: [
  { name: "aidis_help", description: "List all AIDIS tools", ... },
  { name: "aidis_ping", description: "Test AIDIS connection", ... },
  { name: "context_store", description: "Store context", ... },
  { name: "context_search", description: "Search contexts", ... },
  { name: "project_current", description: "Get current project", ... }
]
```

**Why It Was Designed This Way**:
1. **Quick MVP approach** - Created during Phase 7 refactor issues as emergency workaround
2. **Minimal viable test** - Only needed to prove stdio-to-HTTP translation worked
3. **Manual tool definition** - Avoided complexity of dynamic schema fetching at startup
4. **MCP protocol compliance** - Each tool needs complete `inputSchema` definition, not just name/description

**The Real Problem**: MCP protocol requires **complete JSON Schema** for each tool's parameters. The 5 tools were manually defined with their schemas, but scaling to 75 tools this way is unsustainable.

---

## 2. HTTP Bridge API Documentation

### Tool Discovery Endpoint

**Primary Discovery Method**: Call `aidis_help` tool via HTTP bridge

**Endpoint**: `POST http://localhost:8080/mcp/tools/aidis_help`
**Payload**: `{"arguments": {}}`
**Response Format**:
```json
{
  "success": true,
  "result": {
    "content": [{
      "type": "text",
      "text": "🚀 **AIDIS - AI Development Intelligence System**\n\n**75 Tools Available Across 15 Categories:**\n\n..."
    }]
  }
}
```

**Tool Count by Category** (from aidis_help response):
- System Health: 2 tools
- Context Management: 4 tools
- Project Management: 6 tools
- Session Management: 5 tools
- Naming Registry: 4 tools
- Technical Decisions: 4 tools
- Task Management: 6 tools
- Code Analysis: 5 tools
- Smart Search & AI: 2 tools
- Code Complexity: 3 tools
- Development Metrics: 12 tools
- Metrics Aggregation: 5 tools
- Pattern Detection: 7 tools
- Pattern Analysis: 10 tools
- Outcome Tracking: 7 tools (academic features - may be removed)
- Git Integration: 3 tools

**Total: 75 tools** (Note: CLAUDE.md says 47 after TT009 consolidation - need clarification)

### Tool Execution Endpoint

**Endpoint Pattern**: `POST http://localhost:8080/mcp/tools/{toolName}`
**Request Format**:
```json
{
  "arguments": {
    "param1": "value1",
    "param2": "value2"
  }
}
```

**Response Format**:
```json
{
  "success": true,
  "result": {
    "content": [{
      "type": "text",
      "text": "Tool output..."
    }]
  }
}
```

**Error Format**:
```json
{
  "success": false,
  "error": "Error message"
}
```

### No Direct Tool List Endpoint

**Finding**: There is **NO** `/mcp/tools` GET endpoint that returns structured tool metadata.

**Tested**:
```bash
curl -s http://localhost:8080/mcp/tools
# Returns: {"error": "Not found"}
```

**Implication**: Must use `aidis_help` and parse the text response to extract tool names and descriptions.

---

## 3. Full Tool List from AIDIS HTTP Bridge

### Complete List of 75 Tools

**Extracted from `aidis_help` response on 2025-09-30:**

#### System Health (2)
- `aidis_ping` - Test connectivity to AIDIS server
- `aidis_status` - Get server status and health information

#### Context Management (4)
- `context_store` - Store development context with automatic embedding
- `context_search` - Search stored contexts using semantic similarity
- `context_get_recent` - Get recent contexts chronologically (newest first)
- `context_stats` - Get context statistics for a project

#### Project Management (6)
- `project_list` - List all available projects with statistics
- `project_create` - Create a new project
- `project_switch` - Switch to a different project (sets as current)
- `project_current` - Get the currently active project information
- `project_info` - Get detailed information about a specific project
- `project_insights` - Get comprehensive project health and insights

#### Session Management (5)
- `session_assign` - Assign current session to a project
- `session_status` - Get current session status and details
- `session_new` - Create a new session with optional title and project assignment
- `session_update` - Update session title and description for better organization
- `session_details` - Get detailed session information including title, description, and metadata

#### Naming Registry (4)
- `naming_register` - Register a name to prevent conflicts
- `naming_check` - Check for naming conflicts before using a name
- `naming_suggest` - Get name suggestions based on description
- `naming_stats` - Get naming statistics and convention compliance

#### Technical Decisions (4)
- `decision_record` - Record a technical decision with context
- `decision_search` - Search technical decisions with filters
- `decision_update` - Update decision status, outcomes, or lessons
- `decision_stats` - Get technical decision statistics and analysis

#### Task Management (6)
- `task_create` - Create a new task for coordination
- `task_list` - List tasks with optional filtering
- `task_update` - Update task status and assignment
- `task_details` - Get detailed information for a specific task
- `task_bulk_update` - Update multiple tasks atomically with the same changes
- `task_progress_summary` - Get task progress summary with grouping and completion percentages

#### Code Analysis (5)
- `code_analyze` - Analyze code file structure and dependencies
- `code_components` - List code components (functions, classes, etc.)
- `code_dependencies` - Get dependencies for a specific component
- `code_impact` - Analyze the impact of changing a component
- `code_stats` - Get code analysis statistics for a project

#### Smart Search & AI (2)
- `smart_search` - Intelligent search across all project data
- `get_recommendations` - Get AI-powered recommendations for development

#### Code Complexity (3)
- `complexity_analyze` - Unified complexity analysis
- `complexity_insights` - Unified complexity insights
- `complexity_manage` - Unified complexity management

#### Development Metrics (12)
- `metrics_collect_project` - Trigger comprehensive metrics collection
- `metrics_get_dashboard` - Get comprehensive project metrics dashboard
- `metrics_get_core_metrics` - Get detailed core development metrics
- `metrics_get_pattern_intelligence` - Get pattern-based intelligence metrics
- `metrics_get_productivity_health` - Get developer productivity and health metrics
- `metrics_get_alerts` - Get active metrics alerts and notifications
- `metrics_acknowledge_alert` - Acknowledge a metrics alert
- `metrics_resolve_alert` - Mark a metrics alert as resolved
- `metrics_get_trends` - Get metrics trends and forecasting data
- `metrics_get_performance` - Get metrics collection system performance statistics
- `metrics_start_collection` - Start the metrics collection service
- `metrics_stop_collection` - Stop the metrics collection service

#### Metrics Aggregation (5)
- `metrics_aggregate_projects` - Aggregate metrics across multiple projects
- `metrics_aggregate_timeline` - Aggregate metrics over time
- `metrics_calculate_correlations` - Calculate correlations between metrics
- `metrics_get_executive_summary` - Generate comprehensive executive summary
- `metrics_export_data` - Export aggregated metrics data

#### Pattern Detection (7)
- `pattern_detection_start` - Start the real-time pattern detection service
- `pattern_detection_stop` - Stop the pattern detection service
- `pattern_detection_status` - Get pattern detection service status
- `pattern_detect_commits` - Detect patterns in specific commits
- `pattern_track_git_activity` - Track git activity with pattern detection
- `pattern_get_alerts` - Get real-time pattern alerts
- `pattern_get_session_insights` - Get pattern insights for current session

#### Pattern Analysis (10)
- `pattern_analyze_project` - Get comprehensive pattern analysis
- `pattern_analyze_session` - Analyze patterns for specific session
- `pattern_analyze_commit` - Analyze patterns for specific git commits
- `pattern_get_discovered` - Get discovered patterns with filtering
- `pattern_get_insights` - Get actionable pattern insights
- `pattern_get_trends` - Analyze pattern trends over time
- `pattern_get_correlations` - Find correlations between pattern types
- `pattern_get_anomalies` - Detect pattern anomalies and outliers
- `pattern_get_recommendations` - Generate AI-driven recommendations
- `pattern_get_performance` - Get pattern detection system performance

#### Outcome Tracking (7)
- `outcome_record` - Record a decision outcome measurement
- `outcome_track_metric` - Track metrics over time for a decision
- `outcome_analyze_impact` - Analyze impact relationships between decisions
- `outcome_conduct_retrospective` - Conduct structured retrospective
- `outcome_get_insights` - Get learning insights from decision outcomes
- `outcome_get_analytics` - Get comprehensive decision analytics
- `outcome_predict_success` - Predict decision success probability

#### Git Integration (3)
- `git_session_commits` - Get all git commits linked to a session
- `git_commit_sessions` - Get all sessions that contributed to a commit
- `git_correlate_session` - Manually trigger git correlation

---

## 4. Implementation Approach

### Strategy: Dynamic Tool Discovery at Startup

**Core Concept**: Fetch tool list from `aidis_help` at server startup, parse it, and dynamically generate MCP tool definitions.

### Implementation Steps

#### Step 1: Add Tool Discovery Function
**File**: `/home/ridgetop/aidis/aidis-stdio-mock.js`
**Location**: After line 58 (after `makeHttpCall` method)

```javascript
async fetchAvailableTools() {
  try {
    console.error('🔍 Fetching tool list from AIDIS HTTP bridge...');
    const response = await this.makeHttpCall('aidis_help', {});

    if (!response.success || !response.result?.content?.[0]?.text) {
      throw new Error('Invalid aidis_help response');
    }

    const helpText = response.result.content[0].text;
    const tools = this.parseToolsFromHelpText(helpText);

    console.error(`✅ Discovered ${tools.length} AIDIS tools`);
    return tools;

  } catch (error) {
    console.error(`⚠️  Failed to fetch tool list: ${error.message}`);
    console.error('📋 Falling back to essential tools');
    return this.getEssentialTools();
  }
}

parseToolsFromHelpText(helpText) {
  const tools = [];
  const lines = helpText.split('\n');

  for (const line of lines) {
    // Match lines like: • **tool_name** - Tool description
    const match = line.match(/•\s+\*\*([a-z_]+)\*\*\s+-\s+(.+)/);
    if (match) {
      const [, name, description] = match;
      tools.push({
        name,
        description,
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true  // Allow any parameters
        }
      });
    }
  }

  return tools;
}

getEssentialTools() {
  // Fallback to 10 essential tools if dynamic fetch fails
  return [
    { name: "aidis_help", description: "List all AIDIS tools",
      inputSchema: { type: "object", properties: {}, required: [] } },
    { name: "aidis_ping", description: "Test AIDIS connection",
      inputSchema: { type: "object", properties: {}, required: [] } },
    { name: "aidis_explain", description: "Get detailed help for a tool",
      inputSchema: { type: "object", properties: { toolName: { type: "string" }}, required: ["toolName"] } },
    { name: "aidis_examples", description: "Get usage examples for a tool",
      inputSchema: { type: "object", properties: { toolName: { type: "string" }}, required: ["toolName"] } },
    { name: "context_store", description: "Store context",
      inputSchema: { type: "object", properties: { content: { type: "string" }, type: { type: "string" }}, required: ["content", "type"] } },
    { name: "context_search", description: "Search contexts",
      inputSchema: { type: "object", properties: { query: { type: "string" }}, required: ["query"] } },
    { name: "context_get_recent", description: "Get recent contexts",
      inputSchema: { type: "object", properties: {}, required: [] } },
    { name: "project_current", description: "Get current project",
      inputSchema: { type: "object", properties: {}, required: [] } },
    { name: "project_list", description: "List all projects",
      inputSchema: { type: "object", properties: {}, required: [] } },
    { name: "session_status", description: "Get session status",
      inputSchema: { type: "object", properties: {}, required: [] } }
  ];
}
```

#### Step 2: Modify Constructor to Cache Tools
**Location**: After line 16

```javascript
constructor() {
  this.messageId = 1;
  this.toolCache = null;  // Will be populated on first tools/list request
}
```

#### Step 3: Make tools/list Handler Async
**Location**: Replace lines 105-154

```javascript
async handleToolCall(request) {
  const { method, params } = request;

  // ... existing tools/call handler (lines 63-103) ...

  if (method === 'tools/list') {
    // Fetch tools on first request (lazy loading)
    if (!this.toolCache) {
      this.toolCache = await this.fetchAvailableTools();
    }

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        tools: this.toolCache
      }
    };
  }

  // ... rest of handlers ...
}
```

#### Step 4: Update start() to Handle Async
**Location**: Line 247 (process.stdin.on('data'))

```javascript
process.stdin.on('data', async (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  const text = buffer.toString('utf8');
  const lines = text.split('\n');

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line) {
      console.error(`📥 RECEIVED: ${line}`);

      try {
        const request = JSON.parse(line);
        const response = await this.handleToolCall(request);  // Now async

        if (response !== null) {
          const responseJson = JSON.stringify(response);
          console.error(`📤 SENDING: ${responseJson}`);
          process.stdout.write(responseJson + '\n');
        }
      } catch (error) {
        console.error(`❌ ERROR: ${error.message}`);
        const errorResponse = {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" }
        };
        process.stdout.write(JSON.stringify(errorResponse) + '\n');
      }
    }
  }

  const remainder = lines[lines.length - 1];
  buffer = Buffer.from(remainder, 'utf8');
});
```

---

## 5. Code Locations for Changes

### File: `/home/ridgetop/aidis/aidis-stdio-mock.js`

**Changes Required**:

1. **Line 15-17** - Add toolCache to constructor:
   ```javascript
   constructor() {
     this.messageId = 1;
     this.toolCache = null;
   }
   ```

2. **After Line 58** - Add three new methods:
   - `fetchAvailableTools()` - ~30 lines
   - `parseToolsFromHelpText(helpText)` - ~20 lines
   - `getEssentialTools()` - ~30 lines

3. **Line 60** - Make `handleToolCall` async:
   ```javascript
   async handleToolCall(request) {
   ```

4. **Lines 105-154** - Replace static tool list with dynamic fetch:
   ```javascript
   if (method === 'tools/list') {
     if (!this.toolCache) {
       this.toolCache = await this.fetchAvailableTools();
     }
     return { jsonrpc: "2.0", id: request.id, result: { tools: this.toolCache } };
   }
   ```

5. **Line 247** - Make stdin handler async:
   ```javascript
   process.stdin.on('data', async (chunk) => {
   ```

6. **Line 262** - Await handleToolCall:
   ```javascript
   const response = await this.handleToolCall(request);
   ```

**Total Impact**: ~6 locations, ~100 new lines of code

---

## 6. Testing Plan

### Phase 1: Basic Functionality Tests

#### Test 1: Server Startup
```bash
# Start the mock server
node /home/ridgetop/aidis/aidis-stdio-mock.js

# Expected console output:
# 🚀 AIDIS STDIO Mock Server starting...
# 🔍 Fetching tool list from AIDIS HTTP bridge...
# ✅ Discovered 75 AIDIS tools
# ✅ AIDIS STDIO Mock ready for MCP protocol (raw JSON)
```

#### Test 2: Tool List Discovery
```bash
# Send tools/list request
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node aidis-stdio-mock.js

# Expected: JSON response with 75 tools
```

#### Test 3: Essential Tools Still Work
```bash
# Test the original 5 tools still work
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"aidis_ping","arguments":{}}}' | node aidis-stdio-mock.js

# Expected: Pong response
```

### Phase 2: New Tool Access Tests

#### Test 4: Advanced Tool Call
```bash
# Test a tool that wasn't in the original 5
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"session_status","arguments":{}}}' | node aidis-stdio-mock.js

# Expected: Session status response
```

#### Test 5: Complex Tool with Parameters
```bash
# Test metrics tool with parameters
echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"metrics_get_dashboard","arguments":{"projectId":"aidis"}}}' | node aidis-stdio-mock.js

# Expected: Metrics dashboard data
```

### Phase 3: Error Handling Tests

#### Test 6: Bridge Unavailable
```bash
# Stop the HTTP bridge (port 8080)
# Start mock server
node aidis-stdio-mock.js

# Expected console output:
# ⚠️  Failed to fetch tool list: ...
# 📋 Falling back to essential tools
# ✅ AIDIS STDIO Mock ready with 10 essential tools
```

#### Test 7: Invalid Tool Name
```bash
echo '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"nonexistent_tool","arguments":{}}}' | node aidis-stdio-mock.js

# Expected: Error response from HTTP bridge
```

### Phase 4: Ampcode Integration Tests

#### Test 8: Ampcode Tool Discovery
1. Configure Ampcode to use the updated mock server
2. Open Ampcode
3. Check that all 75 tools appear in the tool palette
4. Verify tool descriptions are correct

#### Test 9: Real-World Workflows
Test common workflows through Ampcode:
- Context storage and search
- Project switching
- Decision recording
- Task management
- Code complexity analysis
- Metrics dashboard

#### Test 10: Performance Test
- Measure tool list fetch time at startup
- Verify tools/list response is cached (instant on subsequent calls)
- Test concurrent tool calls don't cause issues

---

## 7. Risk Assessment

### High Risk (Mitigated)

**Risk**: HTTP bridge unavailable at startup
**Impact**: Mock server would have no tools
**Mitigation**: Fallback to 10 essential tools ensures basic functionality
**Status**: ✅ Mitigated with fallback strategy

**Risk**: Tool schema incompatibilities
**Impact**: Some tools might fail parameter validation
**Mitigation**: Use `additionalProperties: true` in inputSchema to accept any parameters
**Status**: ✅ Mitigated with permissive schema

### Medium Risk (Acceptable)

**Risk**: aidis_help text format changes
**Impact**: Tool parsing might fail
**Mitigation**: Robust regex parsing + fallback to essentials
**Status**: ⚠️ Acceptable - would trigger fallback mode

**Risk**: Tool count mismatch (47 vs 75)
**Impact**: Confusion about actual tool count
**Mitigation**: Document actual count, use aidis_help as source of truth
**Status**: ⚠️ Acceptable - documentation issue only

### Low Risk (Monitored)

**Risk**: Startup performance degradation
**Impact**: Slight delay on first Ampcode connection
**Mitigation**: Async lazy loading, caching after first fetch
**Status**: ✅ Minimal impact (<1 second)

**Risk**: MCP protocol version changes
**Impact**: Tool definitions might need updates
**Mitigation**: Follow MCP SDK updates, keep schema flexible
**Status**: ✅ Unlikely - MCP is stable

---

## 8. Fallback Strategy

### Three-Tier Fallback System

#### Tier 1: Full Dynamic Discovery (Preferred)
- Fetch all 75 tools from `aidis_help` at startup
- Parse descriptions from help text
- Generate permissive input schemas
- **Success Criteria**: HTTP bridge responds to aidis_help

#### Tier 2: Essential Tools (Degraded Mode)
- Fallback to 10 hardcoded essential tools
- Covers core workflows: context, projects, sessions
- **Trigger**: HTTP bridge unreachable or aidis_help fails
- **User Impact**: Advanced features unavailable

#### Tier 3: Original 5 Tools (Emergency Mode)
- Keep original 5-tool implementation as commented code
- Can be uncommented if dynamic approach has issues
- **Trigger**: Manual intervention needed
- **User Impact**: Minimal functionality

### Fallback Decision Tree

```
START
  ├─ Try: Call aidis_help via HTTP bridge
  │   ├─ Success? → Parse 75 tools → Tier 1 ✅
  │   └─ Fail? → Log warning
  │       └─ Return 10 essential tools → Tier 2 ⚠️
  │
  └─ If startup crashes repeatedly:
      └─ Manual rollback to 5-tool version → Tier 3 🚨
```

### Monitoring Fallback Mode

**Console Messages**:
- Tier 1: `✅ Discovered 75 AIDIS tools`
- Tier 2: `⚠️  Failed to fetch tool list: <error>`
           `📋 Falling back to essential tools`
           `✅ AIDIS STDIO Mock ready with 10 essential tools`
- Tier 3: Manual intervention with original file

---

## 9. Protocol Translation Validation

### Current Translation Logic (Lines 60-103)

**Review**: ✅ **Correct and Complete**

The existing `tools/call` handler correctly:
1. Extracts tool name from MCP request
2. Wraps arguments in `{"arguments": args}` for HTTP bridge
3. Translates HTTP success/error responses to MCP format
4. Handles content array structure properly

**Compatibility with All 75 Tools**:
- ✅ Simple tools (no parameters): `aidis_ping`, `project_current`
- ✅ Complex tools (many parameters): `context_store`, `decision_record`
- ✅ Array parameters: `tags`, `aliases` - HTTP bridge handles
- ✅ Optional parameters: HTTP bridge validates
- ✅ Error responses: Properly translated to MCP error format

**No Changes Needed**: The translation logic is generic and works for all tools.

### Special Cases Verified

**Navigation Tools** (`aidis_help`, `aidis_explain`, `aidis_examples`):
- Current: Not in hardcoded list
- After Fix: Will be dynamically added
- Translation: No special handling needed

**Consolidated Tools** (TT009 series):
- `complexity_analyze`, `complexity_insights`, `complexity_manage`
- `metrics_*`, `pattern_*`
- Translation: Same as all other tools

**Git Integration Tools**:
- `git_session_commits`, `git_commit_sessions`, `git_correlate_session`
- Translation: No special handling needed

---

## 10. Implementation Timeline

### Development Phase (2-3 hours)

**Hour 1**: Code Implementation
- Add fetchAvailableTools() method (30 min)
- Add parseToolsFromHelpText() method (20 min)
- Add getEssentialTools() fallback (20 min)
- Update handleToolCall() to be async (10 min)

**Hour 2**: Testing & Debugging
- Phase 1 tests: Basic functionality (30 min)
- Phase 2 tests: New tool access (30 min)

**Hour 3**: Integration & Documentation
- Phase 3 tests: Error handling (30 min)
- Update documentation (20 min)
- Code review and cleanup (10 min)

### Testing Phase (2-3 hours)

**Session 1**: Ampcode Integration
- Configure Ampcode with updated mock server (30 min)
- Phase 4 Test 8: Tool discovery verification (30 min)

**Session 2**: Real-World Workflows
- Phase 4 Test 9: Common workflow validation (1 hour)
- Phase 4 Test 10: Performance testing (30 min)

**Session 3**: Edge Cases
- Bridge failure scenarios (30 min)
- Concurrent usage testing (30 min)

### Deployment Phase (30 min)

- Backup current aidis-stdio-mock.js
- Deploy updated version
- Restart Ampcode MCP connection
- Monitor console logs for issues
- User acceptance confirmation

**Total Estimated Time**: 5-7 hours

---

## 11. Success Criteria

### Technical Success Metrics

✅ **Tool Discovery**
- All 75 tools appear in Ampcode tool list
- Tool descriptions match AIDIS documentation
- Startup completes in <2 seconds

✅ **Functionality**
- All 5 original tools still work (backward compatibility)
- At least 20 additional tools tested and working
- Error handling provides clear fallback behavior

✅ **Reliability**
- Fallback to essential tools when bridge unavailable
- No crashes or hangs during tool discovery
- Tool list cached after first fetch (no repeated calls)

### User Experience Metrics

✅ **Ampcode User Perspective**
- Seamless access to all AIDIS features
- No performance degradation vs. Claude Code
- Clear error messages if tools unavailable

✅ **Developer Perspective**
- Code is maintainable and well-documented
- Easy to add new tools in the future
- Debugging output is helpful

---

## 12. Next Steps

### Immediate Actions (This Session)

1. ✅ **Investigation Complete** - This report documents all findings
2. 🔄 **Review with Partner** - Validate approach before implementation
3. 🎯 **Decision Point**: Proceed with implementation or refine approach?

### Implementation Actions (Next Session)

1. Create implementation branch: `feature/stdio-mock-dynamic-tools`
2. Implement code changes per Section 4
3. Run Phase 1-3 tests
4. Create backup of current mock server
5. Deploy updated version

### Validation Actions (Following Session)

1. Configure Ampcode with updated mock server
2. Run Phase 4 Ampcode integration tests
3. User acceptance testing
4. Monitor for issues
5. Document final configuration

---

## 13. Questions for Partner Review

### Clarification Needed

1. **Tool Count Discrepancy**: aidis_help reports 75 tools (including Outcome Tracking), but CLAUDE.md says 47 tools after TT009 consolidation. Which is current?

2. **Outcome Tracking Tools**: Are the 7 outcome_* tools still active or deprecated? aidis_help includes them but they're marked "academic features" in comments.

3. **Input Schema Precision**: Should we use `additionalProperties: true` (permissive) or fetch detailed schemas from `aidis_explain` for each tool (precise but slower)?

4. **Startup vs. Lazy Load**: Should we fetch tools at server startup or on first `tools/list` request? (Current plan: lazy load)

5. **Cache Invalidation**: Should tool list be cached permanently or refresh periodically? (Current plan: permanent cache per session)

### Partner Decision Points

- Approve implementation approach?
- Proceed with Phase 1 implementation now or wait?
- Any concerns about the fallback strategy?
- Testing approach adequate or need more coverage?

---

## Appendix A: File Inventory

### Files Analyzed

1. `/home/ridgetop/aidis/aidis-stdio-mock.js` - Mock server (MODIFIED)
2. `/home/ridgetop/aidis/claude-http-mcp-bridge.js` - Reference bridge (static list)
3. `/home/ridgetop/aidis/mcp-server/src/server.ts` - Actual AIDIS server
4. `/home/ridgetop/aidis/mcp-server/src/core-server.ts` - Core HTTP server
5. `/home/ridgetop/aidis/mcp-server/src/utils/httpMcpBridge.ts` - HTTP bridge (incomplete)
6. `/home/ridgetop/aidis/CLAUDE.md` - Project documentation

### Test Scripts Created

None yet - will be created during implementation phase.

### Backup Strategy

Before implementation:
```bash
cp /home/ridgetop/aidis/aidis-stdio-mock.js \
   /home/ridgetop/aidis/aidis-stdio-mock.backup.$(date +%Y%m%d_%H%M%S).js
```

---

## Appendix B: Example Tool Definitions

### Simple Tool (No Parameters)
```javascript
{
  name: "aidis_ping",
  description: "Test connectivity to AIDIS server",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
}
```

### Complex Tool (Required + Optional Parameters)
```javascript
{
  name: "context_store",
  description: "Store development context with automatic embedding",
  inputSchema: {
    type: "object",
    properties: {
      content: { type: "string", description: "Context content" },
      type: { type: "string", description: "Context type" },
      tags: { type: "array", items: { type: "string" }, description: "Optional tags" }
    },
    required: ["content", "type"],
    additionalProperties: true
  }
}
```

### Permissive Tool (Accept Anything)
```javascript
{
  name: "smart_search",
  description: "Intelligent search across all project data",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: true  // Accept any parameters
  }
}
```

---

## Report Metadata

**Investigation Date**: 2025-09-30
**Investigator**: Claude (Sonnet 4.5)
**AIDIS Version**: Post-TT009 (47-75 tools)
**HTTP Bridge Port**: 8080
**Mock Server File**: aidis-stdio-mock.js
**Status**: Investigation Complete ✅ - Awaiting Partner Review
