# EMBEDDINGS MIGRATION PLAN - 384D to 1536D

## 🎯 MISSION: RESTORE SYSTEM STABILITY

**CRITICAL ISSUE**: AIDIS server code expects 1536-dimensional embeddings but database has 384-dimensional embeddings and schema. This mismatch is causing system instability.

**GOAL**: Migrate database from 384D to 1536D embeddings with zero data loss.

---

## 📋 PHASE 1: PRE-MIGRATION SAFETY

### **Step 1.1: Full System Backup**
```bash
# Database backup
pg_dump -h localhost -p 5432 -d aidis_production > aidis_production_384d_backup.sql

# Code backup (already in git stash)
git status  # Verify clean state

# Create migration checkpoint
cp -r /home/ridgetop/aidis /home/ridgetop/aidis_migration_backup
```

### **Step 1.2: Document Current State**
```sql
-- Record current embedding dimensions
SELECT 
  COUNT(*) as total_contexts,
  array_length(string_to_array(trim(both '[]' from embedding::text), ','), 1) as dims
FROM contexts 
WHERE embedding IS NOT NULL 
GROUP BY dims;

-- Record table structure
\d contexts
```

**SUCCESS CRITERIA**: Full backup completed, current state documented

---

## 📋 PHASE 2: DATABASE SCHEMA MIGRATION

### **Step 2.1: Create Migration SQL**
Create `018_migrate_embeddings_1536.sql`:
```sql
-- Migration: 384D to 1536D embeddings
BEGIN;

-- Step 1: Add new embedding column with 1536 dimensions
ALTER TABLE contexts ADD COLUMN embedding_1536 vector(1536);

-- Step 2: Create index on new column (will be built after data migration)
-- CREATE INDEX CONCURRENTLY contexts_embedding_1536_idx ON contexts USING ivfflat (embedding_1536 vector_cosine_ops);

-- Step 3: Add migration status column to track progress
ALTER TABLE contexts ADD COLUMN embedding_migrated boolean DEFAULT false;

COMMIT;
```

### **Step 2.2: Execute Schema Migration**
```bash
cd /home/ridgetop/aidis/mcp-server/database/migrations
psql -h localhost -p 5432 -d aidis_production -f 018_migrate_embeddings_1536.sql
```

**SUCCESS CRITERIA**: New `embedding_1536` column added, no data loss

---

## 📋 PHASE 3: DATA MIGRATION STRATEGY

### **Step 3.1: Prepare Embedding Re-generation Script**
Create `migrate-embeddings.ts`:
```typescript
// Re-generate all embeddings as 1536D using current embedding service
// Process in batches to avoid memory issues
// Update embedding_1536 column and set embedding_migrated = true
```

### **Step 3.2: Execute Data Migration**
```bash
# Run embedding regeneration (will take time - 8 contexts to process)
cd /home/ridgetop/aidis/mcp-server
npx tsx migrate-embeddings.ts
```

### **Step 3.3: Verify Migration**
```sql
-- Check migration progress
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN embedding_migrated THEN 1 ELSE 0 END) as migrated,
  SUM(CASE WHEN embedding_1536 IS NOT NULL THEN 1 ELSE 0 END) as has_1536_embedding
FROM contexts;

-- Verify 1536 dimensions
SELECT 
  array_length(string_to_array(trim(both '[]' from embedding_1536::text), ','), 1) as dims,
  COUNT(*)
FROM contexts 
WHERE embedding_1536 IS NOT NULL 
GROUP BY dims;
```

**SUCCESS CRITERIA**: All contexts have 1536D embeddings, migration_status = true

---

## 📋 PHASE 4: SCHEMA FINALIZATION

### **Step 4.1: Switch to New Column**
```sql
BEGIN;

-- Rename columns
ALTER TABLE contexts RENAME COLUMN embedding TO embedding_384_backup;
ALTER TABLE contexts RENAME COLUMN embedding_1536 TO embedding;

-- Update column constraint
ALTER TABLE contexts ALTER COLUMN embedding SET NOT NULL WHERE embedding IS NOT NULL;

COMMIT;
```

