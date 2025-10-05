# TS006-2 Token Counting Implementation - Investigation Report

**Date:** 2025-09-30
**Investigator:** Claude Code Agent
**Status:** Investigation Complete - Ready for Implementation

---

## Executive Summary

This investigation traces the complete implementation path for adding token usage tracking to sessions for monitoring AI interaction costs. The implementation requires changes across 5 layers: database schema, MCP server session tracking, MCP tool responses, backend API, and frontend display.

**Key Finding:** Token counting will need to be **manually tracked** at the MCP server level since MCP protocol responses do not automatically include token usage data. The implementation will track tokens per tool call and aggregate them at the session level.

---

## Current Architecture

### 1. Sessions Table Schema

**Location:** `/home/ridgetop/aidis/mcp-server/database/migrations/002_create_contexts_and_sessions.sql`

**Current Schema (Lines 13-26):**
```sql
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    agent_type VARCHAR(50) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    context_summary TEXT,
    tokens_used INTEGER DEFAULT 0,  -- ⚠️ EXISTS but NOT CURRENTLY TRACKED
    metadata JSONB DEFAULT '{}'::jsonb,

    CONSTRAINT reasonable_session_duration
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);
```

**Recent Additions (Migrations 017-021):**
- Migration 017: Added `title` and `description` fields
- Migration 019: Added `status` enum and `last_activity_at` for timeout tracking
- Migration 020: Added `display_id` for human-readable session IDs

**Critical Discovery:** The `tokens_used` column **already exists** but is:
- Set to 0 in line 171 of `sessionTracker.ts`: `tokens_used = $2` with value `0`
- Has TODO comment: `// TODO: Track actual tokens used if available`

### 2. SessionTracker Service Flow

**Location:** `/home/ridgetop/aidis/mcp-server/src/services/sessionTracker.ts`

**Key Methods:**

1. **startSession** (Lines 55-131)
   - Creates session record with `tokens_used = 0`
   - Sets metadata with agent detection info
   - Logs to analytics_events table

2. **endSession** (Lines 136-232)
   - Updates session with final stats (Line 163: `tokens_used = $2` with value `0`)
   - Calculates duration and productivity metrics
   - **Does NOT currently track tokens**

3. **recordOperation** (Lines 316-345)
   - Records individual operations in analytics_events
   - Updates session activity timestamp
   - **No token tracking mechanism**

4. **getSessionData** (Lines 377-476)
   - Retrieves session metrics from analytics_events
   - Returns SessionData interface (Lines 21-36)
   - **Does NOT include token fields**

### 3. MCP Response Format Analysis

**Critical Finding:** After examining MCP SDK types (`/home/ridgetop/aidis/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/cjs/types.d.ts`):

**ResultSchema (Lines 166-184):**
```typescript
export declare const ResultSchema: z.ZodObject<{
    _meta: z.ZodOptional<z.ZodObject<{}, "passthrough", ...>>
}, "passthrough", ...>
```

**Analysis:**
- MCP protocol defines `_meta` field as optional passthrough object
- **No built-in token usage tracking in MCP protocol v2025-06-18**
- The `_meta` field can contain arbitrary metadata
- Token data must be **manually tracked and added** by the server

**Implication:** We need to implement custom token tracking logic that:
1. Estimates or tracks tokens per tool call
2. Stores token data in tool response `_meta` field (optional)
3. Aggregates tokens in session record
4. Returns token totals in session_status and session details

### 4. Session Status Tool Implementation

**Location:** `/home/ridgetop/aidis/mcp-server/src/handlers/sessionAnalytics.ts`

**Current Implementation (Lines 634-700):**

