# Phase 6 Remediation Plan (GPT-5)

## Objective
Finalize Oracle Refactor Phase 6 by replacing the legacy Axios layer with the generated OpenAPI client, adopting React Query across all feature areas, and producing the required monitoring evidence (Lighthouse ≥90, zero-production-error validation).

## Work Breakdown

1. **System Inventory & Gap Analysis**
   - Enumerate every frontend module that still imports `apiClient` / legacy services.
   - Map each endpoint to its generated OpenAPI equivalent.
   - Capture risks (missing OpenAPI coverage, temporary types).

2. **Project & Session Flows Migration**
   - Finish wiring generated client & React Query for projects/sessions (including session recovery helpers).
   - Replace residual `ProjectApi` usage, update providers/components to consume hooks.

3. **Feature Area Migration (Contexts, Decisions, Naming, Monitoring, Embeddings)**
   - Introduce React Query hooks backed by generated services for each area.
   - Update components/pages to consume hooks and drop manual Axios calls.

4. **Legacy Layer Retirement & Validation**
   - Remove `apiClient.ts` and legacy service files once parity is achieved.
   - Run TypeScript/ESLint builds, ensure OpenAPI generation step documented.

5. **Monitoring & Success Criteria Evidence**
   - Capture Lighthouse run (performance ≥90) and archive results.
   - Exercise Sentry wiring (demo environment) and export zero-error window evidence / logs.
   - Update verification report with concrete artifacts.

## Constraints & Considerations
- Generated client: `frontend/src/api/generated/` via openapi-typescript-codegen (verify regeneration instructions).
- Some endpoints may lack OpenAPI coverage; create supplemental definitions or shim types.
- Ensure React Query cache keys align with backend pagination/filters.
- Maintain backward compatibility during migration (temporary adapters if needed).
- Sentry DSN/environment should avoid leaking secrets; support dev toggle via env vars.

## Deliverables
1. Refactored frontend with exclusive use of generated OpenAPI client.
2. React Query hooks and providers covering all data flows.
3. Removal of legacy Axios service layer and obsolete utilities.
4. Updated documentation: regeneration steps, React Query usage, monitoring instructions.
5. Verified metrics: Lighthouse report ≥90, Sentry telemetry snapshot.
