# REST API Migration - Executive Summary

**Date:** 2025-10-05
**Status:** Investigation Complete ✅
**Full Report:** `/home/ridgetop/aidis/mcp-server/REST_API_MIGRATION_INVESTIGATION_REPORT.md`

---

## TL;DR

**Goal:** Migrate 8 session analytics tools from MCP to REST API to reduce AI context tokens.

**Key Finding:** AIDIS already has Express.js REST infrastructure at `/v2/mcp/tools/*` (port 8080). We just need to add 8 new session analytics endpoints to the existing V2 API router.

**Result:** -294 lines of code while adding clean REST API architecture.

**Timeline:** 5 days implementation time.

**Token Savings:** ~6,000 tokens (8 tool definitions removed from AI context).

---

## Quick Facts

### Current Architecture
- ✅ Express.js already configured via V2McpRouter
- ✅ Port 8080 (AIDIS_HTTP_PORT)
- ✅ Pattern: `/v2/mcp/tools/:toolName` (POST)
- ✅ All infrastructure ready - no new server setup needed

### 8 Tools to Migrate

**Phase 2 Tracking (5 tools):**
1. `session_record_activity` → `POST /api/v2/sessions/:id/activities`
2. `session_get_activities` → `GET /api/v2/sessions/:id/activities`
3. `session_record_file_edit` → `POST /api/v2/sessions/:id/files`
4. `session_get_files` → `GET /api/v2/sessions/:id/files`
5. `session_calculate_productivity` → `POST /api/v2/sessions/:id/productivity`

**Phase 3 Analytics (3 tools):**
6. `sessions_list` → `GET /api/v2/sessions`
7. `sessions_stats` → `GET /api/v2/sessions/stats`
8. `sessions_compare` → `GET /api/v2/sessions/compare`

### Code Changes

| File | Change | Lines |
|------|--------|-------|
| `server.ts` | Remove handlers + cases, add hooks | -304 |
| `toolDefinitions.ts` | Remove 8 tool definitions | -300 |
| `api/v2/sessionRoutes.ts` | New REST router | +300 |
| `api/controllers/sessionAnalyticsController.ts` | New controller | +200 |
| `middleware/sessionTracking.ts` | New automation hooks | +100 |
| `api/v2/mcpRoutes.ts` | Add session router | +10 |
| **Total** | | **-294** |

---

## Implementation Plan (5 Days)

### Day 1: Foundation
- Create controller (`sessionAnalyticsController.ts`)
- Create middleware (`sessionTracking.ts`)
- Write unit tests

### Day 2: REST Router
- Create session routes (`sessionRoutes.ts`)
- Integrate with V2 MCP router
- Write integration tests

### Day 3: Automation
- Add hooks to 4 MCP handlers (context, task, decision, naming)
- Test auto-tracking
- Performance testing

### Day 4: Deprecation
- Add warnings to 8 MCP tools
- Update documentation
- Monitor for 2 weeks

### Day 5: Cleanup
- Remove MCP handlers from `server.ts` (328 lines)
- Remove tool definitions (300 lines)
- Update tool count (41 → 33 tools)
- Production deployment

---

## Automation Strategy

### Auto-Track Session Activities
Add hooks to 4 MCP tools to automatically record activities:

1. **`context_store`** → Record "context_stored" activity
2. **`task_create`** → Record "task_created" activity
3. **`decision_record`** → Record "decision_recorded" activity
4. **`naming_register`** → Record "naming_registered" activity

### File Tracking
Use existing Git tracker to automatically record file modifications on commit.

---

## Risk Assessment

### Backward Compatibility
- ⚠️ **Breaking Change:** MCP tools will be removed
- ✅ **Mitigation:** 2-week deprecation period with warnings
- ✅ **Low Impact:** These are analytics tools, not core functionality

### Database
- ✅ **No migrations needed** - All tables exist
- ✅ **No schema changes** - Reusing existing structure

### Testing
- 8 controller unit tests
- 8 REST endpoint integration tests
- 4 automation hook tests
- Full session lifecycle test

---

## Architecture

### New File Structure
```
src/api/
├── v2/
│   ├── mcpRoutes.ts (existing)
│   └── sessionRoutes.ts (NEW - 8 endpoints)
├── controllers/
│   └── sessionAnalyticsController.ts (NEW - business logic)
└── middleware/
    └── sessionTracking.ts (NEW - automation hooks)
```

### REST Endpoint Examples

**Record Activity:**
```bash
POST /api/v2/sessions/abc123/activities
{"activityType": "context_stored", "activityData": {...}}
```

**List Sessions:**
```bash
GET /api/v2/sessions?projectId=xyz&dateFrom=2025-01-01&limit=25
```

**Get Stats:**
```bash
GET /api/v2/sessions/stats?period=week&groupBy=project
```

**Compare Sessions:**
```bash
GET /api/v2/sessions/compare?sessionId1=abc&sessionId2=xyz
```

---

## Benefits

1. **Token Savings:** ~6,000 tokens removed from AI context
2. **Code Cleanup:** -294 lines of code
3. **Better Architecture:** Clean separation of concerns
4. **Automation-Ready:** REST API easier to call from scripts
5. **Scalability:** Standard HTTP/JSON easier to integrate

---

## Next Steps

1. ✅ Review investigation report
2. ✅ Approve migration plan
3. ✅ Create GitHub issue
4. ✅ Start Phase 1 implementation

---

## Questions?

See full investigation report for:
- Exact line numbers for all changes
- Complete REST API specifications
- Detailed automation strategy
- Risk mitigation plans
- Testing checklists

**Report Location:** `/home/ridgetop/aidis/mcp-server/REST_API_MIGRATION_INVESTIGATION_REPORT.md`