```typescript
static async getSessionStatus(): Promise<{
  success: boolean;
  session?: any;
  message: string;
}> {
  // Query (Lines 650-664)
  const result = await db.query(`
    SELECT
      s.id,
      s.agent_type,
      s.started_at,
      s.ended_at,
      s.project_id,
      p.name as project_name,
      s.metadata,
      COALESCE((SELECT COUNT(*) FROM contexts c WHERE c.session_id = s.id), 0) as contexts_count,
      COALESCE((SELECT COUNT(*) FROM technical_decisions td WHERE td.session_id = s.id), 0) as decisions_count
    FROM sessions s
    LEFT JOIN projects p ON s.project_id = p.id
    WHERE s.id = $1
  `, [activeSessionId]);

  // Response (Lines 678-689)
  return {
    success: true,
    session: {
      id: session.id,
      type: session.agent_type,
      started_at: session.started_at,
      project_name: session.project_name || 'No project assigned',
      duration_minutes: Math.round(duration / 60000),
      contexts_created: parseInt(session.contexts_count),
      decisions_created: parseInt(session.decisions_count),
      metadata: session.metadata || {}
    },
    message: `Current session: ${session.id.substring(0, 8)}...`
  };
}
```

**Display in server.ts (Lines ~4738-4754):**
```typescript
const statusText = `📋 Current Session Status\n\n` +
  `🆔 Session ID: ${session.id.substring(0, 8)}...\n` +
  `🏷️  Type: ${session.type}\n` +
  `🏢 Project: ${session.project_name}\n` +
  `⏰ Started: ${new Date(session.started_at).toLocaleString()}\n` +
  `⏱️  Duration: ${session.duration_minutes} minutes\n` +
  `📝 Contexts: ${session.contexts_created}\n` +
  `🎯 Decisions: ${session.decisions_created}\n` +
  // NO TOKEN DISPLAY
```

### 5. Frontend Display Structure

**Location:** `/home/ridgetop/aidis/aidis-command/frontend/src/pages/Sessions.tsx`

**Current Table Columns (Lines 160-252):**
1. Session (title, type, description)
2. Project (project_name)
3. Created (started_at timestamp)
4. Activity (context_count badge)
5. Last Activity (last_context_at)
6. Actions (view/edit buttons)

**Session Interface:** `/home/ridgetop/aidis/aidis-command/frontend/src/types/session.ts`
```typescript
export interface Session extends SessionEntity {
  project_name?: string;
  session_type?: string;
  context_count?: number;
  last_context_at?: string;
  // NO TOKEN FIELDS
}
```

**Backend API Route:** `/home/ridgetop/aidis/aidis-command/backend/src/routes/sessions.ts`
- Line 103: `router.get('/token-patterns', SessionController.getTokenUsagePatterns);`
- **Token patterns route exists but not connected to session display**

---

## Implementation Path

### Step 1: Database Migration - Add Token Columns

**File:** `/home/ridgetop/aidis/mcp-server/database/migrations/023_add_session_token_tracking.sql`

**Action:** CREATE NEW MIGRATION (do not modify existing)

```sql
-- Migration 023: Add comprehensive token tracking to sessions
-- TS006-2: Token Usage Tracking for Cost Monitoring
-- Date: 2025-09-30

-- Step 1: Add granular token columns
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS input_tokens BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS output_tokens BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tokens BIGINT DEFAULT 0;

-- Step 2: Migrate existing tokens_used to total_tokens
UPDATE sessions
SET total_tokens = COALESCE(tokens_used, 0)
WHERE total_tokens = 0;

-- Step 3: Add check constraints for data integrity
ALTER TABLE sessions
ADD CONSTRAINT tokens_non_negative CHECK (
  input_tokens >= 0 AND
  output_tokens >= 0 AND
  total_tokens >= 0
);

ALTER TABLE sessions
ADD CONSTRAINT tokens_sum_valid CHECK (
  total_tokens >= input_tokens AND
  total_tokens >= output_tokens
);

-- Step 4: Create index for token analytics queries
CREATE INDEX IF NOT EXISTS idx_sessions_token_usage
ON sessions(total_tokens DESC)
WHERE total_tokens > 0;

-- Step 5: Add column comments
COMMENT ON COLUMN sessions.input_tokens IS
'Total input tokens consumed across all MCP tool calls in this session';

COMMENT ON COLUMN sessions.output_tokens IS
'Total output tokens generated across all MCP tool calls in this session';

COMMENT ON COLUMN sessions.total_tokens IS
'Total tokens (input + output) for cost tracking. May include cached tokens.';

-- Step 6: Verification
SELECT
  COUNT(*) as total_sessions,
  SUM(total_tokens) as total_tokens_tracked,
  AVG(total_tokens) as avg_tokens_per_session,
  MAX(total_tokens) as max_session_tokens
FROM sessions;
```

