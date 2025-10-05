# Target Architecture - The Solution

## Clean Layered Architecture

``` mermaid
graph TB
    subgraph "Entry Point - Thin Router"
        MAIN["main.ts\n5 deps\nJust bootstraps the app"]
    end
    
    subgraph "API Layer - Routes Only"
        ROUTES["routes/\nThin route definitions\nNo business logic"]
    end
    
    subgraph "Handler Layer - Business Logic"
        H_COMPLEXITY["handlers/complexity.ts\nONE file, not 4"]
        H_METRICS["handlers/metrics.ts\nONE file, not 3"]
        H_PATTERNS["handlers/patterns.ts\nONE file, not 2"]
        H_SESSIONS["handlers/sessions.ts\nONE file, not separate analytics/tracking"]
        H_CODE["handlers/codeAnalysis.ts"]
        H_PROJECT["handlers/project.ts"]
        H_OTHER["handlers/..."]
    end
    
    subgraph "Service Layer - Core Logic"
        S_COMPLEXITY["services/ComplexityService.ts\nConsolidates complexity logic"]
        S_METRICS["services/MetricsService.ts\nConsolidates all metrics"]
        S_SESSIONS["services/SessionService.ts\nONE unified session manager"]
        S_PATTERNS["services/PatternService.ts"]
        S_GIT["services/GitService.ts"]
    end
    
    subgraph "Data Layer - Clean Abstraction"
        REPO["repositories/\nDatabase access only\nNo business logic"]
    end
    
    subgraph "Shared Infrastructure"
        DB["config/database.ts"]
        LOGGER["utils/logger.ts"]
        MIDDLEWARE["middleware/validation.ts\neventLogger.ts"]
    end
    
    MAIN --> ROUTES
    
    ROUTES --> H_COMPLEXITY
    ROUTES --> H_METRICS
    ROUTES --> H_PATTERNS
    ROUTES --> H_SESSIONS
    ROUTES --> H_CODE
    ROUTES --> H_PROJECT
    ROUTES --> H_OTHER
    
    H_COMPLEXITY --> S_COMPLEXITY
    H_METRICS --> S_METRICS
    H_PATTERNS --> S_PATTERNS
    H_SESSIONS --> S_SESSIONS
    H_PROJECT --> S_GIT
    
    S_COMPLEXITY --> REPO
    S_METRICS --> REPO
    S_SESSIONS --> REPO
    S_PATTERNS --> REPO
    S_GIT --> REPO
    
    REPO --> DB
    
    H_COMPLEXITY --> MIDDLEWARE
    H_METRICS --> MIDDLEWARE
    H_PATTERNS --> MIDDLEWARE
    
    S_COMPLEXITY --> LOGGER
    S_METRICS --> LOGGER
    S_PATTERNS --> LOGGER
    
    style MAIN fill:#6bcf7f,color:#000
    style S_COMPLEXITY fill:#a8dadc,color:#000
    style S_METRICS fill:#a8dadc,color:#000
    style S_SESSIONS fill:#a8dadc,color:#000
```

## The Consolidation Plan

### Phase 1: Merge Duplicates

**COMPLEXITY (4 files → 1 file)**
```
MERGE:
  handlers/codeComplexity.ts
  handlers/complexity/complexityAnalyze.ts
  handlers/complexity/complexityInsights.ts
  handlers/complexity/complexityManage.ts

INTO:
  handlers/complexity.ts (exports all functions)
  
RESULT: -3 files, clearer ownership
```

**METRICS (7 files → 2 files)**
```
MERGE:
  services/metricsCollector.ts
  services/metricsAggregator.ts
  services/metricsIntegration.ts
  services/metricsCorrelation.ts

INTO:
  services/MetricsService.ts (single class)

MERGE:
  handlers/metrics/metricsAnalyze.ts
  handlers/metrics/metricsCollect.ts
  handlers/metrics/metricsControl.ts
  
INTO:
  handlers/metrics.ts (single file, multiple exports)

RESULT: -5 files, single source of truth
```

**SESSIONS (8 files → 1 service)**
```
MERGE ALL:
  services/sessionManager.ts
  services/unifiedSessionManager.ts
  services/sessionMigrationManager.ts
  services/sessionMigrator.ts
  services/sessionRouter.ts
  services/sessionTracker.ts
  services/sessionMonitoring.ts
  services/sessionTimeout.ts

INTO:
  services/SessionService.ts (single class with all methods)

RESULT: -7 files, finally "unified"!
```

### Phase 2: Break Up server.ts

**Current: server.ts (41 deps)**

Split into:
```
src/
  main.ts (5 deps)
    - Just bootstraps the app
    - Calls setupRoutes()
    - Starts server
    
  routes/
    index.ts (exports all routes)
    complexity.routes.ts
    metrics.routes.ts
    sessions.routes.ts
    ...
```

**Result:** main.ts has 5 deps instead of 41. Adding a new handler doesn't touch main.ts.

### Phase 3: Add Repository Layer

**Current:** 46 files directly import `config/database.ts`

**Target:** 
```
handlers/ → services/ → repositories/ → database
```

Only repositories import database. Services call repositories. Handlers call services.

**Benefit:** 
- Can swap databases without touching 46 files
- Can mock repositories for testing
- Clear separation of concerns

## Visual Comparison

### BEFORE (Current)
```
server.ts (41 deps)
├── Every single handler
├── Every single service  
├── Every middleware
└── Every util

= IMPOSSIBLE TO UNDERSTAND OR TEST
```

### AFTER (Target)
```
main.ts (5 deps)
├── routes/
│   ├── complexity.routes.ts → handlers/complexity.ts → services/ComplexityService.ts
│   ├── metrics.routes.ts → handlers/metrics.ts → services/MetricsService.ts
│   └── sessions.routes.ts → handlers/sessions.ts → services/SessionService.ts
├── config/
└── middleware/

= CLEAR FLOW, EASY TO TEST
```

## Metrics Before vs After

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Total Files | 87 | ~55 | -32 files (37% reduction) |
| Complexity files | 4 | 1 | -3 files |
| Metrics files | 7 | 2 | -5 files |
| Session files | 8 | 1 | -7 files |
| Max dependencies | 41 | ~8 | 80% reduction |
| Deprecated code | 4 files | 0 | Clean! |
| Backup files | 2 | 0 | Use git! |

## The Refactoring Roadmap

**Week 1: Quick Wins**
1. Delete backup files (2 files)
2. Delete deprecated folder (4 files)
3. Git commit: "Remove dead code"

**Week 2: Merge Complexity**
1. Create `handlers/complexity.ts`
2. Move all logic from 4 files into one
3. Update imports
4. Delete old files
5. Test

**Week 3: Merge Metrics**
1. Create `services/MetricsService.ts`
2. Consolidate 4 services into one class
3. Create `handlers/metrics.ts`
4. Consolidate 3 handlers
5. Update imports
6. Test

**Week 4: Merge Sessions**
1. Create `services/SessionService.ts`
2. Consolidate all 8 session files
3. This is the hardest one - take your time
4. Test thoroughly

**Week 5: Break up server.ts**
1. Create `main.ts` and `routes/`
2. Move route definitions to routes/
3. Keep main.ts minimal
4. Test

**Result:** From 87 files with unclear ownership to ~55 files with clear responsibilities.

