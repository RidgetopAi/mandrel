# Phase 6 Completion Plan (GPT-5)

## Mission
Eliminate the legacy Axios/handwritten API layer, run the frontend entirely on the generated OpenAPI client with React Query, and furnish Lighthouse/Sentry evidence so Phase 6 can finally be signed off.

## Guiding Principles
- Migrate feature areas one at a time, verifying behaviour before deleting legacy code.
- Extend the backend OpenAPI spec to cover every endpoint the UI consumes.
- Regenerate the TypeScript client after each spec update (or once per migration wave) and wire React Query hooks around it.
- Keep the system runnable at all times; don’t remove the old services until the new code paths are verified.

## Work Plan

### 1. Backend Contract Coverage
- [x] 1.1 Audit Express routes to ensure each UI endpoint is documented (projects, contexts, decisions, naming, monitoring, sessions, embeddings).
- [x] 1.2 Add missing OpenAPI annotations or controller-based schemas (fallback: extend swaggerJSDoc config with manual definitions).
- [x] 1.3 Verify `/api/openapi.json` and `/api/openapi/docs` include all routes used by the frontend.
- [x] 1.4 Document regeneration steps (`npm run generate:openapi` or equivalent).

### 2. Regenerate Client & Baseline Tests
- [x] 2.1 Regenerate the client in `frontend/src/api/generated/` using the updated spec.
- [x] 2.2 Run `npm run lint` and `npm run build` in the frontend to confirm generated code compiles. *(Lint still reports pre-existing warnings/errors in test files.)*
- [ ] 2.3 Snapshot the generated folder to detect future drift (e.g., git status review).

### 3. Feature Migrations – Backend-backed Views
- [ ] 3.1 Projects & Sessions: Ensure all components/providers/hooks rely on React Query + generated client (finish any remaining session helpers).
- [ ] 3.2 Contexts feature migration (search, CRUD, stats) to generated client + React Query.
- [ ] 3.3 Decisions feature migration (search, CRUD, stats) to generated client + React Query.
- [ ] 3.4 Naming registry migration (search, register, stats) to generated client + React Query.
- [ ] 3.5 Monitoring & dashboard APIs migration (metrics, insights, health) to generated client + React Query.
- [ ] 3.6 Embeddings/auxiliary services migration to generated client or document deprecation.
- [ ] 3.7 Update shared contexts (ProjectContext, AuthContext) to rely on the new hooks/services exclusively.

### 4. State & Error Management Integration
- [ ] 4.1 Replace remaining manual mutations with React Query mutations and cache invalidation.
- [ ] 4.2 Ensure error boundaries and hooks report through Sentry + AIDIS consistently.
- [ ] 4.3 Verify optimistic updates or loading states haven’t regressed due to the migration.

### 5. Retire Legacy Layer
- [ ] 5.1 Remove `frontend/src/services/api.ts` and feature-specific service files once consumers are migrated.
- [ ] 5.2 Clean up unused types/helpers tied to the legacy layer.
- [ ] 5.3 Update documentation (README, dev setup) to reflect new client usage.

### 6. Verification & Evidence
- [ ] 6.1 Run Lighthouse against the built frontend; capture report showing Performance ≥ 90 (attach path/summary).
- [ ] 6.2 Exercise Sentry integration (dev/staging) to confirm events flow; capture evidence of zero uncaught exceptions over observation window (log export or screenshot).
- [ ] 6.3 Update Phase 6 verification report (PHASE_6_VERIFICATION.md) with concrete artifacts/links.

## Tracking
- Progress for each task will be recorded by editing the checkboxes above (✔️ upon completion).
- Supporting notes and decisions will live alongside code changes or in `docs/` as needed.

## Next Step
Begin with Section 1: audit backend routes and extend the OpenAPI spec to cover any missing endpoints.