**Why BIGINT:** Token counts can exceed INTEGER max (2.1B) for long-running sessions or batch operations.

### Step 2: Update SessionTracker Service

**File:** `/home/ridgetop/aidis/mcp-server/src/services/sessionTracker.ts`

#### 2A. Update SessionData Interface (Line 21)

```typescript
export interface SessionData {
  session_id: string;
  start_time: Date;
  end_time?: Date;
  duration_ms?: number;
  project_id?: string;
  title?: string;
  description?: string;
  contexts_created: number;
  decisions_created: number;
  operations_count: number;
  productivity_score: number;
  success_status: 'active' | 'completed' | 'abandoned';
  status: 'active' | 'inactive' | 'disconnected';
  last_activity_at?: Date;
  // TS006-2: Token tracking fields
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}
```

#### 2B. Add Token Tracking Method (New, after line 345)

```typescript
/**
 * TS006-2: Record token usage for a tool call within a session
 */
static async recordTokenUsage(
  sessionId: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  try {
    const totalTokens = inputTokens + outputTokens;

    console.log(`🪙 Recording token usage: ${sessionId.substring(0, 8)}... (+${inputTokens} in, +${outputTokens} out, +${totalTokens} total)`);

    const sql = `
      UPDATE sessions
      SET
        input_tokens = input_tokens + $1,
        output_tokens = output_tokens + $2,
        total_tokens = total_tokens + $3,
        last_activity_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND status = 'active'
      RETURNING input_tokens, output_tokens, total_tokens
    `;

    const result = await db.query(sql, [inputTokens, outputTokens, totalTokens, sessionId]);

    if (result.rows.length > 0) {
      const updated = result.rows[0];
      console.log(`✅ Token totals updated: ${updated.total_tokens} total (${updated.input_tokens} in, ${updated.output_tokens} out)`);
    }

  } catch (error) {
    console.error('❌ Failed to record token usage:', error);
    // Don't throw - token tracking failures shouldn't break functionality
  }
}
```

#### 2C. Update endSession Method (Line 160)

**Replace lines 160-184:**
```typescript
// Update the sessions table with end time and stats
const updateSessionSql = `
  UPDATE sessions
  SET ended_at = $1,
      context_summary = $2,
      metadata = metadata || $3::jsonb
  WHERE id = $4
  RETURNING input_tokens, output_tokens, total_tokens
`;

const sessionUpdateParams = [
  endTime,
  `Session completed with ${contextsCreated} contexts created`,
  JSON.stringify({
    end_time: endTime.toISOString(),
    duration_ms: durationMs,
    contexts_created: contextsCreated,
    operations_count: sessionData.operations_count,
    productivity_score: sessionData.productivity_score,
    completed_by: 'aidis-session-tracker'
  }),
  sessionId
];

const updateResult = await db.query(updateSessionSql, sessionUpdateParams);
const tokenData = updateResult.rows[0] || { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
```

#### 2D. Update getSessionData Method (Line 377)

**Add after line 455 (before return statement):**
```typescript
// TS006-2: Get token usage from sessions table
const tokenSql = `
  SELECT input_tokens, output_tokens, total_tokens
  FROM sessions
  WHERE id = $1
`;

const tokenResult = await db.query(tokenSql, [sessionId]);
const tokens = tokenResult.rows[0] || { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

return {
  session_id: sessionId,
  start_time: startTime,
  end_time: endTime,
  duration_ms: durationMs,
  project_id: projectId,
  contexts_created: contextsCreated,
  decisions_created: decisionsCreated,
  operations_count: operationsCount,
  productivity_score: productivityScore,
  success_status: successStatus,
  status: !endTime ? 'active' : 'inactive',
  last_activity_at: undefined,
  // TS006-2: Include token data
  input_tokens: parseInt(tokens.input_tokens) || 0,
  output_tokens: parseInt(tokens.output_tokens) || 0,
  total_tokens: parseInt(tokens.total_tokens) || 0
};
```

### Step 3: Integrate Token Tracking in MCP Server

**File:** `/home/ridgetop/aidis/mcp-server/src/server.ts`

#### 3A. Add Token Estimation Function (After imports, ~line 150)

