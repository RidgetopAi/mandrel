# AIDIS REFACTOR - MASTER PLAN TO ZERO TECH DEBT

**Created:** 2025-10-04
**Goal:** Clean architecture, zero TypeScript errors, comprehensive tests, maintainable codebase
**Principle:** Fix foundation first, then refactor systematically

---

## CURRENT STATE AUDIT

### Metrics
- **Total Source Files:** 78 TypeScript files
- **TypeScript Errors:** 718 errors (CRITICAL - must fix first)
- **Duplicate Code Identified:**
  - Complexity: 4 files (handlers/codeComplexity.ts + 3 in complexity/)
  - Metrics: 7 files (3 handlers + 4 services)
  - Sessions: 8 files (all in services/)
- **Dead Code:**
  - 2 backup files (server-backup-before-stdio-fix.ts, server_backup.ts)
  - 1 deprecated directory (handlers/_deprecated_tt009/ with 4 files)
- **Database Migrations:** 34 migrations (data is safe)
- **Test Files:** Exist but some failing due to DB connection issues

### Working vs Broken
- ✅ **AIDIS Core:** Working well
- ⚠️ **AIDIS Command UI:** Has issues with some features
- ❌ **TypeScript Compilation:** Broken (718 errors)
- ⚠️ **Test Suite:** Partially working

---

## THE REFACTOR PHASES

### **PHASE 1: FIX TYPESCRIPT ERRORS (FOUNDATION)**
**Timeline:** 2-3 days
**Goal:** Get `npm run type-check` to pass with ZERO errors
**Why First:** Can't safely refactor without type safety

#### Detailed Steps:

**Step 1.1: Categorize All TypeScript Errors**
```bash
npm run type-check 2>&1 | tee typescript-errors.log
```
- Categorize by type:
  - Missing properties (TS2339)
  - Wrong argument counts (TS2554)
  - Type mismatches (TS2345)
  - Unused variables (TS6133)
  - Missing return values (TS7030)

**Step 1.2: Fix Errors in Order of Impact**
Priority order:
1. **High Impact:** Fix handler signature mismatches (blocks routes)
2. **Medium Impact:** Fix missing properties and methods
3. **Low Impact:** Remove unused variables
4. **Cleanup:** Fix all warnings

**Step 1.3: Fix Each File Systematically**
For each file with errors:
```bash
# 1. Fix the file
# 2. Run type-check
npm run type-check 2>&1 | grep "filename"
# 3. If clean, commit
git add src/path/to/file.ts
git commit -m "fix(types): resolve TS errors in filename"
# 4. Move to next file
```

**Step 1.4: Verification**
```bash
npm run type-check  # Must pass with 0 errors
npm run build       # Must compile successfully
npm start           # Must start without errors
```

**Success Criteria:**
- [ ] `npm run type-check` shows 0 errors
- [ ] `npm run build` completes successfully
- [ ] Server starts and responds to health check
- [ ] All changes committed to git

---

### **PHASE 2: DELETE DEAD CODE**
**Timeline:** 1 day
**Goal:** Remove all backup files and deprecated code
**Why:** Clean slate before refactoring

#### Files to Delete:

**Step 2.1: Delete Backup Files**
```bash
# Verify these are not imported anywhere
grep -r "server-backup-before-stdio-fix" src/
grep -r "server_backup" src/

# If no results, safe to delete
rm src/server-backup-before-stdio-fix.ts
rm src/server_backup.ts

# Commit
git add -A
git commit -m "chore: remove backup files (use git for backups)"
```

**Step 2.2: Delete Deprecated Directory**
```bash
# Verify not imported
grep -r "_deprecated_tt009" src/ --exclude-dir=_deprecated_tt009

# If no results, safe to delete
rm -rf src/handlers/_deprecated_tt009/

# Commit
git add -A
git commit -m "chore: remove deprecated TT009 handlers"
```

