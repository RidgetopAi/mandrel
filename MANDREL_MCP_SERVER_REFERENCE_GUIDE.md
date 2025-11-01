# Mandrel MCP-SERVER – COMPREHENSIVE REFERENCE GUIDE

This guide reverse-engineers every moving part of `mcp-server/src` so future changes can be made systematically, without "tribal knowledge".

--------------------------------------------------------------------
## 1. SYSTEM ARCHITECTURE OVERVIEW
--------------------------------------------------------------------

### 1.1 High-level runtime picture  
• Process bootstrap (`server.ts`) →  
  – Singleton lock → Health probe web server → DB pool initialisation → MCP `Server` instantiation → STDIO transport → Tool registration block.  

• Request path  
  1. Tool call arrives over STDIO in JSON-RPC format defined by MCP protocol.  
  2. The MCP SDK parses the envelope and invokes the tool callback registered in `server.ts`.  
  3. Callback executes:  
     a. `validationMiddleware` (Zod schemas) validates `args`.  
     b. Business handler (`handlers/*`) performs DB + service logic.  
     c. Result marshalled back through MCP SDK → STDIO → calling agent.  

• Database integration  
  – Postgres connection pool (`config/database.ts`) shared across handlers.  
  – All writes/queries run in handlers using parameterised SQL.  
  – pgvector extension exploited for semantic search (contexts).  

• Resilience & observability  
  – CircuitBreaker (in `server.ts`) wraps DB ops when used.  
  – RetryHandler implements exponential back-off for transient ops.  
  – Health endpoints `/healthz`, `/readyz` exposed on `HEALTH_PORT`.  
  – Process Singleton avoids double-start (PID file + kill(0) check).  

• Error handling chain  
  – Zod validation failure → `Error` bubble → MCP SDK converts to `McpError` with code `INVALID_ARGUMENT`.  
  – Business errors thrown in handlers → caught in wrapper in `server.ts` → `McpError` with proper `ErrorCode`.  
  – Circuit breaker "OPEN" raises fast failure (503 semantics).  

--------------------------------------------------------------------
## 2. COMPONENT MAPPING & FILE ANALYSIS
--------------------------------------------------------------------
Legend: (D)=depends-on

1. **server.ts** – Bootstrap, tool registry, health server, singleton, circuit-breaker. (D: all handlers, validation, database)  
2. **config/database.ts** – PG pool factory, `initializeDatabase`, graceful shutdown.  
3. **middleware/validation.ts** – Central Zod schema definitions + `validationMiddleware`.  
4. **services/embedding.ts** – Thin wrapper around embedding API (OpenAI/Local). (Used by `context` handler).  