```typescript
/**
 * TS006-2: Estimate token usage for a tool call
 * Uses rough heuristics until actual LLM API integration
 */
function estimateTokenUsage(toolName: string, args: any, result: any): {
  input: number;
  output: number;
} {
  // Rough estimation: 1 token ≈ 4 characters
  const CHARS_PER_TOKEN = 4;

  // Estimate input tokens from tool name + arguments
  const inputText = toolName + JSON.stringify(args);
  const inputTokens = Math.ceil(inputText.length / CHARS_PER_TOKEN);

  // Estimate output tokens from result content
  let outputText = '';
  if (result.content && Array.isArray(result.content)) {
    outputText = result.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join(' ');
  }
  const outputTokens = Math.ceil(outputText.length / CHARS_PER_TOKEN);

  return {
    input: Math.max(inputTokens, 10), // Minimum 10 tokens per call
    output: Math.max(outputTokens, 5)  // Minimum 5 tokens per response
  };
}
```

#### 3B. Update executeToolOperation Method (Find around line 736)

**After `const toolResult = await this.executeToolOperation(...)` line:**

```typescript
const toolResult = await this.executeToolOperation(tool, validationResult.data || {});

// TS006-2: Track token usage for this tool call
try {
  const activeSessionId = await SessionTracker.getActiveSession();
  if (activeSessionId) {
    const tokenEstimate = estimateTokenUsage(tool, args, toolResult);
    await SessionTracker.recordTokenUsage(
      activeSessionId,
      tokenEstimate.input,
      tokenEstimate.output
    );

    // Optionally add token info to response _meta
    if (!toolResult._meta) {
      toolResult._meta = {};
    }
    toolResult._meta.tokenUsage = {
      inputTokens: tokenEstimate.input,
      outputTokens: tokenEstimate.output,
      totalTokens: tokenEstimate.input + tokenEstimate.output,
      estimatedCost: ((tokenEstimate.input * 0.003) + (tokenEstimate.output * 0.015)) / 1000 // Claude pricing
    };
  }
} catch (tokenError) {
  console.error('⚠️  Token tracking failed:', tokenError);
  // Don't fail the request if token tracking fails
}

console.debug(
  'Tool call completed:',
  JSON.stringify(toolResult),
  'for params:',
  JSON.stringify(args)
);
```

### Step 4: Update Session Status Tool

**File:** `/home/ridgetop/aidis/mcp-server/src/handlers/sessionAnalytics.ts`

#### 4A. Update getSessionStatus Query (Line 650)

```typescript
const result = await db.query(`
  SELECT
    s.id,
    s.agent_type,
    s.started_at,
    s.ended_at,
    s.project_id,
    p.name as project_name,
    s.metadata,
    s.input_tokens,
    s.output_tokens,
    s.total_tokens,
    COALESCE((SELECT COUNT(*) FROM contexts c WHERE c.session_id = s.id), 0) as contexts_count,
    COALESCE((SELECT COUNT(*) FROM technical_decisions td WHERE td.session_id = s.id), 0) as decisions_count
  FROM sessions s
  LEFT JOIN projects p ON s.project_id = p.id
  WHERE s.id = $1
`, [activeSessionId]);
```

#### 4B. Update Response Object (Line 678)

```typescript
return {
  success: true,
  session: {
    id: session.id,
    type: session.agent_type,
    started_at: session.started_at,
    project_name: session.project_name || 'No project assigned',
    duration_minutes: Math.round(duration / 60000),
    contexts_created: parseInt(session.contexts_count),
    decisions_created: parseInt(session.decisions_count),
    // TS006-2: Add token data
    input_tokens: parseInt(session.input_tokens) || 0,
    output_tokens: parseInt(session.output_tokens) || 0,
    total_tokens: parseInt(session.total_tokens) || 0,
    estimated_cost: ((parseInt(session.input_tokens) * 0.003) + (parseInt(session.output_tokens) * 0.015)) / 1000,
    metadata: session.metadata || {}
  },
  message: `Current session: ${session.id.substring(0, 8)}...`
};
```

**File:** `/home/ridgetop/aidis/mcp-server/src/server.ts`

#### 4C. Update handleSessionStatus Display (Around line 4738)