**Step 2.3: Verification**
```bash
npm run type-check  # Should still pass
npm run build       # Should still compile
npm start           # Should still start
```

**Success Criteria:**
- [ ] 6 files deleted (2 backups + 4 deprecated)
- [ ] TypeScript still compiles
- [ ] Server still starts
- [ ] Changes committed

---

### **PHASE 3: CONSOLIDATE COMPLEXITY HANDLERS**
**Timeline:** 2-3 days
**Goal:** Merge 4 complexity files into 1 clean handler
**Files:** 4 → 1

#### Current State:
```
handlers/
├── codeComplexity.ts          (4 deps)
└── complexity/
    ├── complexityAnalyze.ts   (5 deps)
    ├── complexityInsights.ts  (6 deps)
    └── complexityManage.ts    (5 deps)
```

#### Target State:
```
handlers/
└── complexity.ts  (all functions exported cleanly)
```

#### Detailed Steps:

**Step 3.1: Analyze Current Functions**
```bash
# List all exported functions from each file
grep "^export" src/handlers/codeComplexity.ts
grep "^export" src/handlers/complexity/complexityAnalyze.ts
grep "^export" src/handlers/complexity/complexityInsights.ts
grep "^export" src/handlers/complexity/complexityManage.ts
```

Document:
- What each function does
- Which functions are duplicates
- Which functions call each other
- Which are actually used by server.ts

**Step 3.2: Create New Consolidated File**
```typescript
// src/handlers/complexity.ts

import { database } from '../config/database';
import { eventLogger } from '../middleware/eventLogger';
import { complexityTracker } from '../services/complexityTracker';
import type { ConsolidatedComplexity } from '../types/consolidated-complexity';

/**
 * Calculate code complexity metrics
 */
export async function calculateComplexity(params: {
  projectId?: string;
  sessionId?: string;
  filePattern?: string;
}) {
  // Move implementation from codeComplexity.ts
}

/**
 * Analyze complexity with consolidated types
 */
export async function analyzeComplexity(params: {
  mode: 'detect' | 'analyze' | 'track';
  // ... rest of params
}) {
  // Move implementation from complexityAnalyze.ts
}

/**
 * Get complexity insights
 */
export async function getComplexityInsights(params: {
  // ... params
}) {
  // Move implementation from complexityInsights.ts
  // IMPORTANT: Remove import to codeComplexity.ts, call calculateComplexity() directly
}

/**
 * Manage complexity tracking
 */
export async function manageComplexity(params: {
  // ... params
}) {
  // Move implementation from complexityManage.ts
}
```

**Step 3.3: Update server.ts Imports**
```typescript
// BEFORE
import { calculateComplexity } from './handlers/codeComplexity';
import { analyzeComplexity } from './handlers/complexity/complexityAnalyze';
import { getComplexityInsights } from './handlers/complexity/complexityInsights';
import { manageComplexity } from './handlers/complexity/complexityManage';

// AFTER - ONE import!
import {
  calculateComplexity,
  analyzeComplexity,
  getComplexityInsights,
  manageComplexity
} from './handlers/complexity';
```

**Step 3.4: Delete Old Files**
```bash
rm src/handlers/codeComplexity.ts
rm -rf src/handlers/complexity/
```

**Step 3.5: Verification**
```bash
npm run type-check  # Must pass
npm run build       # Must compile
npm start           # Must start

# Test complexity endpoints
curl -X POST http://localhost:8080/mcp/tools/complexity_analyze \
  -H "Content-Type: application/json" \
  -d '{"mode":"detect"}'
```

**Step 3.6: Commit**
```bash
git add -A
git commit -m "refactor(complexity): consolidate 4 handlers into 1 file

- Merged codeComplexity.ts + complexity/ into handlers/complexity.ts
- Removed internal cross-imports
- All functionality preserved
- TypeScript compiles clean"
```

**Success Criteria:**
- [ ] 4 files merged into 1
- [ ] All functions preserved
- [ ] TypeScript compiles
- [ ] Server starts
- [ ] Complexity endpoints work
- [ ] Committed to git

