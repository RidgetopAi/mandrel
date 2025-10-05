# AIDIS Database Migration Walkthrough

This guide walks through the exact steps required to apply the new embedding migration (`021_standardize_embedding_dimensions.sql`) and validate that contexts now store 1536-dimensional vectors. Each step includes a short explanation of what and why, so you can follow it end-to-end even if you are new to the workflow.

---

## 1. Prepare Your Environment

1. **Open a fresh terminal session**  
   _Why: ensures no stale environment variables or background processes interfere._

2. **Change into the project directory**  
   ```bash
   cd /path/to/aidis
   ```  
   _Why: all scripts in this guide assume you are in the repository root._

3. **Ensure Node.js and npm are available**  
   ```bash
   node --version
   npm --version
   ```  
   _Why: the migration runner and build scripts are Node-based._

---

## 2. Configure Database Access

1. **Identify the database credentials**  
   Gather the following values (ask your DBA if unsure):
   - `DATABASE_NAME`
   - `DATABASE_USER`
   - `DATABASE_PASSWORD`
   - `DATABASE_HOST` (e.g., `localhost`)
   - `DATABASE_PORT` (default PostgreSQL port is `5432`)

2. **Export environment variables in the terminal**  
   ```bash
   export DATABASE_NAME=aidis_development
   export DATABASE_USER=ridgetop
   export DATABASE_PASSWORD=your_password_here
   export DATABASE_HOST=localhost
   export DATABASE_PORT=5432
   ```  
   _Why: `mcp-server/src/config/database.ts` reads these values to create a connection pool. Without them, the migration runner cannot authenticate._

3. **(Optional) Persist the variables in a `.env` file**  
   If you prefer loading variables automatically, create `mcp-server/.env` with the same key/value pairs. Then use a tool like `direnv` or `dotenv-cli` to load them.  
   _Why: saves typing next time, but make sure you do **not** commit secrets to version control._

---

## 3. Apply the Migration

1. **Install dependencies if you have not already**  
   ```bash
   npm install
   npm --prefix mcp-server install
   ```  
   _Why: ensures `tsx` and other dependencies required by the migration runner are present._

2. **Run the canonical migration command**  
   ```bash
   npm --prefix mcp-server run db:migrate
   ```  
   _What happens:_
   - `scripts/migrate.ts` initializes the DB connection using your env vars.
   - It ensures `_aidis_migrations` exists.
   - It runs all pending SQL files, including `021_standardize_embedding_dimensions.sql`.
   - The new migration converts `contexts.embedding` to `vector(1536)`, enforces a check constraint, and rebuilds the IVFFlat index.

3. **Review the migration output**  
   Look for lines similar to:
   - `✅ Migration tracking table ready`
   - `🔄 Applying migration: 021_standardize_embedding_dimensions.sql`
   - `✅ Applied migration: 021_standardize_embedding_dimensions.sql`
   _Why: confirms the migration executed and was recorded._

4. **Verify migration status manually (optional)**  
   ```bash
   psql "$DATABASE_NAME" -c "SELECT filename, applied_at FROM _aidis_migrations ORDER BY applied_at DESC LIMIT 5;"
   ```  
   _Why: double-check that `021_standardize_embedding_dimensions.sql` is listed. Replace `psql` with your preferred client if needed._

---

## 4. Regenerate Embeddings (Existing Data)

The migration clears existing embeddings by setting them to `NULL`. Regenerate vectors so searches work correctly.

1. **Decide on your regeneration approach**  
   Common options:
   - Run an existing backfill script (if the project already has one).
   - Write a one-off script to load each context and call the embedding service.
   - Trigger application code paths that re-store or re-index contexts.

2. **Example: quick script using existing handlers**  
   _Pseudo-outline (adapt as necessary):_
   ```ts
   import { contextHandler } from './mcp-server/src/handlers/context.ts';
   import { db, initializeDatabase } from './mcp-server/src/config/database.ts';

   await initializeDatabase();
   const { rows } = await db.query('SELECT id, content, context_type, project_id, session_id FROM contexts ORDER BY created_at');

   for (const row of rows) {
     await contextHandler.storeContext({
       projectId: row.project_id,
       sessionId: row.session_id,
       type: row.context_type,
       content: row.content,
       relevanceScore: 5,
     });
   }
   ```
   _Why: calling `storeContext` reuses the embedding pipeline, which now pads/down-samples to 1536 dimensions automatically._

3. **Track progress**  
   Use SQL to confirm embeddings are repopulated:
   ```bash
   psql "$DATABASE_NAME" -c "SELECT COUNT(*) FROM contexts WHERE embedding IS NOT NULL;"
   ```
   _Why: ensures the backfill is complete. Expect the number to match `contexts` row count when finished._

---

## 5. Validate Application Behavior

1. **Run targeted tests**  
   ```bash
   npm --prefix mcp-server run test -- Context
   ```  
   _Or execute any test suite that touches context storage/search._

2. **Smoke test MCP server startup**  
   ```bash
   npm --prefix mcp-server run dev
   ```
   - Hit a few context tools (e.g., via your normal client or curl).  
   - Ensure new contexts store without errors and report `Embedding: 1536D` in the logs.

3. **Verify semantic search results**  
   - Perform a few sample searches (CLI, API, or UI).  
   - Confirm results look reasonable and no errors appear about vector dimensions.

---

## 6. Record Completion & Next Steps

1. **Update task tracking (AIDIS)**  
   After verifying, mark `P2.2: Standardize embedding dimensions` complete if the migration and backfill succeeded.

2. **Document any issues encountered**  
   Store a context note if you hit problems or had to run special scripts; this will help the next session.

3. **Plan the follow-up work**  
   Remaining P2.2 items include:
   - Normalizing git tracking tables.
   - Validating complexity tracking migration application.
   - Reviewing pattern schema consolidation.

---

## Troubleshooting Tips

- **Connection refused / authentication errors**  
  Double-check the exported env vars. Remember that PostgreSQL users may require explicit `ALTER ROLE` statements to set passwords.

- **Migration script exits early**  
  Look for error messages in the terminal. Fix the SQL or data issue, then rerun `npm --prefix mcp-server run db:migrate`.

- **Embeddings stay `NULL`**  
  Make sure your backfill script or application handler really writes new embeddings; log the length of the generated vector to confirm it is 1536.

- **Performance**  
  Rebuilding the IVFFlat index can briefly impact performance. Schedule the migration during a maintenance window if you have production traffic.

---

## Summary

Following this walkthrough ensures the database schema, embedding service, and stored data all align on 1536-dimensional vectors—the prerequisite for the rest of the Phase 2.2 refactor. Once this is complete and tested, you can move confidently into the git tracking and pattern schema tasks without worrying about mismatched embeddings.