```typescript
const statusText = `📋 Current Session Status\n\n` +
  `🆔 Session ID: ${session.id.substring(0, 8)}...\n` +
  `🏷️  Type: ${session.type}\n` +
  `🏢 Project: ${session.project_name}\n` +
  `⏰ Started: ${new Date(session.started_at).toLocaleString()}\n` +
  `⏱️  Duration: ${session.duration_minutes} minutes\n` +
  `📝 Contexts: ${session.contexts_created}\n` +
  `🎯 Decisions: ${session.decisions_created}\n` +
  // TS006-2: Add token information
  `\n🪙 Token Usage:\n` +
  `   Input:  ${session.input_tokens.toLocaleString()} tokens\n` +
  `   Output: ${session.output_tokens.toLocaleString()} tokens\n` +
  `   Total:  ${session.total_tokens.toLocaleString()} tokens\n` +
  `   Cost:   $${session.estimated_cost.toFixed(4)}\n` +
  (session.metadata.title ? `\n📌 Title: "${session.metadata.title}"\n` : '') +
  (session.metadata.assigned_manually ? `🔧 Manually assigned at: ${new Date(session.metadata.assigned_at).toLocaleString()}\n` : '');
```

### Step 5: Update Frontend Display

**File:** `/home/ridgetop/aidis/aidis-command/frontend/src/types/session.ts`

```typescript
export interface Session extends SessionEntity {
  project_name?: string;
  session_type?: string;
  context_count?: number;
  last_context_at?: string;
  // TS006-2: Token tracking fields
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  estimated_cost?: number;
}

export interface SessionDetail extends Session {
  contexts?: Array<{
    id: string;
    type: string;
    content: string;
    created_at: string;
    tags?: string[];
  }>;
  duration?: number;
  metadata?: Record<string, unknown>;
}
```

**File:** `/home/ridgetop/aidis/aidis-command/frontend/src/pages/Sessions.tsx`

#### 5A. Add Token Column (After line 214, before Actions column)

```typescript
{
  title: 'Tokens',
  key: 'tokens',
  render: (record: SessionItem) => {
    const totalTokens = record.total_tokens || 0;
    const estimatedCost = record.estimated_cost || 0;

    return (
      <Space direction="vertical" size="small">
        <Tooltip title={`Input: ${(record.input_tokens || 0).toLocaleString()}, Output: ${(record.output_tokens || 0).toLocaleString()}`}>
          <Space>
            <Text strong>{totalTokens.toLocaleString()}</Text>
            <Text type="secondary">tokens</Text>
          </Space>
        </Tooltip>
        <Text type="secondary" style={{ fontSize: 12 }}>
          ~${estimatedCost.toFixed(4)}
        </Text>
      </Space>
    );
  },
},
```

#### 5B. Add Token Stats Card (After line 313, in stats row)

```typescript
<Col xs={24} sm={12} md={6}>
  <Card>
    <Statistic
      title="Total Tokens Used"
      value={sessions.reduce((sum, s) => sum + (s.total_tokens || 0), 0).toLocaleString()}
      prefix="🪙"
      suffix={
        <Text type="secondary" style={{ fontSize: 12 }}>
          ~${sessions.reduce((sum, s) => sum + (s.estimated_cost || 0), 0).toFixed(2)}
        </Text>
      }
    />
  </Card>
</Col>
```

### Step 6: Update Backend API

**File:** `/home/ridgetop/aidis/aidis-command/backend/src/controllers/session.ts` (likely location)

**Update session list query to include token fields:**

```sql
SELECT
  s.id,
  s.title,
  s.description,
  s.agent_type as session_type,
  s.started_at as created_at,
  s.project_id,
  p.name as project_name,
  s.input_tokens,
  s.output_tokens,
  s.total_tokens,
  -- Calculate estimated cost (Claude Sonnet pricing)
  ((s.input_tokens * 0.003) + (s.output_tokens * 0.015)) / 1000 as estimated_cost,
  COUNT(c.id) as context_count,
  MAX(c.created_at) as last_context_at
FROM sessions s
LEFT JOIN projects p ON s.project_id = p.id
LEFT JOIN contexts c ON c.session_id = s.id
GROUP BY s.id, p.name
ORDER BY s.started_at DESC
```

---

## File Locations Summary