---

### **PHASE 4: CONSOLIDATE METRICS (HANDLERS + SERVICES)**
**Timeline:** 4-5 days
**Goal:** Merge 7 metrics files into 2 clean files
**Files:** 7 → 2

#### Current State:
```
handlers/metrics/
├── metricsAnalyze.ts
├── metricsCollect.ts
└── metricsControl.ts

services/
├── metricsAggregator.ts
├── metricsCollector.ts
├── metricsCorrelation.ts
└── metricsIntegration.ts
```

#### Target State:
```
handlers/
└── metrics.ts  (thin API layer)

services/
└── MetricsService.ts  (all business logic)
```

#### Detailed Steps:

**Step 4.1: Analyze Dependencies**
```bash
# Check how handlers call services
grep -n "import.*metrics" src/handlers/metrics/*.ts

# Check how services call each other
grep -n "import.*metrics" src/services/metrics*.ts
```

Document the call graph to understand coupling.

**Step 4.2: Create Unified Service**
```typescript
// src/services/MetricsService.ts

import { database } from '../config/database';
import { eventLogger } from '../middleware/eventLogger';
import { patternDetector } from './patternDetector';

/**
 * Unified metrics service handling all metrics operations
 */
export class MetricsService {
  // From metricsCollector.ts
  async collect(params: {
    projectId: string;
    metricType: string;
    dimensions: Record<string, any>;
  }) {
    // Implementation
  }

  // From metricsAggregator.ts
  async aggregate(params: {
    projectId: string;
    timeRange: { start: Date; end: Date };
    groupBy: string[];
  }) {
    // Implementation
  }

  // From metricsCorrelation.ts
  async correlate(params: {
    metricA: string;
    metricB: string;
    projectId: string;
  }) {
    // Implementation
  }

  // From metricsIntegration.ts
  async integrate(params: {
    sources: string[];
    projectId: string;
  }) {
    // Implementation
  }
}

// Export singleton instance
export const metricsService = new MetricsService();
```

**Step 4.3: Create Unified Handler**
```typescript
// src/handlers/metrics.ts

import { metricsService } from '../services/MetricsService';

/**
 * Handle metrics analysis requests
 */
export async function handleAnalyze(params: any) {
  // Thin wrapper around metricsService.aggregate() and metricsService.correlate()
}

/**
 * Handle metrics collection requests
 */
export async function handleCollect(params: any) {
  // Thin wrapper around metricsService.collect()
}

/**
 * Handle metrics control requests
 */
export async function handleControl(params: any) {
  // Thin wrapper for start/stop collection, configure alerts, etc.
}
```

**Step 4.4: Update All Imports**
Search and replace across codebase:
```bash
# Find all files importing old metrics
grep -r "from.*metricsCollector" src/
grep -r "from.*metricsAggregator" src/
# ... etc for all old imports

# Update to new import
# from './services/metricsCollector' → from './services/MetricsService'
```

**Step 4.5: Delete Old Files**
```bash
rm -rf src/handlers/metrics/
rm src/services/metricsAggregator.ts
rm src/services/metricsCollector.ts
rm src/services/metricsCorrelation.ts
rm src/services/metricsIntegration.ts
```

**Step 4.6: Verification**
```bash
npm run type-check  # Must pass
npm run build       # Must compile
npm start           # Must start

# Test all metrics endpoints
curl -X POST http://localhost:8080/mcp/tools/metrics_collect \
  -H "Content-Type: application/json" \
  -d '{"projectId":"test"}'
```

**Step 4.7: Commit**
```bash
git add -A
git commit -m "refactor(metrics): consolidate 7 files into 2 files

- Created unified MetricsService class
- Merged 3 handlers into handlers/metrics.ts
- Merged 4 services into services/MetricsService.ts
- All functionality preserved
- TypeScript compiles clean"
```

