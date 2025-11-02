# Critical Fixes Log - Spindles Phase 2.1

## Fix #1: Embedding Dimensions (2025-11-02 07:45 UTC)

**Discovered by:** User review (excellent catch!)
**Severity:** CRITICAL - Would have caused incompatibility with Mandrel

### Issue
Phase 2 design specified `embedding vector(384)` based on raw all-MiniLM-L6-v2 model output. This is INCORRECT.

### Root Cause
Mandrel MCP server normalizes ALL embeddings to 1536 dimensions for compatibility with OpenAI's text-embedding-ada-002 format.

**Evidence:**
```typescript
// mcp-server/src/services/embedding.ts
constructor() {
  this.targetDimensions = parseInt(
    process.env.EMBEDDING_TARGET_DIMENSIONS || '1536'  // ← DEFAULT: 1536
  );
}

// Lines 670-700: normalizeEmbedding()
// Pads 384D → 1536D or downsamples >1536D → 1536D
```

**Database verification:**
```sql
aidis_production=# \d contexts
 embedding | vector(1536) | ← Current production standard
```

### Correct Implementation

**Database Schema (TS-002-2-1):**
```sql
CREATE TABLE spindles (
  ...
  embedding vector(1536),  -- NOT vector(384)!
  ...
);
```

**Embedding Generator (TS-025-2-1):**
```typescript
class EmbeddingGenerator {
  private model: any;
  private localModelName = 'Xenova/all-MiniLM-L6-v2'; // Outputs 384D
  private targetDimensions = 1536; // Mandrel standard

  async generate(content: string): Promise<number[]> {
    // 1. Generate 384D embedding from model
    const raw384 = await this.embedder(content, {
      pooling: 'mean',
      normalize: true
    });

    // 2. Normalize to 1536D (copy Mandrel logic)
    const normalized1536 = this.normalizeEmbedding(
      Array.from(raw384.data),
      1536
    );

    return normalized1536;
  }

  private normalizeEmbedding(source: number[], target: number): number[] {
    // Copy implementation from mcp-server/src/services/embedding.ts:670-700
    if (source.length === target) return source;

    const normalized = new Array(target);
    if (source.length > target) {
      // Downsample
      const step = source.length / target;
      for (let i = 0; i < target; i++) {
        normalized[i] = source[Math.floor(i * step)];
      }
    } else {
      // Pad (repeat pattern)
      for (let i = 0; i < target; i++) {
        normalized[i] = source[i % source.length];
      }
    }
    return normalized;
  }
}
```

### Benefits of Matching Mandrel Standard

1. **Compatibility:** Can query across both spindles and contexts tables
2. **Future-proof:** Ready for OpenAI API fallback if needed
3. **Consistency:** Same dimensionality across all AIDIS systems
4. **Interoperability:** Cross-system semantic search possible

### Affected Tasks

- **TS-002-2-1:** Updated description to specify vector(1536)
- **TS-025-2-1:** Updated to include normalization step

### Verification Steps

When implementing, verify:
```sql
-- Check spindles table
SELECT data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'spindles'
AND column_name = 'embedding';
-- Should return: vector, 1536

-- Test embedding insert
INSERT INTO spindles (id, content, embedding, ...)
VALUES ('test-id', 'test', '[0.1, 0.2, ...]'::vector(1536), ...);
-- Should succeed with 1536-element array

-- Compare with contexts
\d contexts
-- embedding column should also be vector(1536)
```

### Status
- ✅ Issue identified
- ✅ Context stored in Mandrel
- ✅ Implementation plan updated
- ⚠️ Task updates failed (null constraint) - manual note added
- ⏳ Awaiting implementation CC to pick up corrected specs

### Notes
This is EXACTLY the kind of detail review that prevents production bugs. Thank you for catching this!
