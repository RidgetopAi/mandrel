# AIDIS REFACTORING MASTER PLAN
*Expert Oracle-guided refactoring strategy for production-ready AIDIS architecture*

**Generated**: September 12, 2025  
**Oracle Consultation**: Comprehensive codebase analysis  
**Goal**: Modern architecture, zero downtime, sustainable codebase

---

## 📊 EXECUTIVE SUMMARY

The AIDIS system is a sophisticated AI Development Intelligence System with impressive capabilities (96 MCP tools, dual protocol support, advanced pattern detection) but suffers from technical debt accumulated during rapid development. This plan provides a systematic, risk-minimized approach to resolve architectural issues while maintaining production stability.

### Critical Problems Identified
1. **Schema Conflicts**: Duplicate migrations, competing git tables, inconsistent embeddings
2. **Service Redundancy**: Multiple session managers, overlapping functionality 
3. **Configuration Issues**: Port conflicts, hardcoded secrets, scattered config
4. **Architecture Debt**: UI-backend mismatches, brittle parsing, missing error handling

---

## 🎯 PHASED REFACTORING STRATEGY

### **Phase 0: Prepare & Baseline** *(1 week)*
**Objective**: Establish safety foundation and baseline metrics

**Tasks:**
- [ ] Code freeze on risky areas
- [ ] Tag repository as "pre-refactor"
- [ ] Enable comprehensive request/metric logging
- [ ] Create `pg_basebackup` database snapshot
- [ ] Set up reproducible staging environment
- [ ] Verify all CI/CD pipelines are green

**Success Criteria:**
- ✅ Reproducible staging environment
- ✅ Green CI pipeline
- ✅ Database snapshot stored and tested
- ✅ Baseline performance metrics captured

**Risk Mitigation:**
- Complete database backup with restore testing
- Document current system performance baselines
- Establish monitoring and alerting for all services

---

### **Phase 1: Safety Net** *(2 weeks)*
**Objective**: Build comprehensive testing and deployment safety mechanisms

**Tasks:**
- [ ] Expand automated test coverage to ≥70% critical paths
- [ ] Add contract tests: MCP ⟷ HTTP, UI ⟷ API, DB ⟷ ORM
- [ ] Implement feature flag library (Unleash/LaunchDarkly)
- [ ] Create canary deployment scripts
- [ ] Set up blue/green deployment infrastructure
- [ ] Add React Error Boundaries and Suspense fallbacks

**Success Criteria:**
- ✅ Test cycle completion < 10 minutes
- ✅ Feature flags deployable with <1% traffic splits
- ✅ Automated rollback procedures tested
- ✅ Contract tests prevent breaking API changes

**Risk Mitigation:**
- Feature flags allow instant rollback
- Canary deployments limit blast radius
- Comprehensive test suite catches regressions

---

### **Phase 2: Database Consolidation** *(2 weeks)*
**Objective**: Resolve schema conflicts and unify migration system

#### 2.1 Migration System Unification
**Tasks:**
- [ ] Select single migration framework (recommend: migrate-pg or Prisma)
- [ ] Merge version tracking tables → `schema_migrations`
- [ ] Create consolidated migration history
- [ ] Remove duplicate migration tracking systems

#### 2.2 Schema Conflict Resolution
**Tasks:**
- [ ] **Git Tracking Tables**: Keep `010_create_git_tracking_system.sql` (more comprehensive)
- [ ] Remove duplicate `2025_09_10_create_git_tracking_tables.sql`  
- [ ] **Embedding Dimensions**: Standardize to `vector(1536)` with check constraints
- [ ] **Complexity Tables**: Apply missing `015_create_code_complexity_tracking.sql`
- [ ] **Pattern Tables**: Merge competing pattern detection schemas

#### 2.3 Data Migration Strategy
**Tasks:**
- [ ] Create shadow tables with correct schema
- [ ] Implement dual-write pattern for 48-hour validation
- [ ] Back-fill inconsistent data with CTAS + reindex
- [ ] Cut over to new schema with feature flags
- [ ] Clean up old tables after validation

**Success Criteria:**
- ✅ Single migration history system
- ✅ Zero foreign key violations
- ✅ p99 query performance Δ≤5%
- ✅ All TypeScript models match database schema

**Risk Mitigation:**
- Shadow-write pattern allows instant rollback
- PITR restore points before each major change
- Performance monitoring during migration
- Rollback script: `PITR restore + env var DB_HOST=old-primary`

---

### **Phase 3: Configuration & Secrets Management** *(1 week)*
**Objective**: Centralize configuration and eliminate security risks

**Tasks:**
- [ ] Create `/config` directory with load order: `.env` → env vars → vault
- [ ] Adopt `dotenv-safe` for required variable validation
- [ ] Implement dynamic port assignment (`PORT=0` + OS assignment)
- [ ] Move secrets to HashiCorp Vault or AWS SSM
- [ ] Remove all hardcoded secrets from codebase
- [ ] Create environment-specific configuration validation