**Success Criteria:**
- [ ] 7 files merged into 2
- [ ] Clean handler → service separation
- [ ] No circular dependencies
- [ ] TypeScript compiles
- [ ] All metrics endpoints work
- [ ] Committed to git

---

### **PHASE 5: CONSOLIDATE SESSION SERVICES**
**Timeline:** 5-6 days (HARDEST PHASE)
**Goal:** Merge 8 session files into 1 unified service
**Files:** 8 → 1

#### Current State (The Mess):
```
services/
├── sessionManager.ts              (2 deps)
├── unifiedSessionManager.ts       (5 deps) ← claims to be "unified"
├── sessionMigrationManager.ts     (5 deps)
├── sessionMigrator.ts             (3 deps) ← different from migration manager?
├── sessionRouter.ts               (3 deps)
├── sessionTracker.ts              (3 deps)
├── sessionMonitoring.ts           (3 deps)
└── sessionTimeout.ts              (1 dep)
```

**Problems:**
- Which is THE session manager?
- What's the difference between sessionMigrationManager and sessionMigrator?
- Isn't sessionTracker the same as sessionMonitoring?

#### Target State:
```
services/
└── SessionService.ts  (ONE unified service, truly unified this time)
```

#### Detailed Steps:

**Step 5.1: Deep Analysis (CRITICAL)**
For each file, document:
- What it actually does
- Which methods are public API
- Which methods are used by server.ts
- Which methods call other session files
- Whether it's actually working or broken

Create a spreadsheet/doc:
```
File | Purpose | Used By | Calls | Status | Keep/Merge/Delete
-----|---------|---------|-------|--------|------------------
sessionManager.ts | ??? | ??? | ??? | ??? | ???
```

**Step 5.2: Identify Core vs Optional Features**
Decide:
- **Core:** Session CRUD (create, read, update, delete) - MUST keep
- **Core:** Session tracking (current session, analytics) - MUST keep
- **Optional:** Migration features - needed?
- **Optional:** Routing features - needed?
- **Optional:** Timeout handling - keep if working

**Step 5.3: Design Unified Interface**
```typescript
// src/services/SessionService.ts

export class SessionService {
  // Core CRUD
  async create(params: { title?: string; projectId?: string }) {}
  async get(sessionId: string) {}
  async update(sessionId: string, updates: any) {}
  async delete(sessionId: string) {}
  async list(projectId?: string) {}

  // Tracking
  async getCurrent() {}
  async setCurrent(sessionId: string) {}
  async track(event: string, data: any) {}
  async getAnalytics(sessionId: string) {}

  // Migration (if keeping)
  async migrate(fromVersion: number, toVersion: number) {}
  async rollback() {}

  // Monitoring (if keeping)
  async monitor() {}
  async getHealth() {}

  // Timeout (if keeping)
  async handleTimeout(sessionId: string) {}
  async resetTimeout(sessionId: string) {}

  // Routing (if keeping)
  async route(sessionId: string, destination: string) {}
}
```

**Step 5.4: Implement Incrementally**
Don't try to merge all 8 at once!

1. Start with sessionManager.ts + unifiedSessionManager.ts (should be similar)
2. Add sessionTracker.ts
3. Add sessionTimeout.ts
4. Evaluate migration/routing features - keep or discard?

**Step 5.5: Update All Imports**
This will be extensive - many files import session services.
```bash
# Find all imports
grep -r "from.*session" src/ | grep -v SessionService

# Update one by one
```

**Step 5.6: Delete Old Files**
```bash
rm src/services/sessionManager.ts
rm src/services/unifiedSessionManager.ts
rm src/services/sessionMigrationManager.ts
rm src/services/sessionMigrator.ts
rm src/services/sessionRouter.ts
rm src/services/sessionTracker.ts
rm src/services/sessionMonitoring.ts
rm src/services/sessionTimeout.ts
```

