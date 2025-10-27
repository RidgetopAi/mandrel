# TR010-4: Legacy Agent Database Tables Audit & Removal Plan

## Executive Summary

**Status**: ✅ SAFE TO REMOVE - No dependencies or active usage detected
**Risk Level**: LOW
**Affected Systems**: Backend API routes, services, and one empty shadow table

## Audit Findings

### Database Tables
1. **`agent_tasks_shadow`** - Empty shadow table (0 rows) with complex structure
   - 22 columns including shadow sync metadata
   - Multiple indexes and constraints
   - **Action**: Safe to drop - no data loss

2. **Missing Core Tables**: The following tables are referenced in code but DON'T EXIST:
   - `agents`
   - `agent_sessions`
   - `agent_messages`
   - `agent_tasks`

### Legitimate Agent Usage (KEEP)
These are NOT legacy and should be PRESERVED:
- `sessions.agent_type` - Used for session tracking (`claude`, `claude-code-agent`, etc.)
- `code_analysis_sessions.analyzer_agent_id` - Valid component
- `code_analysis_sessions.triggered_by_agent` - Valid component
- `tasks.assigned_to` - Generic assignment field
- `user_sessions.user_agent` - HTTP user agent header

### Legacy Code Found
**Backend Files to Remove:**
- `/aidis-command/backend/src/routes/agents.ts` - 26 lines
- `/aidis-command/backend/src/controllers/agent.ts` - Full controller
- `/aidis-command/backend/src/services/agent.ts` - Service implementation
- Route registration in `/aidis-command/backend/src/routes/index.ts`

**MCP Server Files:**
- Legacy agent handlers in backups (already archived)

### Dependency Analysis
- ✅ **No Foreign Key Constraints** - Zero FK dependencies on agent tables
- ✅ **No Active Data** - `agent_tasks_shadow` table is empty
- ✅ **No Frontend Usage** - No agent UI components found
- ✅ **Routes Not Accessible** - Agent API endpoints return 404 (non-existent tables)

## Removal Plan

### Phase 1: Backend Code Removal (LOW RISK)
```bash
# Remove agent-related files
rm /home/ridgetop/aidis/aidis-command/backend/src/routes/agents.ts
rm /home/ridgetop/aidis/aidis-command/backend/src/controllers/agent.ts
rm /home/ridgetop/aidis/aidis-command/backend/src/services/agent.ts

# Remove route registration
# Edit: /aidis-command/backend/src/routes/index.ts
# Remove: import agentRoutes from './agents';
# Remove: router.use('/agents', agentRoutes);
```

### Phase 2: Database Cleanup (ZERO RISK)
```sql
-- Drop empty shadow table
DROP TABLE IF EXISTS agent_tasks_shadow CASCADE;
```

### Phase 3: Documentation & Testing
- Update API documentation to remove agent endpoints
- Test health checks still pass
- Verify no broken imports

## Validation Tests

### Pre-Removal Health Check
```bash
# Verify endpoints are already broken (expected)
curl http://localhost:5000/api/agents  # Should return 500 (missing table)

# Verify legitimate usage works
psql -c "SELECT COUNT(*) FROM sessions WHERE agent_type IS NOT NULL;"
```

### Post-Removal Validation
```bash
# Verify health endpoints still work
npx tsx test-health-check-endpoints.ts

# Verify no broken imports
npm run lint
npm run type-check
```

## Risk Assessment

| Component | Risk Level | Impact | Mitigation |
|-----------|------------|--------|------------|
| Database Table Drop | ZERO | None - empty table | N/A |
| Backend Code Removal | LOW | Removes broken functionality | Code already non-functional |
| Route Registration | LOW | Cleans up 404 endpoints | Improves API clarity |

## Estimated Impact
- **Performance**: Slight improvement (fewer broken routes)
- **Maintenance**: Reduced (less dead code)
- **Functionality**: Zero impact (code was non-functional)
- **Time Required**: 15 minutes

## Success Criteria
- ✅ All agent-related backend files removed
- ✅ Empty shadow table dropped
- ✅ No TypeScript compilation errors
- ✅ Health checks pass
- ✅ Legitimate agent_type usage preserved

## Rollback Plan
If needed (unlikely):
1. Restore files from git: `git checkout HEAD~1 -- src/routes/agents.ts src/controllers/agent.ts src/services/agent.ts`
2. Recreate table: `CREATE TABLE agent_tasks_shadow (...);` (schema preserved in git)

---

**Oracle Refactor Phase 4 - Service De-duplication**
**Next**: TR011-4 - Remove Legacy Agent API Endpoints
**Risk**: LOW - Safe cleanup of unused infrastructure