### Database
- **Migration:** `/home/ridgetop/aidis/mcp-server/database/migrations/023_add_session_token_tracking.sql` (NEW)

### MCP Server
- **Session Tracker:** `/home/ridgetop/aidis/mcp-server/src/services/sessionTracker.ts`
  - Lines 21-36: Update SessionData interface
  - After line 345: Add recordTokenUsage method
  - Lines 160-184: Update endSession method
  - Lines 377-476: Update getSessionData method

- **MCP Server:** `/home/ridgetop/aidis/mcp-server/src/server.ts`
  - After line 150: Add estimateTokenUsage function
  - Around line 736: Add token tracking after tool execution
  - Around line 4738: Update session status display

- **Session Analytics Handler:** `/home/ridgetop/aidis/mcp-server/src/handlers/sessionAnalytics.ts`
  - Line 650: Update getSessionStatus query
  - Line 678: Update response object
  - Lines 850-917: Update getSessionDetailsWithMeta (similar changes)

### Backend API
- **Session Controller:** `/home/ridgetop/aidis/aidis-command/backend/src/controllers/session.ts`
  - Update session list query (exact location TBD)

### Frontend
- **Session Types:** `/home/ridgetop/aidis/aidis-command/frontend/src/types/session.ts`
  - Lines 3-8: Add token fields to Session interface

- **Sessions Page:** `/home/ridgetop/aidis/aidis-command/frontend/src/pages/Sessions.tsx`
  - After line 214: Add Tokens column
  - After line 313: Add token usage stats card

---

## Dependencies and Risks

### Dependencies
1. **PostgreSQL BIGINT support** - Already available ✅
2. **MCP SDK passthrough metadata** - Already supported ✅
3. **React Query for data fetching** - Already in use ✅
4. **Ant Design components** - Already in use ✅

### Risks and Mitigations

#### Risk 1: Token Estimation Accuracy
**Issue:** Character-based estimation may be inaccurate
**Mitigation:**
- Use conservative multipliers
- Add "estimated" disclaimer in UI
- Plan for future integration with actual LLM API token counts

#### Risk 2: Performance Impact
**Issue:** Additional UPDATE query on every tool call
**Mitigation:**
- Use non-blocking async updates
- Don't fail requests if token tracking fails
- Index on `total_tokens` for analytics queries

#### Risk 3: Backward Compatibility
**Issue:** Existing sessions have `tokens_used = 0`
**Mitigation:**
- Migration copies `tokens_used` to `total_tokens`
- New columns default to 0
- UI handles null/undefined gracefully

#### Risk 4: Integer Overflow
**Issue:** Long sessions could exceed INTEGER max
**Mitigation:**
- Use BIGINT (max: 9,223,372,036,854,775,807)
- Would require ~2.3 trillion tokens to overflow
- Check constraints prevent negative values

---

## Testing Strategy

### Unit Tests

**File:** `/home/ridgetop/aidis/mcp-server/src/tests/token-tracking.unit.test.ts` (NEW)

```typescript
describe('TS006-2: Token Tracking', () => {
  describe('SessionTracker.recordTokenUsage', () => {
    it('should increment token counters correctly', async () => {
      const sessionId = await SessionTracker.startSession();

      await SessionTracker.recordTokenUsage(sessionId, 100, 50);
      await SessionTracker.recordTokenUsage(sessionId, 200, 75);

      const sessionData = await SessionTracker.getSessionData(sessionId);

      expect(sessionData.input_tokens).toBe(300);
      expect(sessionData.output_tokens).toBe(125);
      expect(sessionData.total_tokens).toBe(425);
    });

    it('should handle zero token calls', async () => {
      const sessionId = await SessionTracker.startSession();
      await SessionTracker.recordTokenUsage(sessionId, 0, 0);

      const sessionData = await SessionTracker.getSessionData(sessionId);
      expect(sessionData.total_tokens).toBe(0);
    });

    it('should not fail on non-existent session', async () => {
      const fakeSessionId = '00000000-0000-0000-0000-000000000000';
      await expect(
        SessionTracker.recordTokenUsage(fakeSessionId, 100, 50)
      ).resolves.not.toThrow();
    });
  });

  describe('estimateTokenUsage', () => {
    it('should estimate tokens based on content length', () => {
      const result = estimateTokenUsage(
        'context_store',
        { content: 'Short text', type: 'code' },
        { content: [{ type: 'text', text: 'Context stored successfully' }] }
      );

      expect(result.input).toBeGreaterThan(0);
      expect(result.output).toBeGreaterThan(0);
    });

    it('should enforce minimum token counts', () => {
      const result = estimateTokenUsage('ping', {}, { content: [] });

      expect(result.input).toBeGreaterThanOrEqual(10);
      expect(result.output).toBeGreaterThanOrEqual(5);
    });
  });
});
```

