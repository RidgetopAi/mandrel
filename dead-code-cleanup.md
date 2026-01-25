# Dead Code Cleanup List

Generated: 2026-01-25
Source: Surveyor scan verification with parallel subagents

## Summary

| Category | Dead Code | Keep |
|----------|-----------|------|
| MCP-Server | ~65 | ~51 |
| Backend | ~46 | ~26 |
| Frontend | ~66 | ~54 |
| Adapters | 0 | 4 |
| Orphaned Functions | 1 | 1 |
| **Total** | **~178** | **~136** |

---

## MCP-Server Dead Code (~65 exports)

### Handler Classes (remove class exports, keep singletons)
- `mcp-server/src/handlers/agents.ts`: AgentsHandler
- `mcp-server/src/handlers/codeAnalysis.ts`: CodeAnalysisHandler
- `mcp-server/src/handlers/context.ts`: ContextHandler
- `mcp-server/src/handlers/decisions.ts`: DecisionsHandler
- `mcp-server/src/handlers/navigation.ts`: NavigationHandler
- `mcp-server/src/handlers/project.ts`: ProjectHandler
- `mcp-server/src/handlers/smartSearch.ts`: SmartSearchHandler
- `mcp-server/src/handlers/tasks.ts`: TasksHandler

### Route Classes (remove class exports, keep singletons)
- `mcp-server/src/routes/context.routes.ts`: ContextRoutes
- `mcp-server/src/routes/decisions.routes.ts`: DecisionsRoutes
- `mcp-server/src/routes/project.routes.ts`: ProjectRoutes
- `mcp-server/src/routes/search.routes.ts`: SearchRoutes
- `mcp-server/src/routes/system.routes.ts`: SystemRoutes
- `mcp-server/src/routes/tasks.routes.ts`: TasksRoutes

### Unused API Routers
- `mcp-server/src/api/v2/mcpRoutes.ts`: V2McpRouter

### Unused Utility Classes
- `mcp-server/src/utils/httpMcpBridge.ts`: HttpMcpBridge
- `mcp-server/src/utils/mcpProxy.ts`: AIDISMCPProxy (exported twice)
- `mcp-server/src/utils/portManager.ts`: PortManager (keep portManager singleton)
- `mcp-server/src/utils/processLock.ts`: ProcessLock (keep processLock singleton)
- `mcp-server/src/utils/serviceMesh.ts`: ServiceMeshClient

### Unused Test Classes
- `mcp-server/src/tests/fuzz/mcpFuzzTester.ts`: McpFuzzTester

### Unused Functions
- `mcp-server/src/handlers/git.ts`: getSessionCommits, getCommitSessions, correlateCurrentSession
- `mcp-server/src/handlers/aiAnalytics.ts`: getAIEffectiveness, getAITrends, getAIUsageSummary
- `mcp-server/src/api/middleware/sessionTracking.ts`: autoTrackActivity, autoTrackFileEdit
- `mcp-server/src/middleware/eventLogger.ts`: logSessionEvent, logOperationTiming, SessionManager
- `mcp-server/src/middleware/requestLogger.ts`: loggedOperation
- `mcp-server/src/utils/mcpFormatter.ts`: formatMcpList, formatMcpStats
- `mcp-server/src/utils/monitoring.ts`: withMonitoring, createMonitoringEndpoints, startMonitoring, stopMonitoring
- `mcp-server/src/utils/retryLogic.ts`: withRetry, executeDbOperationWithRetry, executeMcpOperationWithRetry, EnhancedRetryLogic
- `mcp-server/src/utils/serviceMesh.ts`: discoverService
- `mcp-server/src/utils/sessionFormatters.ts`: formatSessionSummary

### Unused Schemas (internal only)
- `mcp-server/src/middleware/validation.ts`: mandrelSystemSchemas, aidisSystemSchemas, contextSchemas, projectSchemas, namingSchemas, decisionSchemas, agentSchemas, taskSchemas, complexitySchemas, codeSchemas, smartSearchSchemas, validationSchemas
- `mcp-server/src/parsers/mcpParser.ts`: McpContentSchema, McpToolResponseSchema, McpSuccessResponseSchema, McpErrorResponseSchema, McpResponseSchema

