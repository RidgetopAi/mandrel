# Mandrel Embedding Analytics Fix Plan

**Project**: mandrel-stab  
**Date**: 2025-11-04  
**Status**: Ready for Implementation  

---

## Executive Summary

Oracle review identified:
- **Dimension consistency**: Local embeddings generate 384D but need 1536D storage
- **No circular references found** in code (✅ good)
- **Working analytics**: Similarity heatmap, 2D projection, clustering
- **Not wired**: Relevance, Relationships, Knowledge Gaps, Usage Patterns, Quality Metrics

**Fix approach**: Practical, minimal changes - enforce 1536D consistency and wire missing endpoints to existing service methods.

---

## Phase 1: Database & Embedding Dimension Enforcement (1-3h)

### 1.1 Database Inspection & Backfill
**File**: Run SQL diagnostics  
**Action**: Check for wrong dimensions or NULL embeddings

```sql
-- Check for wrong dimensions
SELECT id, (length(embedding::text) - length(replace(embedding::text, ',', ''))) + 1 AS dims 
FROM contexts 
WHERE embedding IS NOT NULL 
  AND ((length(embedding::text) - length(replace(embedding::text, ',', ''))) + 1) <> 1536 
LIMIT 50;

-- Check for NULL embeddings
SELECT COUNT(*) FROM contexts WHERE embedding IS NULL;

-- Check for circular references (embeddings stored as text in content)
SELECT id FROM contexts WHERE content ~ '^\s*\[[-0-9.,\s]+\]\s*$' LIMIT 50;
```

### 1.2 Enforce Dimension Normalization
**File**: `mcp-server/src/services/embedding.ts`  
**Action**: Add `toTargetDimensions` helper to normalize 384D → 1536D

```typescript
private toTargetDimensions(vec: number[]): number[] {
  // Pad or truncate to target dimensions
  let v = vec.slice(0, this.targetDimensions);
  if (v.length < this.targetDimensions) {
    v = v.concat(Array(this.targetDimensions - v.length).fill(0));
  }
  
  // Normalize to unit length for cosine similarity
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm > 0 ? v.map(x => x / norm) : v;
}
```

**Update**: Ensure `generateEmbedding()` calls `toTargetDimensions` before returning vector.

### 1.3 Database Column Enforcement
**File**: `mcp-server/src/config/database.ts`  
**Action**: After backfill, enforce column type

```sql
ALTER TABLE contexts ALTER COLUMN embedding TYPE vector(1536) 
USING embedding::vector(1536);
```

---

## Phase 2: Wire Missing Analytics Endpoints (2-4h)

### 2.1 Create/Update Embeddings Controller
**File**: `mandrel-command/backend/src/controllers/EmbeddingsController.ts` (create if missing)

**Required endpoints**:
```typescript
// Already working (verify only)
GET /embeddings                      → getAvailableDatasets
GET /embeddings/:id/similarity       → getSimilarityMatrix
GET /embeddings/:id/projection       → getProjection
GET /embeddings/:id/cluster          → getClusters

// MISSING - need to wire:
GET /embeddings/:id/metrics          → getQualityMetrics
GET /embeddings/relevance            → getRelevanceMetrics
GET /embeddings/relationships        → getProjectRelationships
GET /embeddings/knowledge-gaps       → getKnowledgeGapMetrics
GET /embeddings/usage                → getUsagePatterns
```

**Critical**: All endpoints must read `X-Project-Id` from headers:
```typescript
const projectId = req.headers['x-project-id'];
```

### 2.2 Implement Missing Service Method (if needed)
**File**: `mandrel-command/backend/src/services/EmbeddingService.ts`

**Check if `getRelevanceMetrics` exists**. If not, implement:

```typescript
static async getRelevanceMetrics(userId: string, options: { projectId?: string }) {
  // Query contexts.relevance_score aggregates
  // Return: totalContexts, scoredContexts, coverageRate, 
  //         averageScore, medianScore, distribution, trend, topTags
}
```