**Configuration Standards:**
```bash
# Centralized environment variables
AIDIS_DATABASE_URL=postgresql://user:pass@host:port/db
AIDIS_JWT_SECRET=randomly-generated-secret
AIDIS_HTTP_PORT=8080
AIDIS_MCP_BRIDGE_PORT=8081
AIDIS_COMMAND_DEV_PORT=5000
AIDIS_COMMAND_PROD_PORT=5001
```

**Success Criteria:**
- ✅ Zero hardcoded passwords in source: `grep -R 'password' src/ | wc -l = 0`
- ✅ All services start with environment validation
- ✅ Port conflicts eliminated
- ✅ Secrets externalized and encrypted

**Risk Mitigation:**
- Gradual migration with fallback to hardcoded values
- Environment validation prevents startup failures
- Secret rotation procedures documented

---

### **Phase 4: Service De-duplication** *(3 weeks)*
**Objective**: Eliminate redundant services and consolidate functionality

#### 4.1 Session Management Consolidation
**Tasks:**
- [ ] Audit all session management implementations
- [ ] Select strongest implementation (JWT+Redis recommended)
- [ ] Mark others deprecated behind feature flags
- [ ] Route 10% traffic to new implementation for validation
- [ ] Delete deprecated code after 2 successful releases

#### 4.2 Background Services Optimization  
**Tasks:**
- [ ] Migrate to single queue system (BullMQ recommended)
- [ ] Define job topics with exponential back-off
- [ ] Implement idempotency keys for all jobs
- [ ] Consolidate monitoring and pattern detection workers

#### 4.3 Process Cleanup
**Tasks:**
- [ ] Kill redundant nodemon/ts-node processes
- [ ] Implement proper process supervision
- [ ] Use SystemD service in production
- [ ] Create health check endpoints for all services

**Success Criteria:**
- ✅ Running container count reduced by 30%
- ✅ Zero duplicate alerts
- ✅ Single source of truth for each service type
- ✅ Clear service ownership and boundaries

**Risk Mitigation:**
- Feature flags enable gradual traffic migration
- Health checks prevent unhealthy service promotion
- Process monitoring ensures service availability

---

### **Phase 5: MCP Core & Parsing Hardening** *(2 weeks)*
**Objective**: Eliminate brittle MCP response parsing and strengthen protocol handling

**Tasks:**
- [ ] Rewrite MCP grammar using nearley with exhaustive unit tests
- [ ] Add runtime schema validation using Zod at ingress points
- [ ] Create strict versioned API (`/v2/mcp/*`)
- [ ] Implement proper error boundaries for MCP failures
- [ ] Add comprehensive fuzz testing with 10k+ corpus

**Success Criteria:**
- ✅ Fuzz tests crash-free for 24+ hours
- ✅ Schema validation prevents malformed data
- ✅ Versioned API prevents breaking changes
- ✅ Graceful degradation for MCP failures

**Risk Mitigation:**
- Gradual rollout with A/B testing
- Old parsing logic remains available via feature flag
- Comprehensive test suite prevents regressions

---

### **Phase 6: UI/Backend Contract & React Hardening** *(2 weeks)*
**Objective**: Eliminate UI-backend mismatches and strengthen frontend architecture

**Tasks:**
- [ ] Generate TypeScript API client from OpenAPI specification
- [ ] Remove all manual API typing and handwritten fetch layers
- [ ] Implement React Error Boundaries throughout component tree
- [ ] Add Suspense fallbacks for better loading states
- [ ] Adopt React-Query for state management and caching
- [ ] Add comprehensive error reporting with Sentry integration

**Success Criteria:**
- ✅ Lighthouse score ≥90 for performance and accessibility
- ✅ Zero uncaught exceptions in Sentry for one week
- ✅ Auto-generated API types eliminate UI-backend mismatches
- ✅ Graceful error handling throughout UI

**Risk Mitigation:**
- Component-level error boundaries prevent full app crashes
- Feature flags enable gradual component migration
- Automated UI testing prevents visual regressions

---

### **Phase 7: Clean-Up & Deprecation** *(1 week)*
**Objective**: Remove technical debt and optimize system footprint

**Tasks:**
- [ ] Delete unused environment variables and configuration files
- [ ] Remove obsolete scripts and containers
- [ ] Clean up old migration files after consolidation
- [ ] Archive documentation for removed components
- [ ] Optimize Docker images and reduce size
- [ ] Update dependency versions and security patches

**Success Criteria:**
- ✅ Dependency audit <5 high severity issues
- ✅ Docker image size reduced by 20%
- ✅ Codebase complexity metrics improved
- ✅ Documentation updated and accurate

**Risk Mitigation:**
- Archive instead of delete for potential recovery
- Gradual cleanup with validation at each step
- Maintain rollback capability for removed features

