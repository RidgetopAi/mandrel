``` mermaid
graph TB
    subgraph "THE PROBLEM"
        SERVER["server.ts\n41 DEPENDENCIES\n🔴 GOD FILE"]
    end
    
    subgraph "Configuration"
        DB["config/database.ts"]
        TOOLS["config/toolDefinitions.ts"]
    end
    
    subgraph "Handlers - Complexity (4 files doing similar things)"
        HC1["handlers/codeComplexity.ts"]
        HC2["handlers/complexity/complexityAnalyze.ts"]
        HC3["handlers/complexity/complexityInsights.ts"]
        HC4["handlers/complexity/complexityManage.ts"]
    end
    
    subgraph "Handlers - Metrics (3 files)"
        HM1["handlers/metrics/metricsAnalyze.ts"]
        HM2["handlers/metrics/metricsCollect.ts"]
        HM3["handlers/metrics/metricsControl.ts"]
    end
    
    subgraph "Handlers - Patterns (2 files)"
        HP1["handlers/patterns/patternAnalyze.ts"]
        HP2["handlers/patterns/patternInsights.ts"]
    end
    
    subgraph "Handlers - Other"
        H1["handlers/codeAnalysis.ts"]
        H2["handlers/context.ts"]
        H3["handlers/decisions.ts"]
        H4["handlers/naming.ts"]
        H5["handlers/navigation.ts"]
        H6["handlers/project.ts"]
        H7["handlers/smartSearch.ts"]
        H8["handlers/tasks.ts"]
        H9["handlers/git.ts"]
        H10["handlers/outcomeTracking.ts"]
        H11["handlers/sessionAnalytics.ts"]
    end
    
    subgraph "Services - Too Many!"
        S1["services/complexityTracker.ts"]
        S2["services/gitTracker.ts"]
        S3["services/metricsCollector.ts"]
        S4["services/metricsIntegration.ts"]
        S5["services/patternDetector.ts"]
        S6["services/sessionTracker.ts"]
        S7["services/queueManager.ts"]
        S8["services/sessionTimeout.ts"]
        S9["services/databasePool.ts"]
    end
    
    subgraph "Middleware"
        M1["middleware/ingressValidation.ts"]
        M2["middleware/requestLogger.ts"]
        M3["middleware/validation.ts"]
    end

    %% individual connections (no "&" chaining)
    SERVER --> DB
```