### Integration Tests

**File:** `/home/ridgetop/aidis/test-ts006-2-token-integration.ts` (NEW)

```typescript
describe('TS006-2: Token Tracking Integration', () => {
  it('should track tokens across multiple tool calls', async () => {
    // Start session
    const sessionId = await SessionTracker.startSession();

    // Simulate tool calls with token tracking
    await SessionTracker.recordTokenUsage(sessionId, 150, 75);
    await SessionTracker.recordTokenUsage(sessionId, 200, 100);
    await SessionTracker.recordTokenUsage(sessionId, 100, 50);

    // Check session status
    const status = await SessionManagementHandler.getSessionStatus();

    expect(status.success).toBe(true);
    expect(status.session.input_tokens).toBe(450);
    expect(status.session.output_tokens).toBe(225);
    expect(status.session.total_tokens).toBe(675);
    expect(status.session.estimated_cost).toBeGreaterThan(0);
  });

  it('should persist tokens through session end', async () => {
    const sessionId = await SessionTracker.startSession();

    await SessionTracker.recordTokenUsage(sessionId, 1000, 500);

    const endedSession = await SessionTracker.endSession(sessionId);

    expect(endedSession.total_tokens).toBe(1500);
  });

  it('should include tokens in session details API', async () => {
    // Create session with token usage
    const sessionId = await SessionTracker.startSession();
    await SessionTracker.recordTokenUsage(sessionId, 300, 150);

    // Query via handler
    const details = await SessionManagementHandler.getSessionDetailsWithMeta(sessionId);

    expect(details.success).toBe(true);
    expect(details.session.total_tokens).toBe(450);
  });
});
```

### Database Tests

**File:** `/home/ridgetop/aidis/test-ts006-2-token-database.ts` (NEW)

```typescript
describe('TS006-2: Token Database Schema', () => {
  it('should enforce non-negative token constraints', async () => {
    const sessionId = randomUUID();

    await expect(
      db.query(`
        INSERT INTO sessions (id, agent_type, input_tokens, output_tokens, total_tokens)
        VALUES ($1, 'test', -100, 50, -50)
      `, [sessionId])
    ).rejects.toThrow(/tokens_non_negative/);
  });

  it('should enforce token sum validity', async () => {
    const sessionId = randomUUID();

    await expect(
      db.query(`
        INSERT INTO sessions (id, agent_type, input_tokens, output_tokens, total_tokens)
        VALUES ($1, 'test', 100, 50, 50)
      `, [sessionId])
    ).rejects.toThrow(/tokens_sum_valid/);
  });

  it('should handle BIGINT token values', async () => {
    const sessionId = randomUUID();
    const largeValue = 9000000000; // 9 billion

    await db.query(`
      INSERT INTO sessions (id, agent_type, total_tokens)
      VALUES ($1, 'test', $2)
    `, [sessionId, largeValue]);

    const result = await db.query('SELECT total_tokens FROM sessions WHERE id = $1', [sessionId]);
    expect(result.rows[0].total_tokens).toBe(largeValue.toString());
  });
});
```

### Frontend Tests

**File:** `/home/ridgetop/aidis/aidis-command/frontend/src/pages/Sessions.test.tsx` (UPDATE)

