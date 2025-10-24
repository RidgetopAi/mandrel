# Project Defaulting - Quick Reference

**Last Updated:** 2025-10-07
**Status:** Issue identified, solution ready to implement

---

## TL;DR

**Problem:** UI sets default project to "aidis-refactor", but MCP tools still show "aidis-alpha"

**Root Cause:** Session cache not invalidated when database primary flag changes

**Quick Fix:** Restart server with `./restart-aidis.sh` (temporary)

**Permanent Fix:** Add cache invalidation to `setPrimary` endpoint (30 minutes)

---

## System Architecture

### Two Separate Concepts

1. **Primary Project** (Database)
   - Location: `projects.metadata->>'is_primary'`
   - Set by: UI Settings page → API endpoint
   - Purpose: User's preferred default project

2. **Current Session Project** (In-Memory Cache)
   - Location: `ProjectHandler.sessionStates` Map
   - Set by: `initializeSession()` or `project_switch`
   - Purpose: Active project for this server instance

### The Issue

**Cache is not invalidated when primary changes in database.**

```
┌─────────────────┐       ┌──────────────────┐       ┌─────────────────┐
│   UI Settings   │ ───▶  │  Database        │       │  Session Cache  │
│  (sets primary) │       │  (is_primary=✅)  │   ✗   │  (cached old)   │
└─────────────────┘       └──────────────────┘       └─────────────────┘
                                                              │
                                                              ▼
                                                    ┌─────────────────────┐
                                                    │  project_current    │
                                                    │  returns wrong data │
                                                    └─────────────────────┘
```

---

## Quick Verification

### Check Database State
```bash
psql -h localhost -p 5432 -d aidis_production -c \
  "SELECT name, metadata->>'is_primary' as is_primary FROM projects WHERE metadata->>'is_primary' = 'true';"
```

### Check MCP Current Project
```bash
curl -X POST http://localhost:8080/mcp/tools/project_current -d '{}' -s | jq -r '.result.content[0].text'
```

### Set Primary Project via API
```bash
# Get project ID first
curl -s http://localhost:8080/api/v1/projects | jq -r '.data.projects[] | select(.name=="aidis-refactor") | .id'

# Set as primary (replace ID)
curl -X POST http://localhost:8080/api/v2/projects/{PROJECT_ID}/set-primary
```

---

## Solution Implementation

### Option 1: Cache Invalidation (RECOMMENDED)

**File:** `/home/ridgetop/aidis/mcp-server/src/api/controllers/projectController.ts`

Add after `COMMIT`:
```typescript
// Invalidate session cache
const { projectHandler } = await import('../../handlers/project.js');
projectHandler.clearSessionCache();
```

**File:** `/home/ridgetop/aidis/mcp-server/src/handlers/project.ts`

Add to `ProjectHandler` class:
```typescript
clearSessionCache(): void {
  console.log('🗑️  Clearing all session caches');
  this.sessionStates.clear();
}
```

**Time:** 30 minutes
**Risk:** Low
**Impact:** Forces session re-initialization on next access

---

## Testing Checklist

- [ ] Database shows correct primary project
- [ ] API call successfully sets primary
- [ ] Session cache is cleared after API call
- [ ] `project_current` returns new primary immediately
- [ ] No regression in `project_switch` functionality
- [ ] Multiple sessions handled correctly

---

## Key Files

| Component | File Path |
|-----------|-----------|
| UI Settings | `/home/ridgetop/aidis/aidis-command/frontend/src/pages/Settings.tsx` |
| Settings Hook | `/home/ridgetop/aidis/aidis-command/frontend/src/hooks/useSettings.ts` |
| API Controller | `/home/ridgetop/aidis/mcp-server/src/api/controllers/projectController.ts` |
| Project Handler | `/home/ridgetop/aidis/mcp-server/src/handlers/project.ts` |

---

## Current Status

✅ Database correctly updated (aidis-refactor is primary)
✅ API endpoint working correctly
✅ UI calling API correctly
❌ Session cache not syncing with database

**Next Step:** Implement Option 1 (cache invalidation)
