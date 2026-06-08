# Mandrel Productization Inspection — Findings

**Date:** 2026-06-07
**Branch:** mandrel-v2 (clean)
**Scope:** all three packages — mcp-server (35.9k LOC), mandrel-command/backend (27.4k), mandrel-command/frontend (35.5k)
**Method:** trace/measure/record. Generated lists (Surveyor, old dead-code-cleanup.md) treated as hypotheses only; every item re-verified against ground truth.

---

## Phase 0 — Baseline (the "before" measurement)

| Package | typecheck | lint | notes |
|---|---|---|---|
| mcp-server | ✅ pass (tsc 5.9.2) | ❌ broken | ESLint v9 config migration not done — `eslint src/**/*.ts` errors out, lint never actually runs |
| backend | ❌ fail | ? | tsc **4.9.5** can't parse zod 3.25 `v4/core/*.d.cts` (modern const-type-param syntax). Not a code bug — toolchain mismatch |
| frontend | ✅ pass (tsc 5.9.3) | ? | |

**Baseline actions/targets:**
- B1. Fix ESLint v9 flat-config migration in mcp-server (lint is currently a no-op).
- B2. Upgrade backend TypeScript 4.9.5 → 5.x to match siblings; re-run typecheck, fix surfaced errors.
- Tests: 15 test files total for 99k LOC (mcp-server 5 / backend 8 / frontend 2) — thin. (test-run baseline pending)
- ~1,162 `console.*` in tracked source (mcp 668 / be 278 / fe 216) despite real logger present.
- 79 TODO/FIXME/HACK markers.
- TS strictness inconsistent: backend has noUnusedLocals=false, noImplicitReturns=false (laxer than mcp-server/shared).

---

## Phase 1 — Secrets & config

### 🔴 CRITICAL — real secret committed to git
- `mandrel-command/backend/.env.logging` (TRACKED) contains live `DATABASE_PASSWORD=bandy…`, `JWT_SECRET=aidis-…`, `DATABASE_USER=ridgetop`. Present in 2 commits (82dc5bf, 10d571e). `.gitignore` blocks `.env` but not `.env.logging`.
  - Remediation: untrack + gitignore now (this session). USER rotates DB password + JWT secret on VPS. (History purge optional, deferred.)

### 🟡 Committed dev credentials (lower severity)
- `config/environments/.env.development` — committed `DATABASE_PASSWORD=mandre…` (dev). Decide: keep (local-only convenience) vs untrack.
- `mandrel-command/backend/reset-password.js:17` — hardcoded `admin123!`.
- `mandrel-command/create-admin.js:9` — hardcoded postgres/postgres DB creds.

### ✅ False positives (no action)
- `databaseLogger.ts` / `requestLogger.ts` — these are secret **redaction** routines (good).
- `users.ts:160`, `Settings.tsx:161` — `console.error('...password...')` strings.
- `GitSyncModal.tsx:36` — UI placeholder `AUTH_TOKEN="YOUR_TOKEN"`.

### Gitignore gap
- Add `*.env.logging` / tighten env globbing so non-`.example` env files can't be tracked.

---

## Phase 0 — REVISED (after tracing)

- **Backend typecheck is actually CLEAN** with the local compiler (`./node_modules/.bin/tsc` = 5.9.2, exit 0). The earlier "fail" was `npx tsc` resolving a **global 4.9.5** shadowed in by the globally-linked `forge` package. `npm run build` uses local `.bin/tsc`, so the real build is healthy. → low-severity dev-env footgun, document only.
- **Test infrastructure is broken across all three packages (verified):**
  - mcp-server (vitest, correct runner): **25/87 tests FAIL, 4 of 5 files fail** (mcpParser, featureFlags, httpContract, session.e2e, session.unit).
  - backend (jest): **config broken** — `setupFilesAfterEnv` points to missing `test-setup.ts` (collateral from earlier test-file deletions); suite can't start.
  - frontend (react-scripts test): no real suite.
  - Root `mandrel-command` `npm test` literally echoes "Tests will be implemented in Phase 2."
  - Three different runners (vitest / jest / react-scripts), no unified `npm test`. → **productization blocker.**

