# Context Search Threshold Fix

## Problem Identified
**Root Cause:** The `min_similarity` parameter was defined but never actually used in the SQL query.

### Original Code (Line 122)
```typescript
sqlParams.push(`%${query}%`, 2.5); // Hardcoded threshold
```

### Issues
1. **Parameter ignored**: `min_similarity = 0.3` was defined (line 84) but never used
2. **Invalid threshold**: `2.5` exceeds pgvector's cosine distance range (0-2)
3. **Too permissive**: With 2.5, ALL vectors passed (explained partner's "filters nothing" report)
4. **Previous 0.7 was too strict**: Filtered almost everything (explained partner's "filters everything" report)

## Solution Implemented
**Fixed Line 122:**
```typescript
sqlParams.push(`%${query}%`, min_similarity); // Now uses parameter (default 0.3)
```

## Understanding pgvector Cosine Distance (`<->`)
- **Range**: 0 to 2
- **0** = Identical vectors (perfect match)
- **1** = Orthogonal vectors (no similarity)
- **2** = Opposite vectors (completely dissimilar)

### Threshold Interpretation
- **0.3** (default): Accept vectors with distance ≤ 0.3 (high similarity)
- **0.7**: Accept vectors with distance ≤ 0.7 (moderate similarity)
- **2.5**: Invalid! Accepts nothing since max possible distance is 2.0

## Why Previous Values Failed
1. **0.7 was too strict** because most similar contexts had distance > 0.7
2. **2.5 filtered nothing** because pgvector never returns distance > 2.0, so all results passed

## Default Behavior
- **Default threshold**: 0.3 (high similarity required)
- **Adjustable**: Callers can pass `min_similarity` parameter to tune strictness
- **Fallback**: If no semantic matches found, falls back to text search (ILIKE)

## Testing Recommendations
1. Try searches with default `min_similarity=0.3`
2. If too strict, increase to `0.5` or `0.7`
3. Monitor query results to tune threshold per use case