### Unused Service Classes
- `mcp-server/src/services/dependencyAnalyzer.ts`: DependencyAnalyzerService (keep singleton)
- `mcp-server/src/services/dimensionality-reduction.ts`: DimensionalityReductionService (keep singleton)
- `mcp-server/src/services/projectSwitchValidator.ts`: ProjectSwitchValidator
- `mcp-server/src/core-server.ts`: AIDISCoreServer

---

## Backend Dead Code (~46 exports)

### Test/Diagnostic Files (entire files can be deleted or moved)
- `mandrel-command/backend/coverage-analysis.ts`: analyzeCoverage, generateReport
- `mandrel-command/backend/src/test-basic-logging.ts`: testBasicLogging
- `mandrel-command/backend/src/test-logging.ts`: testLoggingEndpoint, testApp, runLoggingTests
- `mandrel-command/backend/src/test-server-logging.ts`: testServerLogging
- `mandrel-command/backend/test-enhanced-git-metadata.ts`: testEnhancedGitMetadata
- `mandrel-command/backend/test-session-code-api.ts`: SessionCodeApiTester
- `mandrel-command/backend/test-session-code-endpoints-direct.ts`: SessionCodeDirectTester

### Unused Middleware
- `mandrel-command/backend/src/middleware/auth.ts`: requireRole, requireActiveUser
- `mandrel-command/backend/src/middleware/project.ts`: requireProjectContext
- `mandrel-command/backend/src/middleware/validation.ts`: createValidationMiddleware, validateParams, UUIDParamSchema, ProjectParamSchema, TaskParamSchema, SessionParamSchema, PaginationQuerySchema, validateProjectParam, validateTaskParam, validateSessionParam, formatValidationResponse

### Unused Services
- `mandrel-command/backend/src/services/mcpIntegration.ts`: MCPIntegrationService

### Unused Utilities
- `mandrel-command/backend/src/database/migrate.ts`: runMigration, runAllMigrations
- `mandrel-command/backend/src/types/sessionCode.ts`: DEFAULT_SESSION_CODE_CONFIG
- `mandrel-command/backend/src/utils/featureFlags.ts`: FeatureFlagStore (keep factory)
- `mandrel-command/backend/src/utils/portManager.ts`: PortManager (keep singleton)
- `mandrel-command/backend/src/utils/typeGeneration.ts`: generateTypeDefinitions, writeTypeDefinitions, syncTypes, validateTypeConsistency, generateTypesCommand, validateTypesCommand

### Unused Validation Schemas
- `mandrel-command/backend/src/validation/schemas.ts`: requiredString, optionalString, email, url, positiveInteger, tags, formatZodError, formatFieldErrors, getSchema, validatePartial, SchemaRegistry

---

## Frontend Dead Code (~66 exports)

### Unused Auth Hooks
- `mandrel-command/frontend/src/hooks/useAuth.ts`: useProfile, useRefreshToken, useRegister

### Unused Query Hooks
- `mandrel-command/frontend/src/hooks/useContexts.ts`: useContextDetailQuery, useSemanticContextSearch
- `mandrel-command/frontend/src/hooks/useProjects.ts`: projectQueryKeys, sessionQueryKeys, useSessionDetail, useCurrentSession, useAssignCurrentSession
- `mandrel-command/frontend/src/hooks/useDecisions.ts`: decisionQueryKeys, useDecisionDetailQuery, useCreateDecision, useUpdateDecision, useDeleteDecision
- `mandrel-command/frontend/src/hooks/useEmbeddings.ts`: embeddingsQueryKeys
- `mandrel-command/frontend/src/hooks/useMandrelV2Status.ts`: useMandrelV2Status
- `mandrel-command/frontend/src/hooks/useSettings.ts`: useSettings