5. **handlers/**  
   • **context.ts** – Vector store of agent "memories" (store/search/stats).  
   • **project.ts** – CRUD, switch & "current project" session map.  
   • **sessionAnalytics.ts** – Session tracking, analytics, and management.  
   • **naming.ts** – Canonical naming registry & conflict detection.  
   • **decisions.ts** – Architectural decision records & queries.  
   • **agents.ts** – Multi-agent registration/coordination.  
   • **codeAnalysis.ts** – Static analysis helpers (file components/impact).  
   • **smartSearch.ts** – Cross-domain search + AI recommendation stubs.  

6. **utils/**  
   • **processLock.ts** – (unused) generic FS lock helper.  
   • **retryLogic.ts** – Re-export of RetryHandler (legacy).  
   • **httpMcpBridge.ts** – Optional HTTP → MCP proxy.  
   • **mcpProxy.ts** – Helper class used inside handlers to call other MCP tools programmatically.  
   • **monitoring.ts** – Placeholder for Prometheus / logging integrations.

### Dependency graph (condensed)  
```
server.ts  
  ├── middleware/validation.ts  
  ├── config/database.ts  
  └── handlers/*  
      └── services/embedding.ts (context)  
```

--------------------------------------------------------------------
## 3. PATTERN EXTRACTION
--------------------------------------------------------------------

### 3.1 MCP Tool Registration Pattern  
Step-by-step (all inside `server.ts`):  
1. Import handler: `import { fooHandler } from './handlers/foo.js'`.  
2. Insert into `server.registerTool({ name, description, inputSchema, handler: async (args, ctx) => fooHandler.someMethod(args) })`.  
3. Add Zod schema to `validationSchemas` map in `middleware/validation.ts` using key `<toolname>` (e.g., `foo_action`).  
4. (Optional) Add entry to CHANGELOG & docs.

### 3.2 Handler Implementation Pattern  
• Stateless class or module exporting public async methods.  
• Each public method:  
  – Input verification (if additional rules beyond Zod).  
  – `await this.ensureProjectId` style helpers.  
  – DB operations wrapped in try/catch.  
  – Rich console logging emojis for observability.

### 3.3 Validation Schema Pattern  
• All tool names snake-cased.  
• Zod object with primitive limits (length, enum).  
• Exported via large `validationSchemas` registry.  
• Used by `validationMiddleware(toolName,args)` before every handler call.

### 3.4 Database Service Pattern  
• Shared `db: Pool`.  
• Handlers build parameterised SQL strings; embed JSON via `JSON.stringify` & vectors as `'[v1,v2,...]'::vector`.  
• Transactions & circuit-breaker around high-risk blocks (future work).

### 3.5 Error Handling Pattern  
• Try/Catch in each handler → throw `Error` with contextual message.  
• Wrapper in server converts to `McpError` (maintains `ErrorCode`).  
• CircuitBreaker transposes repeated failures to fast-fail "OPEN".

--------------------------------------------------------------------
## 4. INTEGRATION POINT DOCUMENTATION
--------------------------------------------------------------------

## CHECKLIST – ADDING A NEW MCP TOOL

### 1. Business logic  
   a. Create/extend handler module under `src/handlers/`.  
   b. Export async function(s) returning plain JSON-serialisable data.  

### 2. Validation  
   a. Open `middleware/validation.ts`.  
   b. Define Zod schema under relevant section; add to `validationSchemas` with key `<toolname>`.  

### 3. Tool registration  
   a. Import handler in `server.ts`.  
   b. Append to `server.registerTool()` array:  
      • name: `<toolname>`  
      • description: human sentence  
      • inputSchema: JSON-schema literal mirroring Zod rules (keeps SDK happy)  
      • handler: async (args, ctx) => handler.<method>(args)  

### 4. Database  
   a. If new tables: create migration SQL & update `initializeDatabase` test if vectors used.  

### 5. Tests / verification  
   ☐ Unit tests for handler logic (mock `db`).  
   ☐ Integration test hitting MCP STDIO with sample args.  
   ☐ `npm run health` (or curl `/healthz`) returns healthy.  
   ☐ Run `validationMiddleware('<tool>',sampleArgs)` in REPL.  

--------------------------------------------------------------------
## 5. CHANGE WORKFLOW TEMPLATES
--------------------------------------------------------------------

### A. New Tool Addition  
```bash
# 1. Spec
docs/adr/2024-xx-new-tool.md
# 2. Code
touch src/handlers/foo.ts
edit middleware/validation.ts  # add schema
edit src/server.ts             # register tool
# 3. DB (if needed)
psql -f migrations/2024xx_create_foo.sql
# 4. Test
npm run test:foo
# 5. Docs
docs/tools/foo.md
```

### B. Handler Modification  
1. Update business logic in handler file.  
2. Ensure input schema still accurate – bump versions if breaking.  
3. Update tests & run `npm run test`.  

### C. Database Schema Change  
1. Write migration SQL.  
2. Add integration test covering change.  
3. Bump `.env` `DATABASE_SCHEMA_VERSION` (if tracked).  
4. Deploy → watch `initializeDatabase` logs for extension checks.

### D. Validation Update  
1. Adjust Zod schema limits/enums.  
2. Synchronise JSON-schema inside `server.registerTool`.  
3. Ship minor version bump; note in CHANGELOG.

--------------------------------------------------------------------
## Appendix: File Purpose Table
--------------------------------------------------------------------
(ordered as glob)

| File | Purpose |
|------|---------|
| `server.ts` | Main entry & tool registry |
| `middleware/validation.ts` | Zod schemas + middleware |
| `services/embedding.ts` | OpenAI/Local embedding wrapper |
| `config/database.ts` | Pg pool + init/close helpers |
| `handlers/context.ts` | Vector memory store/search |
| `handlers/project.ts` | Project CRUD/session mgmt |
| `handlers/sessionAnalytics.ts` | Session tracking, analytics & assignment |
| `handlers/naming.ts` | Naming registry & conflicts |
| `handlers/decisions.ts` | ADR (Architecture Decision Record) storage |
| `handlers/agents.ts` | Multi-agent coordination |
| `handlers/codeAnalysis.ts` | Static analysis helpers |
| `handlers/smartSearch.ts` | Cross-domain search + AI recs |
| `utils/httpMcpBridge.ts` | Bridge HTTP requests to MCP calls |
| `utils/retryLogic.ts` | Generic retry util (legacy wrapper) |
| `utils/mcpProxy.ts` | Call other MCP tools internally |
| `utils/monitoring.ts` | Metrics/log stubs |
| `utils/processLock.ts` | FS lock helper (not active) |

--------------------------------------------------------------------
## Notes

With this reference, every engineer can navigate, extend and refactor Mandrel MCP-server confidently and without hidden traps.

**Generated by**: Oracle comprehensive analysis  
**Date**: 2025-08-24  
**Purpose**: Systematic large-codebase management and assumption-free development
