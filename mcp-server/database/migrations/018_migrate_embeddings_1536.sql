-- Migration: 384D to 1536D embeddings
BEGIN;

-- Step 1: Add new embedding column with 1536 dimensions
ALTER TABLE contexts ADD COLUMN embedding_1536 vector(1536);

-- Step 2: Add migration status column to track progress
ALTER TABLE contexts ADD COLUMN embedding_migrated boolean DEFAULT false;

COMMIT;
