# REST API Migration - Implementation Checklist

**Project:** Migrate 8 Session Analytics Tools (MCP → REST)
**Estimated Time:** 5 days
**Files to Modify:** 2 existing, 3 new

---

## Phase 1: Foundation (Day 1)

### Create Controller
- [ ] Create file: `src/api/controllers/sessionAnalyticsController.ts`
- [ ] Copy business logic from 8 MCP handlers
- [ ] Implement 8 static methods:
  - [ ] `recordActivity(sessionId, activityType, activityData)`
  - [ ] `getActivities(sessionId, activityType?, limit?)`
  - [ ] `recordFileEdit(sessionId, filePath, linesAdded, linesDeleted, source)`
  - [ ] `getFiles(sessionId)`
  - [ ] `calculateProductivity(sessionId, configName?)`
  - [ ] `listSessions(filters)`
  - [ ] `getStats(options)`
  - [ ] `compareSessions(sessionId1, sessionId2)`
- [ ] Convert MCP text responses to JSON format
- [ ] Add error handling for all methods

### Create Middleware
- [ ] Create file: `src/middleware/sessionTracking.ts`
- [ ] Implement 4 auto-tracking methods:
  - [ ] `trackContextStored(contextId, contextType, tags)`
  - [ ] `trackTaskCreated(taskId, taskTitle, taskType, taskPriority)`
  - [ ] `trackDecisionRecorded(decisionId, decisionType, impactLevel)`
  - [ ] `trackNamingRegistered(entityType, canonicalName)`