```typescript
describe('Sessions Page - Token Display', () => {
  it('should display token counts in session table', () => {
    const mockSession = {
      id: 'test-id',
      title: 'Test Session',
      input_tokens: 1000,
      output_tokens: 500,
      total_tokens: 1500,
      estimated_cost: 0.0105
    };

    render(<Sessions />);

    expect(screen.getByText('1,500')).toBeInTheDocument();
    expect(screen.getByText('tokens')).toBeInTheDocument();
    expect(screen.getByText('~$0.0105')).toBeInTheDocument();
  });

  it('should show token tooltip with input/output breakdown', () => {
    const mockSession = {
      input_tokens: 1000,
      output_tokens: 500,
      total_tokens: 1500
    };

    render(<Sessions />);

    const tokenElement = screen.getByText('1,500');
    fireEvent.mouseOver(tokenElement);

    expect(screen.getByText(/Input: 1,000/)).toBeInTheDocument();
    expect(screen.getByText(/Output: 500/)).toBeInTheDocument();
  });
});
```

### Manual Test Scenarios

1. **Create new session and track tokens**
   - Start AIDIS server
   - Call `session_status` - should show 0 tokens
   - Call `context_store` - should increment tokens
   - Call `session_status` - should show increased tokens

2. **Verify token persistence**
   - Create session with token usage
   - Restart server
   - Call `session_status` - tokens should persist

3. **Test token display in frontend**
   - Navigate to Sessions page
   - Verify token column shows counts
   - Verify tooltip shows breakdown
   - Verify stats card shows total usage

4. **Test edge cases**
   - Very long session (>1M tokens)
   - Session with no tool calls (0 tokens)
   - Multiple concurrent sessions

---

## Recommended Implementation Order

1. **Phase 1: Database Foundation** ✅
   - Create migration 023
   - Test constraints and indexes
   - Verify existing data migration

2. **Phase 2: SessionTracker Updates** ✅
   - Update SessionData interface
   - Implement recordTokenUsage method
   - Update endSession and getSessionData
   - Write unit tests

3. **Phase 3: MCP Server Integration** ✅
   - Add estimateTokenUsage function
   - Integrate token tracking in tool execution
   - Update session_status tool
   - Write integration tests

4. **Phase 4: Backend API** ✅
   - Update session list queries
   - Add token fields to responses
   - Test API endpoints

5. **Phase 5: Frontend Display** ✅
   - Update TypeScript interfaces
   - Add token column to Sessions table
   - Add token stats card
   - Test UI rendering

6. **Phase 6: Testing & Validation** ✅
   - Run all test suites
   - Manual testing
   - Performance testing
   - Documentation updates

---

## Cost Estimation Formula

**Claude Sonnet 4.5 Pricing (as of 2025-09-30):**
- Input: $3.00 per million tokens
- Output: $15.00 per million tokens

**Formula:**
```typescript
const estimatedCost =
  ((inputTokens * 0.003) + (outputTokens * 0.015)) / 1000;
```

**Example:**
- Input: 1,000 tokens
- Output: 500 tokens
- Cost: ((1000 * 0.003) + (500 * 0.015)) / 1000 = $0.0105

---

## Future Enhancements

1. **Actual Token Tracking**
   - Integrate with Anthropic API to get real token counts
   - Replace estimation with actual usage from API responses

2. **Cost Alerts**
   - Set token/cost budgets per session or project
   - Alert when approaching limits

3. **Token Analytics**
   - Token usage trends over time
   - Most expensive tool calls
   - Cost per project comparison

4. **Caching Credits**
   - Track cache hits/misses
   - Show cost savings from caching

5. **Batch Cost Reporting**
   - Generate cost reports by date range
   - Export for billing/accounting

---

## Conclusion

The token counting implementation is **ready for development** with a clear path across all architectural layers. The investigation revealed that:

1. ✅ Database column exists but is unused
2. ✅ SessionTracker service is well-structured for extension
3. ✅ MCP protocol supports metadata passthrough
4. ✅ Frontend components are modular and extensible
5. ✅ Backend API routes exist for token patterns

**Critical Success Factors:**
- Token tracking must not block tool execution
- Estimation should be conservative (overestimate vs underestimate)
- UI should clearly indicate "estimated" vs "actual" costs
- Performance impact should be minimal (<10ms per tool call)

**Implementation Time Estimate:**
- Phase 1 (Database): 1 hour
- Phase 2 (SessionTracker): 2 hours
- Phase 3 (MCP Server): 3 hours
- Phase 4 (Backend API): 1 hour
- Phase 5 (Frontend): 2 hours
- Phase 6 (Testing): 3 hours
- **Total: ~12 hours**

Ready to proceed with implementation when approved.
