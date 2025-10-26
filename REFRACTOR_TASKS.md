# AIDIS Refactoring Tasks
*Detailed task breakdown for the AIDIS refactoring project*

**Generated**: September 12, 2025  
**Source**: Oracle-guided refactoring plan  
**Task Prefix**: TR#### (Task Refractor)

---

## 🎯 PHASE 0: PREPARE & BASELINE (Week 1)
*Objective: Establish safety foundation before any refactoring changes*

### TR0001 - Create Repository Baseline and Safety Snapshot
**Priority**: Urgent | **Estimated**: 2 hours | **Risk**: Low  
**Dependencies**: None

**Tasks:**
- [ ] Create git tag `pre-refactor-baseline-YYYY-MM-DD`
- [ ] Document current commit SHA for all repositories
- [ ] Verify git repository is clean with no uncommitted changes
- [ ] Create branch `refactor/phase-0-baseline` from main
- [ ] Document current running processes with `ps aux > baseline-processes.txt`

**Success Criteria:**
- ✅ Git tag created and pushed to remote
- ✅ Current state fully documented
- ✅ Clean working directory confirmed

**Rollback**: `git reset --hard pre-refactor-baseline-YYYY-MM-DD`

---

### TR0002 - Document Current System Performance Baselines
**Priority**: Urgent | **Estimated**: 3 hours | **Risk**: Low  
**Dependencies**: TR0001

**Tasks:**
- [ ] Measure MCP server response times for all 96 tools
- [ ] Document memory usage for all running processes
- [ ] Record database query performance (slow query log analysis)
- [ ] Measure web application load times (Lighthouse audit)
- [ ] Document current error rates from logs
- [ ] Create baseline metrics dashboard or report

**Success Criteria:**
- ✅ Comprehensive performance baseline documented
- ✅ Metrics collection automated for ongoing comparison
- ✅ Alert thresholds defined for regression detection

**Rollback**: N/A (measurement only)

---

### TR0003 - Enable Comprehensive Request and Error Logging
**Priority**: Urgent | **Estimated**: 4 hours | **Risk**: Low  
**Dependencies**: TR0001

**Tasks:**
- [ ] Add request/response logging to MCP server with timestamps
- [ ] Enable detailed error logging with stack traces
- [ ] Add correlation IDs to track requests across services
- [ ] Configure log rotation to prevent disk space issues
- [ ] Set up structured logging (JSON format) for easier analysis
- [ ] Test logging works for all major code paths

**Success Criteria:**
- ✅ All requests/responses logged with correlation IDs
- ✅ Error logs include sufficient debugging information
- ✅ Log files rotating properly, not consuming excessive disk space

**Rollback**: Disable logging flags, restart services

---

### TR0004 - Create PostgreSQL Database Backup and Restore Scripts
**Priority**: Urgent | **Estimated**: 3 hours | **Risk**: Medium  
**Dependencies**: TR0001

**Tasks:**
- [ ] Create automated pg_dump script with compression
- [ ] Create pg_basebackup script for full backup
- [ ] Build database restore scripts with verification
- [ ] Test backup and restore process on staging database
- [ ] Schedule automated daily backups
- [ ] Document backup retention policy

**Scripts to Create:**
```bash
backup-database.sh          # Full pg_dump with timestamp
backup-database-base.sh     # pg_basebackup for PITR
restore-database.sh         # Restore from backup with validation
verify-backup.sh           # Test backup integrity
```

**Success Criteria:**
- ✅ Backup scripts create valid, restorable backups
- ✅ Restore process tested and validated
- ✅ Automated backup scheduling configured

**Rollback**: Restore from backup using created scripts

---

### TR0005 - Set Up Reproducible Staging Environment
**Priority**: Urgent | **Estimated**: 5 hours | **Risk**: Medium  
**Dependencies**: TR0004

**Tasks:**
- [ ] Create staging database copy from production backup
- [ ] Set up staging environment with same configurations
- [ ] Configure staging-specific environment variables
- [ ] Deploy all services to staging and verify functionality
- [ ] Test MCP tools work correctly in staging
- [ ] Create staging deployment and update scripts

**Environment Setup:**
- Database: `aidis_staging` (copy of production)
- Ports: Different from production (e.g., 9080 instead of 8080)
- Configs: Mirror production but with staging-specific settings

**Success Criteria:**
- ✅ Staging environment mirrors production functionality
- ✅ All AIDIS tools work correctly in staging
- ✅ Database copy is current and functional

**Rollback**: Shut down staging environment

---

### TR0006 - Verify All CI/CD Pipelines and Testing Infrastructure
**Priority**: High | **Estimated**: 4 hours | **Risk**: Low  
**Dependencies**: TR0005

**Tasks:**
- [ ] Run all existing unit tests and ensure they pass
- [ ] Run integration tests in staging environment
- [ ] Verify Playwright E2E tests work correctly
- [ ] Fix any broken or flaky tests
- [ ] Document test execution procedures
- [ ] Ensure CI/CD pipelines trigger correctly

**Success Criteria:**
- ✅ All existing tests pass consistently
- ✅ CI/CD pipelines execute without errors
- ✅ Test infrastructure ready for refactoring validation

**Rollback**: N/A (validation only)

---

## 🛡️ PHASE 1: SAFETY NET (Weeks 2-3)
*Objective: Build comprehensive testing and deployment safety mechanisms*

### TR0007 - Audit Current Test Coverage and Identify Critical Paths
**Priority**: High | **Estimated**: 6 hours | **Risk**: Low  
**Dependencies**: TR0006