- [ ] Add error handling (don't break main flow)
- [ ] Add logging for debugging

### Unit Tests
- [ ] Create test file: `src/tests/sessionAnalyticsController.test.ts`
- [ ] Test all 8 controller methods
- [ ] Mock SessionTracker and DB calls
- [ ] Test error handling
- [ ] Create test file: `src/tests/sessionTracking.test.ts`
- [ ] Test all 4 middleware methods
- [ ] Verify SessionTracker.recordActivity calls

### Code Review
- [ ] Review controller implementation
- [ ] Review middleware implementation
- [ ] Review test coverage (target: 80%+)
- [ ] Approve for Phase 2

---

## Phase 2: REST Router (Day 2)

### Create Session Routes
- [ ] Create file: `src/api/v2/sessionRoutes.ts`
- [ ] Implement SessionAnalyticsRouter class
- [ ] Setup Express router with middleware
- [ ] Implement 8 route handlers:
  - [ ] `POST /:sessionId/activities` → recordActivity
  - [ ] `GET /:sessionId/activities` → getActivities
  - [ ] `POST /:sessionId/files` → recordFileEdit
  - [ ] `GET /:sessionId/files` → getFiles
  - [ ] `POST /:sessionId/productivity` → calculateProductivity
  - [ ] `GET /` → listSessions (with query params)
  - [ ] `GET /stats` → getStats (with query params)
  - [ ] `GET /compare` → compareSessions (with query params)
- [ ] Add request validation for each endpoint
- [ ] Add error handling and response formatting
- [ ] Export getRouter() method

### Integrate with V2 MCP Router
- [ ] Modify `src/api/v2/mcpRoutes.ts`
- [ ] Import SessionAnalyticsRouter
- [ ] Add sessionRouter instance in constructor
- [ ] Mount session routes: `app.use('/api/v2/sessions', sessionRouter.getRouter())`
- [ ] Export getSessionRouter() method

### Integration Tests
- [ ] Create test file: `src/tests/sessionRoutes.test.ts`
- [ ] Test all 8 REST endpoints with supertest
- [ ] Test success cases with valid data
- [ ] Test error cases (400, 404, 500)
- [ ] Test query parameter validation
- [ ] Test pagination for sessions list

### Manual Testing
- [ ] Start AIDIS server
- [ ] Test with curl/Postman:
  - [ ] `curl -X POST http://localhost:8080/api/v2/sessions/abc/activities -d '{"activityType":"test"}'`
  - [ ] `curl http://localhost:8080/api/v2/sessions/abc/activities`
  - [ ] `curl -X POST http://localhost:8080/api/v2/sessions/abc/files -d '{"filePath":"test.ts","linesAdded":10,"linesDeleted":5}'`
  - [ ] `curl http://localhost:8080/api/v2/sessions/abc/files`
  - [ ] `curl -X POST http://localhost:8080/api/v2/sessions/abc/productivity`
  - [ ] `curl http://localhost:8080/api/v2/sessions?limit=10`
  - [ ] `curl http://localhost:8080/api/v2/sessions/stats?period=week`
  - [ ] `curl http://localhost:8080/api/v2/sessions/compare?sessionId1=abc&sessionId2=xyz`

---

## Phase 3: Automation Hooks (Day 3)

### Add Hooks to server.ts
- [ ] Modify `handleContextStore` (after line ~1170):
  ```typescript
  const activeSessionId = await SessionTracker.getActiveSession();
  if (activeSessionId) {
    await SessionTrackingMiddleware.trackContextStored(
      result.id, result.contextType, result.tags
    );
  }
  ```
- [ ] Modify `handleTaskCreate` (after line ~2008):
  ```typescript
  const activeSessionId = await SessionTracker.getActiveSession();
  if (activeSessionId) {
    await SessionTrackingMiddleware.trackTaskCreated(
      task.id, task.title, task.type, task.priority
    );
  }
  ```
- [ ] Modify `handleDecisionRecord` (after line ~1801 estimate):
  ```typescript
  const activeSessionId = await SessionTracker.getActiveSession();
  if (activeSessionId) {
    await SessionTrackingMiddleware.trackDecisionRecorded(
      result.id, result.type, result.impactLevel
    );
  }
  ```
- [ ] Modify `handleNamingRegister` (after line ~1637 estimate):
  ```typescript
  const activeSessionId = await SessionTracker.getActiveSession();
  if (activeSessionId) {
    await SessionTrackingMiddleware.trackNamingRegistered(
      result.entityType, result.canonicalName
    );
  }
  ```

### Test Auto-Tracking
- [ ] Call `context_store` MCP tool → verify activity recorded
- [ ] Call `task_create` MCP tool → verify activity recorded
- [ ] Call `decision_record` MCP tool → verify activity recorded
- [ ] Call `naming_register` MCP tool → verify activity recorded
- [ ] Query activities via REST API → verify all 4 activities present

### Performance Testing
- [ ] Measure hook overhead (target: <10ms per hook)
- [ ] Test with 100 rapid MCP calls → verify no delays
- [ ] Check database load → verify no bottlenecks
- [ ] Monitor memory usage → verify no leaks

---

## Phase 4: Deprecation (Day 4)

### Add Deprecation Warnings
- [ ] Modify 8 MCP handlers in `server.ts`
- [ ] Add warning log at start of each handler:
  ```typescript
  console.warn(`⚠️ DEPRECATED: session_record_activity is deprecated. Use REST API: POST /api/v2/sessions/:id/activities`);
  logger.warn('MCP tool deprecated', {
    tool: 'session_record_activity',
    replacement: 'POST /api/v2/sessions/:id/activities'
  });
  ```
- [ ] Add deprecation notice to MCP response:
  ```typescript
  return {
    content: [{
      type: 'text',
      text: '⚠️ DEPRECATION NOTICE: This MCP tool will be removed in 2 weeks. Use REST API instead.\n\n' +
            '🔄 REST Endpoint: POST /api/v2/sessions/:id/activities\n\n' +
            originalResponse
    }]
  };
  ```

### Update Documentation
- [ ] Modify `CLAUDE.md`
  - [ ] Remove session tools from MCP tool list (41 → 33 tools)
  - [ ] Add REST API section with 8 endpoints
  - [ ] Add migration guide for external consumers
- [ ] Update `README.md` (if applicable)
- [ ] Create `MIGRATION_GUIDE.md` for external teams

### Monitor Usage
- [ ] Add metrics to track MCP tool usage
- [ ] Set up alerts for continued usage
- [ ] Create migration dashboard (optional)
- [ ] Wait 2 weeks for migration

---

## Phase 5: Cleanup (Day 5)

### Remove MCP Handlers
- [ ] Modify `src/server.ts`
- [ ] Remove 8 handler methods (Lines 3140-3478, ~328 lines):
  - [ ] Delete `handleSessionRecordActivity` (Lines 3140-3156)
  - [ ] Delete `handleSessionGetActivities` (Lines 3162-3182)
  - [ ] Delete `handleSessionRecordFileEdit` (Lines 3184-3206)
  - [ ] Delete `handleSessionGetFiles` (Lines 3208-3226)
  - [ ] Delete `handleSessionCalculateProductivity` (Lines 3228-3247)
  - [ ] Delete `handleSessionsList` (Lines 3249-3375)
  - [ ] Delete `handleSessionsStats` (Lines 3377-3415)
  - [ ] Delete `handleSessionsCompare` (Lines 3417-3478)
- [ ] Remove 8 case statements (Lines 883-905, ~24 lines):
  - [ ] Delete case 'session_record_activity'
  - [ ] Delete case 'session_get_activities'
  - [ ] Delete case 'session_record_file_edit'
  - [ ] Delete case 'session_get_files'
  - [ ] Delete case 'session_calculate_productivity'
  - [ ] Delete case 'sessions_list'
  - [ ] Delete case 'sessions_stats'
  - [ ] Delete case 'sessions_compare'

### Remove Tool Definitions
- [ ] Modify `src/config/toolDefinitions.ts`
- [ ] Remove 8 tool definitions (~300 lines):
  - [ ] Delete session_record_activity definition
  - [ ] Delete session_get_activities definition
  - [ ] Delete session_record_file_edit definition
  - [ ] Delete session_get_files definition
  - [ ] Delete session_calculate_productivity definition
  - [ ] Delete sessions_list definition
  - [ ] Delete sessions_stats definition
  - [ ] Delete sessions_compare definition
- [ ] Update comment: "all 41 tools" → "all 33 tools"

### Final Testing
- [ ] Run full test suite → all pass
- [ ] Test all REST endpoints → working
- [ ] Verify MCP tools removed → 404 errors expected
- [ ] Test automation hooks → still working
- [ ] Check server startup → no errors
- [ ] Verify tool count: 33 tools in help output

### Documentation Update
- [ ] Update CLAUDE.md with final tool count
- [ ] Update API documentation
- [ ] Create changelog entry
- [ ] Archive migration reports

### Production Deployment
- [ ] Create git branch: `feature/rest-api-migration`
- [ ] Commit all changes
- [ ] Push to remote
- [ ] Create pull request
- [ ] Code review
- [ ] Merge to main
- [ ] Deploy to production
- [ ] Monitor for 24 hours

---

## Verification Checklist

### Code Quality
- [ ] TypeScript compilation passes (no errors)
- [ ] ESLint passes (no warnings)
- [ ] All tests pass (unit + integration)
- [ ] Test coverage ≥ 80%
- [ ] No console.log statements (use logger)
- [ ] Error handling in all endpoints
- [ ] Input validation for all parameters

### Functionality
- [ ] All 8 REST endpoints working
- [ ] All 4 automation hooks working
- [ ] Session activities recorded correctly
- [ ] File modifications tracked
- [ ] Productivity scores calculated
- [ ] Sessions list with filters
- [ ] Stats aggregation working
- [ ] Session comparison working

### Performance
- [ ] Hook overhead < 10ms
- [ ] REST endpoints < 100ms (p95)
- [ ] Database queries optimized
- [ ] No N+1 query issues
- [ ] Memory usage stable

### Documentation
- [ ] REST API endpoints documented
- [ ] Migration guide created
- [ ] CLAUDE.md updated
- [ ] Code comments added
- [ ] Changelog entry created

---

## Rollback Plan

If issues arise, rollback steps:

1. **Revert Git Commit:**
   ```bash
   git revert <commit-hash>
   git push
   ```

2. **Emergency Restore MCP Tools:**
   - Restore removed handlers from git history
   - Restore tool definitions
   - Redeploy server

3. **Restore Database:** (if needed)
   - No schema changes, so no restoration needed

4. **Notify Stakeholders:**
   - Alert team of rollback
   - Investigate root cause
   - Schedule retry

---

## Success Metrics

- ✅ All 8 REST endpoints operational
- ✅ All 4 automation hooks working
- ✅ Zero MCP tool usage after 2 weeks
- ✅ -294 lines of code removed
- ✅ ~6,000 tokens saved from AI context
- ✅ No production incidents
- ✅ Test coverage ≥ 80%
- ✅ REST API response time < 100ms (p95)

---

## Contact & Support

**Report Issues:** [GitHub Issues]
**Documentation:** `/home/ridgetop/aidis/mcp-server/REST_API_MIGRATION_INVESTIGATION_REPORT.md`
**Migration Guide:** `MIGRATION_GUIDE.md` (to be created)

---

**Last Updated:** 2025-10-05
**Status:** Ready for Implementation