### 2.3 Update Routes
**File**: `mandrel-command/backend/src/routes/embeddings.ts`

Mount all controller handlers to Express/Fastify routes.

---

## Phase 3: Fix Type Mismatches (1h)

### 3.1 ID Type Consistency
**Issue**: Service returns `number` for point.id, UI expects `string`

**Fix in**: `mandrel-command/backend/src/services/EmbeddingService.ts`

```typescript
// In getProjection and getClusters:
return points.map(p => ({
  ...p,
  id: String(p.id)  // Cast to string
}));
```

---

## Phase 4: Verification & Testing (1-2h)

### 4.1 Tab-by-Tab Verification

**Working (verify endpoints respond correctly)**:
- ✅ Similarity Heatmap → `/embeddings/:id/similarity`
- ✅ 2D Projection → `/embeddings/:id/projection`
- ✅ Clustering → `/embeddings/:id/cluster`

**Not Wired (wire and test)**:
- ❌ Relevance Dashboard → `/embeddings/relevance`
- ❌ Project Relationships → `/embeddings/relationships`
- ❌ Knowledge Gaps → `/embeddings/knowledge-gaps`
- ❌ Usage Patterns → `/embeddings/usage`
- ❌ Quality Metrics → `/embeddings/:id/metrics`

**UI Only (no backend needed)**:
- 🎨 3D View (placeholder for Phase 4)
- 🎨 Settings (UI state only)

### 4.2 Header Verification
Ensure all endpoints correctly read `X-Project-Id` header and pass to service methods.

### 4.3 Response Shape Validation
Match service response fields to component expectations (check field names in UI components).

---

## Implementation Order

1. **Database diagnostics** (15 min) → verify dimension consistency
2. **Embedding normalization** (30 min) → add `toTargetDimensions` helper
3. **Wire missing routes** (2-3h) → create controller handlers and mount routes
4. **Implement missing service methods** (1-2h) → if `getRelevanceMetrics` missing
5. **Fix type mismatches** (30 min) → cast IDs to strings
6. **End-to-end testing** (1h) → verify all tabs load data correctly

---

## Success Criteria

- [ ] All embeddings in database are 1536 dimensions
- [ ] No NULL embeddings in active contexts
- [ ] No circular references (embeddings in content field)
- [ ] All 8 analytics tabs render without errors
- [ ] Backend returns correct response shapes for all endpoints
- [ ] `X-Project-Id` header properly read and used
- [ ] Type consistency between backend (service) and frontend (components)

---

## Files to Modify

### Backend
- `mcp-server/src/services/embedding.ts` - Add dimension normalization
- `mcp-server/src/config/database.ts` - Enforce column type constraint
- `mandrel-command/backend/src/services/EmbeddingService.ts` - Add `getRelevanceMetrics` if missing, fix ID types
- `mandrel-command/backend/src/controllers/EmbeddingsController.ts` - Wire missing endpoints
- `mandrel-command/backend/src/routes/embeddings.ts` - Mount new routes

### Frontend (verify only, no changes)
- `mandrel-command/frontend/src/api/embeddingsClient.ts` - Already sends `xProjectId` header
- Component files - Already call correct API methods

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Existing 384D vectors in DB | Backfill before enforcing column type |
| Header case sensitivity | Use lowercase 'x-project-id' consistently |
| Type mismatches break charts | Cast all IDs to strings in service layer |
| Heavy queries on large datasets | Keep as-is, add indices if slow (future) |

---

## Estimated Total Time: 6-10 hours

**Breakdown**:
- Phase 1 (Database & Dimensions): 1-3h
- Phase 2 (Wire Endpoints): 2-4h
- Phase 3 (Type Fixes): 1h
- Phase 4 (Testing): 1-2h

---

**Next Steps**: Review this plan, then begin implementation with Phase 1 database diagnostics.