---

### **Phase 8: Post-Refactor Monitoring** *(Ongoing)*
**Objective**: Ensure system stability and continued architectural health

**Monitoring SLIs:**
- Error rate < 0.1%
- Latency p95 < 300ms  
- Database CPU < 70%
- Memory usage stable
- No schema conflicts or service duplications

**Ongoing Tasks:**
- [ ] Weekly architecture review for first month
- [ ] Monthly technical debt assessment
- [ ] Quarterly performance optimization review
- [ ] Continuous dependency security monitoring

---

## 🛡️ RISK MITIGATION STRATEGIES

### Universal Safety Mechanisms
- **Feature Flags**: Enable instant rollback with 1-5% traffic splits
- **Blue/Green Deployments**: Zero-downtime deployments with instant rollback
- **Canary Releases**: Gradual traffic migration with automated monitoring
- **Shadow Traffic Replay**: Test changes with production data in staging
- **Automated Smoke Tests**: Validate deployments before traffic routing

### Phase-Specific Rollback Procedures

#### Database Changes (Phase 2)
- **Strategy**: Point-in-time recovery (PITR) + environment variable switching
- **Command**: `DB_HOST=old-primary` + container redeployment
- **Recovery Time**: < 5 minutes

#### Service Changes (Phases 3-6)  
- **Strategy**: Helm rollback + cache invalidation
- **Command**: `helm rollback <revision-1>` + CloudFront cache clear
- **Recovery Time**: < 2 minutes

#### Feature Failures
- **Strategy**: Feature flag disable + traffic rerouting
- **Command**: Feature flag `OFF` returns traffic to legacy path
- **Recovery Time**: < 30 seconds

#### Emergency Procedures
- **Strategy**: Full system rollback to previous known good state
- **Command**: `make emergency-revert` (tags repo + redeploys previous image)
- **Recovery Time**: < 10 minutes

---

## 🔧 TECHNICAL SOLUTIONS

### Database Schema Standardization
```sql
-- Embedding dimensions standardized
ALTER TABLE contexts 
ALTER COLUMN embedding TYPE vector(1536);

-- Add check constraint for consistency
ALTER TABLE contexts 
ADD CONSTRAINT embedding_dimension_check 
CHECK (array_length(embedding, 1) = 1536);

-- Consolidated git tracking
DROP TABLE git_tracking_duplicate;
-- Keep comprehensive schema from 010_create_git_tracking_system.sql
```

### Service Architecture Optimization
- **BFF Pattern**: Single HTTP gateway for UI needs, internal gRPC between services
- **Bounded Contexts**: Group services by domain (interaction, analysis, data)
- **Container Orchestration**: Kubernetes + Helmfile for service management
- **Observability**: OpenTelemetry tracing with Envoy sidecars

### Configuration Management
```typescript
// Centralized config loader
const config = loadConfig({
  sources: ['.env', 'process.env', 'vault'],
  validation: configSchema,
  required: ['DATABASE_URL', 'JWT_SECRET']
});
```

---

## 📋 PRE-MERGE CHECKLIST

Before every merge to main branch:

- [ ] All tests passing (unit, integration, contract)
- [ ] Database migrations are idempotent
- [ ] Feature flags default to OFF
- [ ] Rollback procedures documented and tested
- [ ] Code owner assigned and SLA defined
- [ ] Performance impact assessed
- [ ] Security review completed (if applicable)

---

## 🎯 SUCCESS METRICS

### Technical Metrics
- **Test Coverage**: >70% for critical paths
- **Performance**: p95 latency <300ms
- **Reliability**: <0.1% error rate
- **Security**: Zero high-severity vulnerabilities
- **Maintainability**: Reduced cyclomatic complexity

### Operational Metrics  
- **Deployment Time**: <10 minutes
- **Recovery Time**: <5 minutes for any rollback
- **Development Velocity**: Maintained during refactoring
- **Service Count**: 30% reduction in redundant services

### Business Metrics
- **Zero Downtime**: No user-facing service interruptions
- **Feature Delivery**: Continued feature development during refactoring
- **Team Confidence**: Improved developer experience and system reliability

---

## 🚀 GETTING STARTED

1. **Review this plan** with your team and stakeholders
2. **Set up monitoring** and baseline metrics (Phase 0)
3. **Begin with safety nets** - this is non-negotiable (Phase 1)
4. **Execute phases sequentially** - don't skip ahead
5. **Validate each phase** before proceeding to the next
6. **Maintain communication** about progress and any issues

Remember: **This is your first major refactoring, and you're approaching it correctly.** The systematic, phased approach with comprehensive safety mechanisms will ensure success while minimizing risk.

**You've got this!** 🎯

---

*Generated by Oracle consultation on comprehensive AIDIS codebase analysis*
*Next Review: After Phase 1 completion*