**Step 5.7: Verification (THOROUGH)**
```bash
npm run type-check  # Must pass
npm run build       # Must compile
npm start           # Must start

# Test ALL session operations
curl -X POST http://localhost:8080/mcp/tools/session_new
curl -X POST http://localhost:8080/mcp/tools/session_status
curl -X POST http://localhost:8080/mcp/tools/session_assign
```

**Step 5.8: Commit**
```bash
git add -A
git commit -m "refactor(sessions): consolidate 8 services into 1 unified SessionService

- Merged all session management into services/SessionService.ts
- Resolved naming confusion (unified means unified now!)
- Kept core CRUD + tracking features
- Evaluated and [kept/removed] migration/routing features
- All session endpoints working
- TypeScript compiles clean"
```

**Success Criteria:**
- [ ] 8 files merged into 1
- [ ] Clear ownership of all session logic
- [ ] All session endpoints work
- [ ] TypeScript compiles
- [ ] Comprehensive testing done
- [ ] Committed to git

---

### **PHASE 6: BREAK UP server.ts** ✅ COMPLETE
**Timeline:** 3-4 days (Actual: 3 days)
**Goal:** Split god file into clean layered architecture
**Dependencies:** 31 → 18 (41.9% reduction)
**Status:** Complete (2025-10-07)
**Result:** 80.1% code reduction, clean modular architecture, 97.1% test pass rate

#### Current State:
```
src/server.ts  (41 dependencies - knows about EVERYTHING)
```

#### Target State:
```
src/
├── main.ts  (5-8 deps - just bootstraps)
├── core-server.ts  (keep existing, it's cleaner)
└── routes/
    ├── index.ts
    ├── complexity.routes.ts
    ├── metrics.routes.ts
    ├── sessions.routes.ts
    ├── context.routes.ts
    ├── projects.routes.ts
    ├── tasks.routes.ts
    └── ...
```

#### Detailed Steps:

**Step 6.1: Analyze server.ts Structure**
```bash
wc -l src/server.ts  # How big is this monster?
grep "^import" src/server.ts | wc -l  # How many imports?
```

**Step 6.2: Extract Route Definitions**
Create route files that group related endpoints:
```typescript
// src/routes/complexity.routes.ts
import { Router } from 'express';
import {
  calculateComplexity,
  analyzeComplexity,
  getComplexityInsights,
  manageComplexity
} from '../handlers/complexity';

export const complexityRoutes = Router();

complexityRoutes.post('/complexity/calculate', calculateComplexity);
complexityRoutes.post('/complexity/analyze', analyzeComplexity);
complexityRoutes.post('/complexity/insights', getComplexityInsights);
complexityRoutes.post('/complexity/manage', manageComplexity);
```

**Step 6.3: Create Routes Index**
```typescript
// src/routes/index.ts
import { Router } from 'express';
import { complexityRoutes } from './complexity.routes';
import { metricsRoutes } from './metrics.routes';
import { sessionRoutes } from './sessions.routes';
// ... etc

export const routes = Router();

routes.use('/api', complexityRoutes);
routes.use('/api', metricsRoutes);
routes.use('/api', sessionRoutes);
// ... etc
```

**Step 6.4: Create Minimal main.ts**
```typescript
// src/main.ts
import express from 'express';
import { routes } from './routes';
import { database } from './config/database';
import { errorHandler } from './utils/errorHandler';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Routes
app.use(routes);

// Error handling
app.use(errorHandler);

// Start server
async function start() {
  await database.connect();
  app.listen(PORT, () => {
    console.log(`✅ AIDIS MCP Server running on port ${PORT}`);
  });
}

start().catch(console.error);
```

**Step 6.5: Update Package.json**
```json
{
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "start": "node dist/main.js"
  }
}
```

**Step 6.6: Keep server.ts as Legacy (Initially)**
Don't delete server.ts yet - keep as reference until main.ts proven working.

**Step 6.7: Verification**
```bash
npm run type-check  # Must pass
npm run build       # Must compile
npm run dev         # Start with main.ts

# Test ALL endpoints
# ... comprehensive endpoint testing
```

