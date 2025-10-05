# Visual Consolidation Guide

## 🎯 Your Three Big Merges (Visual)

### 1. COMPLEXITY CONSOLIDATION

``` mermaid
graph LR
    subgraph "BEFORE - 4 Scattered Files"
        A["handlers/codeComplexity.ts\n(4 deps)"]
        B["handlers/complexity/complexityAnalyze.ts\n(5 deps)"]
        C["handlers/complexity/complexityInsights.ts\n(6 deps)"]
        D["handlers/complexity/complexityManage.ts\n(5 deps)"]
    end
    
    subgraph "AFTER - 1 Clear File"
        NEW["handlers/complexity.ts\n~6 deps\n\nexports:\n- analyzeComplexity()\n- getInsights()\n- manageComplexity()\n- calculateMetrics()"]
    end
    
    A -. merge .-> NEW
    B -. merge .-> NEW
    C -. merge .-> NEW
    D -. merge .-> NEW
    
    style NEW fill:#6bcf7f,color:#000
```

**What each file currently does:**
- `codeComplexity.ts` - Basic complexity calculation
- `complexityAnalyze.ts` - Deeper analysis with consolidated types
- `complexityInsights.ts` - Generates insights, calls codeComplexity.ts (!)
- `complexityManage.ts` - Management operations

**The problem:** `complexityInsights.ts` imports `codeComplexity.ts` - they're doing the same thing!

**The solution:** One file with clear exported functions.

---

### 2. METRICS CONSOLIDATION (The Big One!)

``` mermaid
graph TB
    subgraph "BEFORE - 7 Files Doing Similar Things"
        direction TB
        H1["handlers/metrics/metricsAnalyze.ts"]
        H2["handlers/metrics/metricsCollect.ts"]
        H3["handlers/metrics/metricsControl.ts"]
        
        S1["services/metricsCollector.ts"]
        S2["services/metricsAggregator.ts"]
        S3["services/metricsIntegration.ts"]
        S4["services/metricsCorrelation.ts"]
        
        H1 --> S2
        H1 --> S4
        H2 --> S1
        H3 --> S1
        S3 --> S1
        S1 --> patternDetector
    end
    
    subgraph "AFTER - Clean 2-File Structure"
        direction TB
        HANDLER["handlers/metrics.ts\n\nThin API handlers:\n- handleAnalyze()\n- handleCollect()\n- handleControl()"]
        
        SERVICE["services/MetricsService.ts\n\nAll business logic:\n- collect()\n- aggregate()\n- correlate()\n- integrate()"]
        
        HANDLER --> SERVICE
        SERVICE --> DB["(database)"]
    end
    
    style HANDLER fill:#a8dadc,color:#000
    style SERVICE fill:#6bcf7f,color:#000
```

**Current tangled web:**
- Handlers call multiple services
- Services call each other
- Logic spread across 7 files
- Where do you add new metrics code? Nobody knows!

**Clean structure:**
- Handlers = thin wrappers, just parse request/response
- Service = all the business logic in ONE place
- Clear ownership

---

### 3. SESSIONS CONSOLIDATION (The Messiest!)

``` mermaid
graph TB
    subgraph "BEFORE - 8 Files (Unclear Ownership)"
        SM1["sessionManager.ts\n(2 deps)"]
        SM2["unifiedSessionManager.ts\n(5 deps)\nWhy isn't this unified?"]
        SM3["sessionMigrationManager.ts\n(5 deps)"]
        SM4["sessionMigrator.ts\n(3 deps)\nDifferent from migration manager?"]
        SM5["sessionRouter.ts\n(3 deps)"]
        SM6["sessionTracker.ts\n(3 deps)"]
        SM7["sessionMonitoring.ts\n(3 deps)"]
        SM8["sessionTimeout.ts\n(1 dep)"]
        
        SM3 --> SM2
        SM2 --> SM5
        SM7 --> SM5
    end
    
    subgraph "AFTER - ONE Unified Service"
        USS["services/SessionService.ts\n\nclass SessionService {\n  // Core\n  create()\n  get()\n  update()\n  delete()\n\n  // Tracking\n  track()\n  getAnalytics()\n\n  // Migration\n  migrate()\n  rollback()\n\n  // Monitoring\n  monitor()\n  handleTimeout()\n\n  // Routing\n  route()\n}"]
    end
    
    SM1 -. consolidate .-> USS
    SM2 -. consolidate .-> USS
    SM3 -. consolidate .-> USS
    SM4 -. consolidate .-> USS
    SM5 -. consolidate .-> USS
    SM6 -. consolidate .-> USS
    SM7 -. consolidate .-> USS
    SM8 -. consolidate .-> USS

    style USS fill:#6bcf7f,color:#000
```