---

## Phase 2 — Dead code (RE-VERIFIED by reference tracing)

The old `dead-code-cleanup.md` (2026-01-25) is **substantially WRONG** — proof that generated lists must not be trusted:
it flagged ~9 mcp-server files as dead (monitoring.ts, mcpFormatter.ts, sessionFormatters.ts, eventLogger.ts, requestLogger.ts, parsers/mcpParser.ts, dimensionality-reduction.ts, projectSwitchValidator.ts, portManager.ts) — **all proven LIVE**. It also cited backend files that no longer exist. It MISSED `agents.ts` (794 LOC, genuinely dead).

### Verified dead — WHOLE FILES safe to delete
**mcp-server (1,435 LOC):**
- `src/utils/serviceMesh.ts` (245) — zero imports
- `src/utils/retryLogic.ts` (180) — zero imports
- `src/utils/httpMcpBridge.ts` (239) — CLI-only, never invoked
- `src/utils/mcpResponseHandler.ts` (377) — superseded by McpParser
- `src/handlers/agents.ts` (794) — AgentsHandler/singleton, zero imports

**backend (285 LOC):** root-level diagnostic scripts, zero npm/import refs:
- `check-schema.ts` (54), `debug-context-service.ts` (121), `setup-git-tracking.ts` (110)

**frontend (172 LOC + partials):**
- `src/utils/authStateValidator.ts` (80) — zero refs
- `src/hooks/useDashboard.ts` (92) — abandoned Phase-6 scaffolding, superseded
- `src/components/testing/ErrorBoundaryDemo.tsx`, `FormValidationDemo.tsx`, `MandrelV2ApiTest.tsx` — **0 imports each (confirmed)**
- `src/components/error/FallbackComponents.tsx` — **0 imports (confirmed)**
- Partial dead exports: `useSurveyorData.ts` (useSummary/useFileDetails/useDeleteScan/useNodes ~43 LOC), `types/generated.ts` (3 unused type guards)

### KEEP (proven live, despite old list / appearances)
- mcp-server: monitoring, mcpFormatter, sessionFormatters, eventLogger, requestLogger, mcpParser, dimensionality-reduction, projectSwitchValidator, portManager — all referenced.
- `src/handlers/git.ts` (670) — MCP tools disabled (in DISABLED_TOOLS) BUT imported by `services/gitTracker.ts` (live background service). **Decision needed:** keep dormant vs remove feature.
- frontend: mandrelApiClient, contextHelpers, sessionRecovery, sentry — all live.

---

## Phase 3 — Code health & consistency

- **console.* sprawl: ~1,162** in tracked source (mcp 668 / be 278 / fe 216) despite a real logger existing → noise + potential info leak in product.
- **79 TODO/FIXME/HACK** markers — need triage.
- **ESLint broken** in mcp-server (v9 flat-config migration not done → lint is a no-op; no static safety net).
- **tsconfig strictness inconsistent**: backend has `noUnusedLocals:false`, `noImplicitReturns:false`; mcp-server/shared are strict. Tightening backend would auto-surface dead locals.
- **Largest files (refactor candidates, NOT dead):** codeAnalysis.ts 953, Surveyor.tsx 875, warning-detector.ts 871, projectSwitchValidator.ts 811, SessionDetail.tsx 811, context.ts 755, sessionAnalyticsController.ts 747, decisions.ts 735, backend monitoring.ts 716. (agents.ts 794 is dead → delete, not refactor.)
- **Repo clutter (tracked):** many loose status `.md` files, `backups/`, `logs/`, `*.pid`, `debug-images/`, `debug-reports/`, `api-test.log` — verify what's committed and gitignore.

---

## Phase 4 — Synthesis → see refactor plan stored in Mandrel (project: mandrel-stab) + tasks.