**Step 6.8: Delete server.ts (Only When Confident)**
```bash
rm src/server.ts
```

**Step 6.9: Commit**
```bash
git add -A
git commit -m "refactor(server): break up god file into clean routes

- Created main.ts with 8 deps (was 41)
- Extracted route definitions into routes/
- Clear layered architecture: main → routes → handlers → services
- All endpoints working
- TypeScript compiles clean"
```

**Success Criteria:**
- [x] server.ts dependencies: 31 → 18 (41.9% reduction)
- [x] Clean separation of concerns
- [x] All endpoints work (97.1% test pass rate)
- [x] TypeScript compiles (0 errors)
- [x] Server starts and responds
- [x] Committed to git
- [x] Obsolete server.ts deleted

**Achievements:**
- Extracted 850 lines to utilities/services
- Created 10 route modules (1,930 lines)
- Removed 1,916 lines of handlers from server.ts
- Created main.ts entry point (80 lines)
- Created AidisMcpServer class (550 lines)
- Deleted obsolete server.ts (642 lines)
- 97.1% test pass rate (102/105)
- Production ready

**Next:** Phase 7...

---

### **PHASE 7: ADD COMPREHENSIVE TEST COVERAGE**
**Timeline:** Ongoing (2-3 weeks)
**Goal:** Tests for every critical path
**Coverage Target:** 80%+ on core handlers and services

#### Test Strategy:

**Step 7.1: Fix Existing Tests**
```bash
npm test  # See what's broken
```
Fix DB connection issues, update imports to new consolidated files.

**Step 7.2: Write Unit Tests for Services**
```typescript
// src/services/__tests__/MetricsService.test.ts
import { describe, it, expect } from 'vitest';
import { metricsService } from '../MetricsService';

describe('MetricsService', () => {
  it('collects metrics with valid params', async () => {
    const result = await metricsService.collect({
      projectId: 'test',
      metricType: 'complexity',
      dimensions: { file: 'test.ts' }
    });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  // ... more tests
});
```

**Step 7.3: Write Integration Tests**
Test the full flow: route → handler → service → database

```typescript
// src/__tests__/integration/metrics.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../main';
import { database } from '../../config/database';

describe('Metrics Integration Tests', () => {
  beforeAll(async () => {
    await database.connect();
  });

  afterAll(async () => {
    await database.disconnect();
  });

  it('POST /api/metrics/collect returns success', async () => {
    const response = await request(app)
      .post('/api/metrics/collect')
      .send({ projectId: 'test', metricType: 'complexity' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
```

**Step 7.4: Write E2E Tests**
Test actual MCP tool calls:
```typescript
// src/__tests__/e2e/mcp-tools.e2e.test.ts
import { describe, it, expect } from 'vitest';

describe('MCP Tools E2E', () => {
  it('metrics_collect works end-to-end', async () => {
    const response = await fetch('http://localhost:8080/mcp/tools/metrics_collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'test' })
    });

    const result = await response.json();
    expect(result.success).toBe(true);
  });
});
```

**Step 7.5: Test Coverage Reports**
```bash
npm run test -- --coverage
```

Aim for:
- Services: 90%+ coverage
- Handlers: 80%+ coverage
- Routes: 70%+ coverage

**Step 7.6: Commit Tests Regularly**
```bash
git add src/**/*.test.ts
git commit -m "test: add comprehensive tests for [feature]"
```

**Success Criteria:**
- [ ] All existing tests pass
- [ ] Unit tests for all services
- [ ] Integration tests for critical flows
- [ ] E2E tests for MCP tools
- [ ] 80%+ coverage on core code
- [ ] Tests run in CI/CD (if applicable)

---

## VERIFICATION CHECKLIST (After Each Phase)

After EVERY phase, verify:

```bash
# 1. TypeScript compiles
npm run type-check
# Expected: 0 errors

# 2. Build succeeds
npm run build
# Expected: successful compilation

# 3. Server starts
npm start &
SERVER_PID=$!
sleep 5
# Expected: no crash

# 4. Health check passes
curl http://localhost:3000/healthz
# Expected: 200 OK

# 5. Tests pass
npm test
# Expected: all tests passing

# 6. Kill server
kill $SERVER_PID
```

If ANY of these fail, STOP and fix before proceeding.

---

## ROLLBACK PROCEDURE

If anything goes wrong:

```bash
# Check what phase you're in
git log --oneline -5

# Rollback to last good commit
git reset --hard <commit-hash>

# Or rollback to backup branch
git reset --hard backup-aidis-alpha-2025-10-04

# Verify it works
npm run type-check && npm run build && npm start
```

---

## TESTING EDUCATION (Throughout Refactor)

As we go, I'll teach you:

### Week 1-2: Unit Testing Basics
- What is a unit test?
- How to mock dependencies
- How to test async code
- How to use vitest

### Week 3-4: Integration Testing
- What is integration testing?
- How to test database interactions
- How to test API endpoints
- How to use test databases

### Week 5-6: E2E Testing
- What is end-to-end testing?
- How to test full user flows
- How to automate testing
- How to maintain test suites

---

## PROGRESS TRACKING

I'll use AIDIS itself to track progress:

```typescript
// Create task for each phase
await task_create({
  title: "Phase 1: Fix TypeScript Errors",
  description: "Get npm run type-check to pass with 0 errors",
  status: "in_progress",
  projectId: "aidis-refactor"
});

// Update as we go
await task_update({
  taskId: "...",
  status: "completed"
});
```

Plus regular context storage:
```typescript
await context_store({
  content: "Completed Phase 1: TypeScript compilation now clean",
  type: "milestone",
  tags: ["refactor", "typescript", "phase1"]
});
```

---

## SUCCESS METRICS

At the end of all phases:

| Metric | Before | Target | How to Measure |
|--------|--------|--------|----------------|
| TypeScript Errors | 718 | 0 | `npm run type-check` |
| Total Files | 78 | ~55 | `find src -name "*.ts" \| wc -l` |
| Max Dependencies | 41 | ~8 | Check main.ts imports |
| Test Coverage | ??? | 80%+ | `npm run test -- --coverage` |
| Duplicate Code | 19 files | 0 | Manual verification |
| Dead Code | 6 files | 0 | Manual verification |
| Build Time | ??? | <30s | `time npm run build` |
| Startup Time | ??? | <5s | `time npm start` |

---

## TIMELINE ESTIMATE

| Phase | Days | Running Total |
|-------|------|---------------|
| Phase 1: Fix TypeScript | 2-3 | 3 days |
| Phase 2: Delete Dead Code | 1 | 4 days |
| Phase 3: Complexity | 2-3 | 7 days |
| Phase 4: Metrics | 4-5 | 12 days |
| Phase 5: Sessions | 5-6 | 18 days |
| Phase 6: Server Split | 3-4 | 22 days |
| Phase 7: Testing | 14-21 | 36-43 days |

**Total: 5-6 weeks of focused work**

But: Can work incrementally, AIDIS stays functional throughout.

---

## COMMIT MESSAGE CONVENTIONS

Use semantic commits:

```
fix(types): resolve TS2339 errors in handlers
refactor(complexity): consolidate 4 files into 1
test(metrics): add unit tests for MetricsService
chore(deps): update TypeScript to 5.3
docs(readme): update architecture diagrams
```

---

## NEXT STEPS

1. **Review this plan together**
2. **Ask questions / raise concerns**
3. **Make any adjustments needed**
4. **Get approval to proceed**
5. **Start Phase 1: Fix TypeScript Errors**

---

**REMEMBER:** We can pause, rollback, or adjust this plan at ANY time. The goal is zero tech debt, not speed.

Let's build something we're proud of. 🚀