### Unused Services
- `mandrel-command/frontend/src/services/performanceCache.ts`: AdvancedPerformanceCache, performanceCache, getCacheStats, getPerformanceMetrics, clearCache, warmCache
- `mandrel-command/frontend/src/services/realTimeDataService.ts`: RealTimeDataService, realTimeDataService, defaultConfigs
- `mandrel-command/frontend/src/services/sessionRecovery.ts`: SessionRecoveryService

### Unused Validation Schemas
- `mandrel-command/frontend/src/validation/schemas.ts`: requiredString, optionalString, email, url, positiveInteger, tags, TaskTypeSchema, TaskPrioritySchema, TaskStatusSchema, ContextTypeSchema, DecisionStatusSchema, NamingTypeSchema, AidisToolCallSchema, AidisContextStoreSchema, AidisContextSearchSchema, AidisProjectSwitchSchema, formatZodError, SchemaRegistry, getSchema

### Unused Error Components
- `mandrel-command/frontend/src/components/error/FallbackComponents.tsx`: ApiErrorFallback, NetworkErrorFallback, DataLoadingFallback, EmptyDataFallback, ComponentErrorFallback, PartialFallback, SmartFallback

### Testing Components (not production)
- `mandrel-command/frontend/src/components/testing/ErrorBoundaryDemo.tsx`: ErrorBoundaryDemo
- `mandrel-command/frontend/src/components/testing/FormValidationDemo.tsx`: FormValidationDemo
- `mandrel-command/frontend/src/components/testing/MandrelV2ApiTest.tsx`: MandrelV2ApiTest

### Unused Sentry Config
- `mandrel-command/frontend/src/config/sentry.ts`: reportMessage, setUserContext, startTransaction, Sentry

### Deprecated API Clients
- `mandrel-command/frontend/src/api/mandrelApiClient.ts`: createMandrelApiClient, aidisApi, createAidisApiClient, AidisApiClient

### Unused Utilities
- `mandrel-command/frontend/src/utils/contextHelpers.tsx`: highlightSearchTerms, formatFileSize

---

## Orphaned Functions (1)

- `mandrel-command/backend/src/utils/typeGeneration.ts:32`: generateInterfaceFromSchema (defined but never called)

---

## False Positives (DO NOT DELETE)

### Adapters (intentional public API)
- `adapters/mcp-http-adapter.ts`: MandrelMcpHttpAdapter, CONFIG
- `adapters/mcp-stdio-adapter.ts`: MandrelMcpStdioAdapter, CONFIG

### Internal Usage
- `mandrel-command/backend/src/utils/portManager.ts:30`: getDefaultRegistryPath (called at line 45)

---

## Large Files (Consider Refactoring - Not Dead Code)

| File | Lines | Priority |
|------|-------|----------|
| gitService.ts | 2,263 | High |
| sessionTracker.ts | 1,977 | High |
| openapi.ts | 1,748 | Low (generated) |
| core-server.ts | 1,449 | Medium |
| sessionAnalytics.ts | 1,374 | Medium |
| EmbeddingService.ts | 1,172 | Medium |
| embedding.ts | 1,001 | Medium |

---

## Detailed Reports

Full verification outputs available at:
- MCP-Server: `/tmp/claude/-home-ridgetop-projects/tasks/a2bfc7f.output`
- Backend: `/tmp/claude/-home-ridgetop-projects/tasks/ab6e38b.output`
- Frontend: `/tmp/claude/-home-ridgetop-projects/tasks/afb7158.output`

## Recommended Cleanup Order

1. **Quick wins**: Remove test/diagnostic files in backend
2. **Handler/Route classes**: Change `export { ClassName, singleton }` to just `export { singleton }`
3. **Unused hooks/services**: Remove entire exports or delete files if empty
4. **Validation schemas**: Un-export internal-only schemas
5. **Deprecated code**: Remove old API clients after confirming no usage
