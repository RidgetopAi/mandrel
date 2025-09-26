# AIDIS Oracle Refactor Archive
**Date:** September 23, 2025
**Phase:** Phase 7 Task 4 - Documentation Archive
**Scope:** Components removed during Oracle Refactor Phase 6

## Archive Purpose

This archive preserves documentation and components that were removed or consolidated during the Oracle Refactor process. These materials are preserved for:

- Historical reference and understanding of system evolution
- Potential future reference during maintenance or debugging
- Compliance with documentation retention policies
- Understanding implementation decisions and patterns

## Archive Structure

### 1. Removed API Services (`removed-api-services/`)

Components that were **consolidated** into unified OpenAPI-generated TypeScript client:

- **`contextApi.ts`** - Context management API client
  - **Replaced by:** `src/api/contextsClient.ts` (generated)
  - **Reason:** Oracle Refactor Phase 6 - UI/Backend contract consolidation
  - **Date Removed:** 2025-09-23

- **`embeddingService.ts`** - Embedding service API client
  - **Replaced by:** `src/api/embeddingsClient.ts` (generated)
  - **Reason:** Oracle Refactor Phase 6 - UI/Backend contract consolidation
  - **Date Removed:** 2025-09-23

- **`monitoringApi.ts`** - System monitoring API client
  - **Replaced by:** `src/api/monitoringClient.ts` (generated)
  - **Reason:** Oracle Refactor Phase 6 - UI/Backend contract consolidation
  - **Date Removed:** 2025-09-23

- **`projectApi.ts`** - Project management API client
  - **Replaced by:** `src/api/generated/` + multiple clients (generated)
  - **Reason:** Oracle Refactor Phase 6 - UI/Backend contract consolidation
  - **Date Removed:** 2025-09-23

### 2. Obsolete Documentation (`obsolete-docs/`)

Documentation that became obsolete or was relocated:

- **`PHASE_4_3_QA_FIXES.md`** - QA fixes documentation
  - **Current Location:** `docs/PHASE_4_3_QA_FIXES.md`
  - **Reason:** File moved to proper docs directory
  - **Date Archived:** 2025-09-23

- **`QA_FINDINGS_4_3.md`** - QA findings report
  - **Current Location:** `docs/QA_FINDINGS_4_3.md`
  - **Reason:** File moved to proper docs directory
  - **Date Archived:** 2025-09-23

### 3. Legacy Components (`legacy-components/`)

Development components that were superseded:

- **`aidis-command-dev-README.md`** - Development version documentation
  - **Superseded by:** Main `aidis-command/` implementation
  - **Reason:** Development branch consolidated into main
  - **Date Archived:** 2025-09-23

- **`aidis-command-dev-frontend-README.md`** - Development frontend docs
  - **Superseded by:** Main `aidis-command/frontend/` implementation
  - **Reason:** Development branch consolidated into main
  - **Date Archived:** 2025-09-23

### 4. Phase Documentation (`phase-documentation/`)

Planning and completion documentation:

- **`GPT5_PHASE6_PLAN.md`** - Phase 6 planning document
  - **Status:** Completed - archived for historical reference
  - **Date Archived:** 2025-09-23

- **`PHASE_6_COMPLETION_PLAN.md`** - Phase 6 completion tracking
  - **Status:** Completed - archived for historical reference
  - **Date Archived:** 2025-09-23

## What Was NOT Archived

### Current Active Documentation
- `CLAUDE.md` - Current project instructions (still active)
- `ORACLE_REFACTOR.md` - Master refactor plan (still active)
- `README.md` - Main project documentation (still active)
- All files in `docs/` directory (relocated, not removed)

### Generated Files
- OpenAPI generated clients in `src/api/generated/` (newly created)
- TypeScript types in `src/types/` (newly created)
- Configuration files (consolidated, not removed)

## Migration Summary

### API Consolidation (Phase 6)
**Before:** 4 individual hand-written API clients
**After:** 1 unified OpenAPI-generated client with type safety

**Benefits Achieved:**
- Eliminated UI-backend type mismatches
- Auto-generated TypeScript types from OpenAPI spec
- Consistent error handling across all API calls
- Reduced maintenance burden (generated code)

### Documentation Organization
**Before:** Scattered documentation files in root directory
**After:** Organized documentation in `docs/` with archived obsolete items

## Recovery Instructions

If any archived component needs to be restored:

1. **API Services:** Use git history to restore individual files:
   ```bash
   git show HEAD~1:aidis-command/frontend/src/services/contextApi.ts > contextApi.ts
   ```

2. **Documentation:** Files are preserved in archive and git history

3. **Legacy Components:** `aidis-command-dev/` directory still exists but is considered deprecated

## Related Documents

- `ORACLE_REFACTOR.md` - Master refactor plan
- `aidis-command/frontend/ORACLE_REFACTOR_QA_COMPLETION_EVIDENCE.md` - QA evidence
- `aidis-command/frontend/OPENAPI_GENERATION_PIPELINE.md` - API generation details

---

**Archive Created:** September 23, 2025
**Created By:** Phase 7 Task 4 Documentation Archive Process
**Next Review:** Post-Phase 7 completion