### **Step 4.2: Create Performance Index**
```sql
-- Create index for fast similarity search
CREATE INDEX CONCURRENTLY contexts_embedding_1536_idx ON contexts USING ivfflat (embedding vector_cosine_ops);
```

### **Step 4.3: Clean Up Migration Columns**
```sql
-- After everything is verified working (not immediately)
-- ALTER TABLE contexts DROP COLUMN embedding_384_backup;
-- ALTER TABLE contexts DROP COLUMN embedding_migrated;
```

**SUCCESS CRITERIA**: Production system using 1536D embeddings

---

## 📋 PHASE 5: SERVER CONFIGURATION

### **Step 5.1: Update Environment Configuration**
```bash
# Ensure server uses 1536 dimensions (should be default)
echo 'EMBEDDING_TARGET_DIMENSIONS=1536' >> /home/ridgetop/aidis/config/environments/.env.development
```

### **Step 5.2: Verify Embedding Service**
Test that embedding service generates 1536D vectors:
```bash
cd /home/ridgetop/aidis/mcp-server
npx tsx -e "
import { EmbeddingService } from './src/services/embedding.js';
const service = new EmbeddingService();
const result = await service.generateEmbedding('test');
console.log('Dimensions:', result.embedding.length);
console.log('Expected: 1536');
"
```

**SUCCESS CRITERIA**: Embedding service generates 1536D vectors

---

## 📋 PHASE 6: SYSTEM VERIFICATION

### **Step 6.1: Test Context Operations**
```bash
# Test context storage with new embeddings
# Test context search with 1536D similarity
```

### **Step 6.2: Performance Verification**
```sql
-- Test similarity search performance
SELECT content, embedding <=> 'test_vector' as similarity
FROM contexts 
ORDER BY similarity ASC 
LIMIT 5;
```

### **Step 6.3: Full System Test**
```bash
# Start AIDIS server
cd /home/ridgetop/aidis/mcp-server
npm run dev

# Verify no embedding dimension errors
# Test context_store and context_search operations
```

**SUCCESS CRITERIA**: All context operations work with 1536D embeddings

---

## 🚨 ROLLBACK PLAN

**If anything goes wrong at any phase:**

### **Phase 2-3 Rollback**: 
```sql
-- Remove new columns, restore original state
ALTER TABLE contexts DROP COLUMN embedding_1536;
ALTER TABLE contexts DROP COLUMN embedding_migrated;
```

### **Phase 4+ Rollback**:
```sql
-- Restore original embedding column
ALTER TABLE contexts RENAME COLUMN embedding TO embedding_1536_backup;
ALTER TABLE contexts RENAME COLUMN embedding_384_backup TO embedding;
```

### **Complete System Rollback**:
```bash
# Nuclear option: restore full database backup
psql -h localhost -p 5432 -d aidis_production < aidis_production_384d_backup.sql
```

---

## ✅ EXECUTION CHECKLIST

- [ ] Phase 1: Backup & Documentation Complete
- [ ] Phase 2: Schema Migration (add embedding_1536 column)
- [ ] Phase 3: Data Migration (regenerate all embeddings as 1536D)
- [ ] Phase 4: Schema Switch (make embedding_1536 the primary column)
- [ ] Phase 5: Server Configuration (verify 1536D generation)
- [ ] Phase 6: System Verification (test all operations)
- [ ] Cleanup: Remove backup columns (after 1 week of stable operation)

---

## 🎯 SUCCESS METRICS

1. **Zero Data Loss**: All 8 contexts preserved with content intact
2. **Dimension Consistency**: All embeddings are 1536-dimensional  
3. **Functional System**: context_store and context_search work properly
4. **Performance**: Similarity search performs well with new dimensions
5. **Server Stability**: No embedding-related errors in logs

---

**ESTIMATED TIME**: 2-3 hours total
**RISK LEVEL**: Medium (full backup provides safety net)
**PRIORITY**: Critical (system stability depends on this)
