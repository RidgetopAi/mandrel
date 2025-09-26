# Phase 6 Verification – QA Findings (Re-test)

## Summary
Despite wiring in an OpenAPI spec, generated client, React Query provider, and Sentry helper, the production flows still depend on the legacy Axios services. The generated client only backs a subset of new hooks; the rest of the UI—including contexts, decisions, naming, and several session flows—continues to call the handwritten `apiClient`. Because the manual layer remains authoritative, the Phase 6 promise to “remove all manual API typing” and eliminate UI/backend mismatches is still unmet. Success metrics (Lighthouse ≥90, one week of error-free Sentry telemetry) are still asserted without evidence, so the phase remains blocked.

## Findings

1. **Critical – Manual Axios layer still powers the app**
   - **Requirement:** Generate the TypeScript client from OpenAPI and remove the manual fetch layer (`ORACLE_REFACTOR.md:212-213`).
   - **Observation:** Core modules still import `apiClient` from `src/services/api.ts` and the legacy service wrappers. Examples: `aidis-command/frontend/src/services/contextApi.ts:1-120`, `.../services/decisionApi.ts:1-120`, `.../services/namingApi.ts:1-120`, and `.../services/projectApi.ts:1-304`. Even the new React Query hooks fall back to `ProjectApi` for session operations (`aidis-command/frontend/src/hooks/useProjects.ts:200-259`).
   - **Impact:** Contract drift remains possible—the generated client cannot prevent mismatches while handwritten services stay in circulation.
   - **Action:** Replace the old service modules with the generated OpenAPI client throughout the UI and retire `apiClient.ts` once parity is reached.

2. **Major – React Query adoption is partial**
   - **Observation:** The provider is wired up (`aidis-command/frontend/src/App.tsx:44-129`) and Project pages now use `useProjects`, but other features still bypass React Query entirely. Context, naming, decision, and monitoring pages continue to call the manual services that wrap Axios. This undermines the “state management and caching” goal of Phase 6.
   - **Action:** Move the remaining feature modules onto React Query hooks backed by the generated client.

3. **Major – Success criteria remain unverifiable**
   - **Requirement:** Lighthouse ≥90 and zero uncaught Sentry exceptions over a week (`ORACLE_REFACTOR.md:217-218`).
   - **Observation:** The monitoring report (`aidis-command/frontend/ORACLE_REFACTOR_MONITORING_REPORT.md:160-429`) still lists plans and configuration snippets but no Lighthouse output or Sentry telemetry. The initializer (`aidis-command/frontend/src/config/sentry.ts:8-147`) defaults to a demo DSN and only runs when `NODE_ENV === 'production'` or an env flag is set, so the claimed observation period is unproven.
   - **Action:** Supply concrete artifacts (e.g., Lighthouse reports, Sentry dashboards/logs) or update the acceptance criteria with stakeholder approval.

## Recommendation
Phase 6 remains **BLOCKED**. Finish migrating the UI to the generated OpenAPI client + React Query, remove the legacy Axios layer, and provide the required monitoring evidence before resubmitting the verification package.
