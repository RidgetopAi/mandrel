# EMBEDDINGS MIGRATION CHECKLIST - 384D to 1536D

## 🎯 CRITICAL MISSION: RESTORE AIDIS STABILITY

**PROBLEM**: Server expects 1536D embeddings, database has 384D embeddings
**GOAL**: Zero-downtime migration with complete data preservation

---

## ✅ EXECUTION CHECKLIST

### 📋 PHASE 1: PRE-MIGRATION SAFETY
- [ ] **1.1 Full System Backup**
  - [ ] Database backup: `pg_dump -h localhost -p 5432 -d aidis_production > aidis_production_384d_backup.sql`
  - [ ] Verify git status clean
  - [ ] Code backup: `cp -r /home/ridgetop/aidis /home/ridgetop/aidis_migration_backup`

- [ ] **1.2 Document Current State**  
  - [ ] Record current embedding dimensions in database
  - [ ] Document table structure
  - [ ] Verify we have 8 contexts to migrate

**SUCCESS**: Full backup completed, current state documented

### 📋 PHASE 2: DATABASE SCHEMA MIGRATION
- [ ] **2.1 Create Migration SQL**
  - [ ] Create `mcp-server/database/migrations/018_migrate_embeddings_1536.sql`
  - [ ] Add embedding_1536 column (vector(1536))
  - [ ] Add embedding_migrated tracking column

- [ ] **2.2 Execute Schema Migration**
  - [ ] Run migration SQL
  - [ ] Verify new columns exist
  - [ ] Confirm no data loss

**SUCCESS**: New embedding_1536 column added, original data intact

### 📋 PHASE 3: DATA MIGRATION STRATEGY  
- [ ] **3.1 Create Migration Script**
  - [ ] Build `migrate-embeddings.ts` script
  - [ ] Process contexts in batches
  - [ ] Generate 1536D embeddings for all content

- [ ] **3.2 Execute Data Migration**
  - [ ] Run embedding regeneration script
  - [ ] Monitor progress (8 contexts total)
  - [ ] Verify all contexts migrated

- [ ] **3.3 Verify Migration Success**
  - [ ] Check all contexts have embedding_migrated = true
  - [ ] Verify all embeddings are 1536D
  - [ ] Confirm no missing embeddings

**SUCCESS**: All 8 contexts have 1536D embeddings

### 📋 PHASE 4: SCHEMA FINALIZATION
- [ ] **4.1 Switch to New Column**
  - [ ] Rename embedding to embedding_384_backup  
  - [ ] Rename embedding_1536 to embedding
  - [ ] Update constraints

- [ ] **4.2 Create Performance Index**
  - [ ] Create ivfflat index on new embedding column
  - [ ] Verify index creation successful

**SUCCESS**: Production system using 1536D embeddings with proper indexing

### 📋 PHASE 5: SERVER CONFIGURATION
- [ ] **5.1 Verify Environment Config**
  - [ ] Check EMBEDDING_TARGET_DIMENSIONS=1536
  - [ ] Verify embedding service configuration

- [ ] **5.2 Test Embedding Generation**
  - [ ] Generate test embedding
  - [ ] Confirm dimensions = 1536
  - [ ] Verify service working properly

**SUCCESS**: Embedding service generates 1536D vectors consistently

### 📋 PHASE 6: SYSTEM VERIFICATION
- [ ] **6.1 Test Context Operations**
  - [ ] Test context_store with new embeddings
  - [ ] Test context_search with similarity
  - [ ] Verify no dimension errors

- [ ] **6.2 Performance Testing**
  - [ ] Run similarity search queries
  - [ ] Check query performance
  - [ ] Monitor for errors

- [ ] **6.3 Full System Test**
  - [ ] Start AIDIS server
  - [ ] Test all context operations
  - [ ] Verify system stability

**SUCCESS**: All operations work, no embedding errors, system stable

---

## 🚨 ROLLBACK PROCEDURES

### Quick Rollback (Phases 2-3)
```sql
ALTER TABLE contexts DROP COLUMN embedding_1536;
ALTER TABLE contexts DROP COLUMN embedding_migrated;
```

### Full Rollback (Phase 4+)
```sql  
ALTER TABLE contexts RENAME COLUMN embedding TO embedding_1536_backup;
ALTER TABLE contexts RENAME COLUMN embedding_384_backup TO embedding;
```

### Nuclear Option
```bash
psql -h localhost -p 5432 -d aidis_production < aidis_production_384d_backup.sql
```

---

## 📊 SUCCESS METRICS

1. ✅ **Zero Data Loss**: All 8 contexts preserved
2. ✅ **Dimension Consistency**: All embeddings 1536D  
3. ✅ **System Functional**: context_store/search working
4. ✅ **Performance Good**: Similarity search fast
5. ✅ **Server Stable**: No embedding errors

---

**ESTIMATED TIME**: 2-3 hours
**RISK**: Medium (full backup safety)
**STATUS**: Ready to execute