**Tasks:**
- [ ] Generate test coverage reports for MCP server
- [ ] Generate test coverage reports for web backend
- [ ] Generate test coverage reports for React frontend
- [ ] Identify critical user paths that need ≥70% coverage
- [ ] Map uncovered code that poses refactoring risk
- [ ] Prioritize tests to write for maximum safety

**Critical Paths to Analyze:**
- MCP tool execution and response parsing
- Database schema operations and migrations
- User authentication and session management
- Project switching and context management
- Git correlation and pattern detection

**Success Criteria:**
- ✅ Test coverage mapped for all major components
- ✅ Critical paths identified and prioritized
- ✅ Plan created for achieving ≥70% coverage

**Rollback**: N/A (analysis only)

---

### TR0008 - Implement Local Feature Flag System
**Priority**: High | **Estimated**: 8 hours | **Risk**: Medium  
**Dependencies**: TR0007

**Tasks:**
- [ ] Choose lightweight feature flag solution (Unleash OSS or JSON-based)
- [ ] Install and configure feature flag service locally
- [ ] Add feature flag client to MCP server
- [ ] Add feature flag client to web backend
- [ ] Add feature flag client to React frontend
- [ ] Create feature flag management interface
- [ ] Test feature flag toggles work without restart

**Local Setup Options:**
1. **Unleash OSS**: Full-featured, local Docker container
2. **ConfigCat Free**: Simple, file-based with web UI
3. **Custom JSON**: Simple file-based flags with hot reload

**Success Criteria:**
- ✅ Feature flags can be toggled without code deployment
- ✅ All services respect feature flag settings
- ✅ Flag changes take effect within seconds

**Rollback**: Disable all feature flags, restart services

---

### TR0009 - Create Contract Tests for MCP-HTTP Integration
**Priority**: High | **Estimated**: 10 hours | **Risk**: Medium  
**Dependencies**: TR0008

**Tasks:**
- [x] Define API contracts between MCP server and HTTP bridge
- [x] Create contract tests for all 96 MCP tools
- [x] Add schema validation for MCP request/response formats
- [x] Build consumer contract tests for web backend
- [x] Set up contract test execution in CI/CD (scripts provided for `mcp-server` and backend runners)
- [x] Document contract testing procedures

**Contract Testing Tools:**
- Pact (consumer-driven contracts)
- OpenAPI schema validation
- JSON Schema validation for MCP responses

**Success Criteria:**
- ✅ Breaking changes to MCP-HTTP integration detected automatically
- ✅ Contract tests run in <5 minutes
- ✅ Clear error messages when contracts break

**Rollback**: Revert MCP integration changes if contracts fail

---

### TR0010 - Add React Error Boundaries and Fallback Components
**Priority**: High | **Estimated**: 6 hours | **Risk**: Low  
**Dependencies**: TR0009

**Tasks:**
- [ ] Create global error boundary component
- [ ] Add error boundaries around major feature areas
- [ ] Design fallback UI components for errors
- [ ] Add error reporting to track issues
- [ ] Test error boundaries catch component crashes
- [ ] Add Suspense boundaries for async operations

**Error Boundary Strategy:**
- Global boundary: Catches all unhandled errors
- Feature boundaries: Dashboard, Projects, Sessions, etc.
- Fallback UI: User-friendly error messages with retry options

**Success Criteria:**
- ✅ Component errors don't crash entire application
- ✅ Users see helpful error messages with recovery options
- ✅ Error details logged for debugging

**Rollback**: Remove error boundaries if they cause issues

---

### TR0011 - Create Automated Rollback and Emergency Procedures
**Priority**: Urgent | **Estimated**: 5 hours | **Risk**: Low  
**Dependencies**: TR0010

**Tasks:**
- [ ] Create emergency rollback script (`emergency-rollback.sh`)
- [ ] Build database restoration procedures
- [ ] Create service restart and health check scripts
- [ ] Document manual rollback procedures
- [ ] Test rollback procedures work correctly
- [ ] Create rollback decision tree/flowchart

**Emergency Scripts:**
```bash
emergency-rollback.sh       # Full system rollback
rollback-database.sh        # Database-only rollback  
rollback-services.sh        # Service-only rollback
health-check.sh            # Verify system health
```

**Success Criteria:**
- ✅ Emergency rollback completes in <10 minutes
- ✅ All rollback procedures tested and validated
- ✅ Clear escalation procedures documented

**Rollback**: Manual verification of rollback script effectiveness

---

## 📋 TASK MANAGEMENT

### Task Status Tracking
Use AIDIS task management system with these commands:
```bash
# View all refactoring tasks
aidis_task_list --type=refactor

# Update task status  
aidis_task_update <task_id> --status=in_progress

# Mark task complete
aidis_task_update <task_id> --status=completed
```

### Task Dependencies
Tasks must be completed in order due to dependencies:
- Phase 0: TR0001 → TR0002,TR0003,TR0004 → TR0005 → TR0006
- Phase 1: TR0006 → TR0007 → TR0008 → TR0009 → TR0010 → TR0011

### Risk Assessment
- **Low Risk**: Analysis, documentation, measurement tasks
- **Medium Risk**: Infrastructure changes, new services, integrations
- **High Risk**: Database changes, service architecture modifications

### Success Validation
Each task includes specific success criteria that must be met before proceeding to the next task. Use staging environment to validate all changes before applying to production.

---

## 🎯 NEXT STEPS

1. **Start with TR0001** - Create baseline and safety snapshot
2. **Work through tasks sequentially** - Don't skip dependencies
3. **Validate each task** in staging before marking complete
4. **Use AIDIS task system** to track progress
5. **Update this document** as tasks evolve or requirements change

Remember: **Safety first, speed second.** Better to take extra time ensuring each task is solid than to rush and create problems.

---

*This is a living document - update as tasks are completed and requirements evolve*
