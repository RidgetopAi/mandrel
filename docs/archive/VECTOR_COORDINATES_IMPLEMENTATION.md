# Vector Coordinate Mapping Implementation

## Overview
Added 3D coordinate mapping for 1536-dimensional embeddings in the mandrel database.

## Changes Made

### 1. Database Schema (✅ Complete)
Added columns to `contexts` table:
- `vector_x FLOAT` - X coordinate
- `vector_y FLOAT` - Y coordinate  
- `vector_z FLOAT` - Z coordinate
- `mapping_method VARCHAR(20)` - Algorithm used ('umap')
- `mapped_at TIMESTAMP WITH TIME ZONE` - When mapped
- Index on coordinates for fast spatial queries

### 2. Dimensionality Reduction Service (✅ Complete)
**File:** `mcp-server/src/services/dimensionality-reduction.ts`

Features:
- UMAP algorithm for 1536D → 3D reduction
- Batch processing with configurable parameters
- Incremental mapping (maps new vectors using existing as context)
- Coordinate normalization to [-10, 10] range
- PCA-like fallback when UMAP fails
- K-nearest neighbor interpolation for single vectors

Dependencies:
- `umap-js` - UMAP algorithm implementation

### 3. Batch Processing Script (✅ Complete)
**File:** `mcp-server/map-existing-vectors.ts`

Usage:
```bash
npx tsx mcp-server/map-existing-vectors.ts [batchSize]
```

Features:
- Processes existing vectors in batches (default: 1000)
- Shows progress with percentage complete
- Normalizes coordinates to [-10, 10] range
- Updates database with mapping metadata

### 4. Auto-Coordinate Generation (✅ Complete)
**File:** `mcp-server/src/handlers/context.ts`

New vectors automatically get coordinates when stored:
- Uses last 100 project vectors as reference context
- Interpolates position using k-nearest neighbors
- Fallback to direct UMAP reduction for first vectors
- Graceful degradation to (0,0,0) on errors

## Usage

### Map All Existing Vectors
```bash
cd /home/ridgetop/aidis
npx tsx mcp-server/map-existing-vectors.ts
```

### Query Vectors by Spatial Proximity
```sql
-- Find contexts near a point
SELECT id, content, 
       sqrt(power(vector_x - 5.0, 2) + power(vector_y - 3.0, 2) + power(vector_z - 2.0, 2)) as distance
FROM contexts
WHERE vector_x IS NOT NULL
ORDER BY distance
LIMIT 10;
```

### Get Coordinate Statistics
```sql
SELECT 
  COUNT(*) as total_mapped,
  MIN(vector_x) as min_x, MAX(vector_x) as max_x,
  MIN(vector_y) as min_y, MAX(vector_y) as max_y,
  MIN(vector_z) as min_z, MAX(vector_z) as max_z,
  mapping_method
FROM contexts
WHERE vector_x IS NOT NULL
GROUP BY mapping_method;
```

## Configuration

UMAP parameters (in `dimensionality-reduction.ts`):
- **nNeighbors**: 15 (local vs global structure balance)
- **minDist**: 0.1 (minimum distance between points)
- **spread**: 1.0 (effective scale of embedded points)
- **dimensions**: 3 (output dimensionality)

Coordinate range: **[-10, 10]** on all axes

## Performance

- Batch processing: ~1000 vectors per batch
- Incremental mapping: Uses k=5 nearest neighbors
- Reference context: Last 100 vectors per project
- Fallback: PCA-like reduction if UMAP fails

## Next Steps

1. Run batch script to map existing vectors
2. Verify coordinates in database
3. Build visualization tools using the coordinates
4. Monitor auto-mapping performance on new contexts

## Files Modified/Created

### Created:
- `mcp-server/src/services/dimensionality-reduction.ts`
- `mcp-server/map-existing-vectors.ts`
- `VECTOR_COORDINATES_IMPLEMENTATION.md`

### Modified:
- `mcp-server/src/handlers/context.ts` (auto-coordinate generation)
- Database schema: `contexts` table

### Dependencies Added:
- `umap-js` package

## Testing

```bash
# Type check
cd mcp-server
npm run type-check

# Map vectors
npx tsx map-existing-vectors.ts

# Verify in database
psql -h localhost -p 5432 -d mandrel -c "SELECT COUNT(*) FROM contexts WHERE vector_x IS NOT NULL"
```

---
**Status:** ✅ Implementation Complete
**Date:** 2025-11-06
**TypeScript Build:** ✅ Passing