**The naming confusion:**
- `sessionManager` vs `unifiedSessionManager` - which one is "the" manager?
- `sessionMigrationManager` vs `sessionMigrator` - what's the difference?
- `sessionTracker` vs `sessionMonitoring` - aren't these the same?

**Solution:** ONE service class with all methods. Period.

---

## 📋 Step-by-Step Merge Example: Complexity

Let me show you EXACTLY how to do one merge:

### Step 1: Create the new file

```bash
cd ~/aidis/mcp-server
touch src/handlers/complexity.ts
```

### Step 2: Move all the functions

```typescript
// src/handlers/complexity.ts
import { database } from '../config/database';
import { eventLogger } from '../middleware/eventLogger';
import { complexityTracker } from '../services/complexityTracker';
import { sessionManager } from '../services/sessionManager';
import type { ConsolidatedComplexity } from '../types/consolidated-complexity';

// From codeComplexity.ts
export async function calculateComplexity(params: any) {
  // Move implementation here
}

// From complexityAnalyze.ts
export async function analyzeComplexity(params: any) {
  // Move implementation here
}

// From complexityInsights.ts
export async function getComplexityInsights(params: any) {
  // Move implementation here
  // Remove the import to codeComplexity.ts - call calculateComplexity() directly
}

// From complexityManage.ts
export async function manageComplexity(params: any) {
  // Move implementation here
}
```

### Step 3: Update server.ts

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

### Step 4: Delete old files

```bash
rm src/handlers/codeComplexity.ts
rm -rf src/handlers/complexity/
```

### Step 5: Test

```bash
npm test
# Or run your test suite
```

**Result:** 4 files → 1 file, same functionality, clearer ownership!

---

## 🎨 Visual Summary: Files to Delete vs Keep

```mermaid
graph LR
    subgraph "❌ DELETE THESE (16 files)"
        D1[server-backup-before-stdio-fix.ts]
        D2[server_backup.ts]
        D3[handlers/_deprecated_tt009/*<br/>4 files]
        D4[handlers/codeComplexity.ts]
        D5[handlers/complexity/*<br/>3 files]
        D6[handlers/metrics/*<br/>3 files - merge to 1]
        D7[services/session*<br/>8 files - merge to 1]
        D8[services/metrics*<br/>4 files - merge to 1]
    end
    
    subgraph "✅ CREATE THESE (3 files)"
        C1[handlers/complexity.ts]
        C2[handlers/metrics.ts]
        C3[services/SessionService.ts]
        C4[services/MetricsService.ts]
    end
    
    subgraph "✅ KEEP AS-IS"
        K1[handlers/project.ts<br/>Good already]
        K2[handlers/codeAnalysis.ts<br/>Clear purpose]
        K3[handlers/context.ts<br/>Not duplicated]
        K4[utils/*<br/>Shared properly]
        K5[config/*<br/>Configuration]
        K6[middleware/*<br/>Good structure]
    end
    
    style D1 fill:#ff6b6b
    style D2 fill:#ff6b6b
    style D3 fill:#ff6b6b
    style C1 fill:#6bcf7f
    style C2 fill:#6bcf7f
    style C3 fill:#6bcf7f
```

## 📊 Impact Analysis

| Action | Files Deleted | Files Created | Net Change |
|--------|--------------|---------------|------------|
| Delete backups | -2 | 0 | -2 |
| Delete deprecated | -4 | 0 | -4 |
| Merge complexity | -4 | +1 | -3 |
| Merge metrics | -7 | +2 | -5 |
| Merge sessions | -8 | +1 | -7 |
| **TOTAL** | **-25** | **+4** | **-21 files** |

**Result: 87 files → 66 files (24% reduction)**

And more importantly: **crystal clear ownership** of every piece of code.

