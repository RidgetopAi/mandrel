/**
 * Migration 053 — LEGACY-SCHEMA DROP contract test (Surveyor P4b, task 8ed9e216 / decision 8f330f96).
 *
 * The DANGEROUS, real-world scenario the CI provision path does NOT exercise: production was
 * verified to hold a POPULATED legacy denormalized Surveyor schema (surveyor_scans=72,
 * surveyor_warnings=7077 rows of the abandoned format). Brian's DECISION (2026-06-27): that
 * data is junk — DROP it. So migration 053 must DROP the legacy tables/view REGARDLESS of row
 * count, yet must NEVER destroy real NEW (normalized P4b) data on a re-run.
 *
 * This test applies the EXACT 053 SQL (the same string migrate.ts runs: `db.query(sql)`) against
 * a DB pre-seeded with the POPULATED LEGACY shape, and proves:
 *   (a) the legacy rows + old denormalized shape are GONE after the migration;
 *   (b) the new normalized schema exists AND is usable (full insert round-trip);
 *   (c) re-running the migration on the NEW schema is SAFE — idempotent + non-destructive
 *       (it detects no legacy shape, drops nothing, and newly-inserted normalized data survives).
 *
 * Isolation note: this mutates the shared disposable CI DB's surveyor_* objects, but always
 * ends with the migration applied (the canonical normalized schema) and its own projects
 * deleted, so the DB is left exactly as migrate.ts produced it for any other test file.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { db } from '../config/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// src/tests/ -> mcp-server/database/migrations/053_create_surveyor_scans.sql
const MIGRATION_053 = resolve(__dirname, '../../database/migrations/053_create_surveyor_scans.sql');
const MIG_SQL = readFileSync(MIGRATION_053, 'utf8');

const STAMP = Date.now();
const LEGACY_PROJ = `surveyor-legacy-${STAMP}`;
const NEW_PROJ = `surveyor-new-${STAMP}`;

let legacyProjectId: string;
let newProjectId: string;

/** Re-create the EXACT legacy denormalized shape from the 000 baseline (the prod junk). */
async function seedPopulatedLegacySchema(): Promise<void> {
  // Start from a clean slate: remove whatever surveyor_* objects the provision migrate left
  // (the NEW normalized schema), so we can stand the legacy shape back up underneath it.
  await db.query('DROP VIEW  IF EXISTS public.v_surveyor_scan_summaries');
  await db.query('DROP TABLE IF EXISTS public.surveyor_function_summaries CASCADE');
  await db.query('DROP TABLE IF EXISTS public.surveyor_warnings           CASCADE');
  await db.query('DROP TABLE IF EXISTS public.surveyor_connections        CASCADE');
  await db.query('DROP TABLE IF EXISTS public.surveyor_nodes              CASCADE');
  await db.query('DROP TABLE IF EXISTS public.surveyor_scans             CASCADE');

  // Legacy denormalized surveyor_scans (verbatim relevant columns from 000_baseline_schema.sql:
  // the legacy-ONLY signature columns clusters / summary_l0 / nodes / connections live here).
  await db.query(`
    CREATE TABLE public.surveyor_scans (
      id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
      project_id uuid NOT NULL,
      project_path text NOT NULL,
      project_name text NOT NULL,
      status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
      created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
      completed_at timestamp with time zone,
      total_files integer DEFAULT 0,
      total_functions integer DEFAULT 0,
      total_classes integer DEFAULT 0,
      total_connections integer DEFAULT 0,
      total_warnings integer DEFAULT 0,
      analyzed_count integer DEFAULT 0,
      pending_analysis integer DEFAULT 0,
      health_score integer,
      warnings_by_level jsonb DEFAULT '{"info": 0, "error": 0, "warning": 0}'::jsonb,
      nodes_by_type jsonb DEFAULT '{"file": 0, "class": 0, "cluster": 0, "function": 0}'::jsonb,
      nodes jsonb DEFAULT '{}'::jsonb,
      connections jsonb DEFAULT '[]'::jsonb,
      clusters jsonb DEFAULT '[]'::jsonb,
      errors jsonb DEFAULT '[]'::jsonb,
      summary_l0 text,
      summary_l1 text,
      summary_l2 text
    )
  `);
  await db.query(`
    CREATE TABLE public.surveyor_warnings (
      id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
      scan_id uuid NOT NULL REFERENCES public.surveyor_scans(id) ON DELETE CASCADE,
      category character varying(50) NOT NULL,
      level character varying(20) NOT NULL,
      title text NOT NULL,
      description text,
      affected_nodes jsonb DEFAULT '[]'::jsonb,
      file_path text,
      suggestion jsonb,
      detected_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE VIEW public.v_surveyor_scan_summaries AS
      SELECT s.id, s.project_id, p.name AS project_name, s.project_path, s.status,
             s.created_at, s.completed_at, s.total_files, s.total_functions,
             s.total_classes, s.total_warnings, s.health_score, s.warnings_by_level,
             s.summary_l0,
             EXTRACT(epoch FROM (s.completed_at - s.created_at)) AS scan_duration_seconds
        FROM public.surveyor_scans s
        LEFT JOIN public.projects p ON s.project_id = p.id
       ORDER BY s.created_at DESC
  `);

  // Populate it like prod did (denormalized rows + a pile of warnings).
  for (let i = 0; i < 3; i++) {
    const scanId = (
      await db.query(
        `INSERT INTO public.surveyor_scans
           (project_id, project_path, project_name, status, clusters, nodes, summary_l0)
         VALUES ($1, $2, $3, 'complete', '[{"id":"c1"}]'::jsonb, '{"n1":{}}'::jsonb, $4)
         RETURNING id`,
        [legacyProjectId, `/legacy/path/${i}`, `legacy-${i}`, `health overview ${i}`],
      )
    ).rows[0].id;
    for (let w = 0; w < 4; w++) {
      await db.query(
        `INSERT INTO public.surveyor_warnings (scan_id, category, level, title)
         VALUES ($1, 'circular_dependency', 'warning', $2)`,
        [scanId, `legacy warning ${i}-${w}`],
      );
    }
  }
}

/** Apply migration 053 EXACTLY as migrate.ts does: the whole file in one query. */
async function applyMigration053(): Promise<void> {
  await db.query(MIG_SQL);
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const r = await db.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, column],
  );
  return r.rowCount! > 0;
}

describe('migration 053 — drops the populated LEGACY surveyor schema (Brian-approved junk drop)', () => {
  beforeAll(async () => {
    legacyProjectId = (
      await db.query(`INSERT INTO projects (name, description) VALUES ($1, '053 legacy drop test') RETURNING id`, [LEGACY_PROJ])
    ).rows[0].id;
    newProjectId = (
      await db.query(`INSERT INTO projects (name, description) VALUES ($1, '053 new-data test') RETURNING id`, [NEW_PROJ])
    ).rows[0].id;
    await seedPopulatedLegacySchema();
  });

  afterAll(async () => {
    try {
      await db.query('DELETE FROM projects WHERE id = ANY($1)', [[legacyProjectId, newProjectId]]);
    } catch { /* ignore */ }
    await db.end();
  });

  test('PRECONDITION: the seeded legacy schema is the old denormalized shape AND is populated', async () => {
    // Old-shape signature columns present...
    expect(await columnExists('surveyor_scans', 'clusters')).toBe(true);
    expect(await columnExists('surveyor_scans', 'summary_l0')).toBe(true);
    // ...new-shape columns absent...
    expect(await columnExists('surveyor_scans', 'source_scan_id')).toBe(false);
    expect(await columnExists('surveyor_scans', 'stats')).toBe(false);
    // ...the legacy view exists...
    const v = await db.query(`SELECT to_regclass('public.v_surveyor_scan_summaries') AS v`);
    expect(v.rows[0].v).not.toBeNull();
    // ...and it is populated (mimics prod's 72/7077 at small scale: 3 scans + 12 warnings).
    const s = await db.query('SELECT count(*)::int c FROM surveyor_scans');
    const w = await db.query('SELECT count(*)::int c FROM surveyor_warnings');
    expect(s.rows[0].c).toBe(3);
    expect(w.rows[0].c).toBe(12);
  });

  test('(a) applying 053 DROPS the legacy rows + old shape', async () => {
    await applyMigration053();

    // Old-shape signature columns are GONE (the denormalized table was dropped + recreated).
    expect(await columnExists('surveyor_scans', 'clusters')).toBe(false);
    expect(await columnExists('surveyor_scans', 'summary_l0')).toBe(false);
    expect(await columnExists('surveyor_scans', 'nodes')).toBe(false);
    expect(await columnExists('surveyor_scans', 'connections')).toBe(false);
    // The legacy view is gone.
    const v = await db.query(`SELECT to_regclass('public.v_surveyor_scan_summaries') AS v`);
    expect(v.rows[0].v).toBeNull();
    // The legacy junk rows are gone (table is the fresh normalized one).
    const s = await db.query('SELECT count(*)::int c FROM surveyor_scans');
    expect(s.rows[0].c).toBe(0);
  });

  test('(b) the new normalized schema exists AND is usable (full insert round-trip)', async () => {
    // All 5 normalized tables exist with the new shape.
    const reg = await db.query(
      `SELECT to_regclass('public.surveyor_scans') s,
              to_regclass('public.surveyor_nodes') n,
              to_regclass('public.surveyor_connections') c,
              to_regclass('public.surveyor_warnings') w,
              to_regclass('public.surveyor_function_summaries') f`,
    );
    expect(reg.rows[0].s).not.toBeNull();
    expect(reg.rows[0].n).not.toBeNull();
    expect(reg.rows[0].c).not.toBeNull();
    expect(reg.rows[0].w).not.toBeNull();
    expect(reg.rows[0].f).not.toBeNull();
    expect(await columnExists('surveyor_scans', 'source_scan_id')).toBe(true);
    expect(await columnExists('surveyor_scans', 'stats')).toBe(true);

    // Usable end-to-end: insert a scan + one of each child via the normalized columns.
    const scanId = (
      await db.query(
        `INSERT INTO surveyor_scans (project_id, source_scan_id, project_path, project_name, total_files)
         VALUES ($1, 'new-scan-001', '/new/path', 'new-demo', 1) RETURNING id`,
        [newProjectId],
      )
    ).rows[0].id;
    await db.query(
      `INSERT INTO surveyor_nodes (scan_id, node_key, node_type, name, file_path)
       VALUES ($1, 'file:app', 'file', 'app.ts', 'src/app.ts')`,
      [scanId],
    );
    await db.query(
      `INSERT INTO surveyor_connections (scan_id, connection_key, source_key, target_key, connection_type)
       VALUES ($1, 'c1', 'file:app', 'file:lib', 'import')`,
      [scanId],
    );
    await db.query(
      `INSERT INTO surveyor_warnings (scan_id, warning_key, category, level, title)
       VALUES ($1, 'w1', 'circular_dependency', 'warning', 'cycle')`,
      [scanId],
    );
    await db.query(
      `INSERT INTO surveyor_function_summaries (scan_id, node_key, summary, summary_source)
       VALUES ($1, 'fn:x', 'does a thing', 'ai')`,
      [scanId],
    );

    const round = await db.query('SELECT source_scan_id, project_name FROM surveyor_scans WHERE id=$1', [scanId]);
    expect(round.rows[0].source_scan_id).toBe('new-scan-001');
    expect(round.rows[0].project_name).toBe('new-demo');
    const childCounts = await db.query(
      `SELECT (SELECT count(*)::int FROM surveyor_nodes WHERE scan_id=$1) nodes,
              (SELECT count(*)::int FROM surveyor_connections WHERE scan_id=$1) conns,
              (SELECT count(*)::int FROM surveyor_warnings WHERE scan_id=$1) warns,
              (SELECT count(*)::int FROM surveyor_function_summaries WHERE scan_id=$1) sums`,
      [scanId],
    );
    expect(childCounts.rows[0]).toMatchObject({ nodes: 1, conns: 1, warns: 1, sums: 1 });
  });

  test('(c) re-running 053 on the NEW schema is idempotent + NON-destructive (P4b data survives)', async () => {
    // Capture the normalized data inserted in (b).
    const before = await db.query('SELECT count(*)::int c FROM surveyor_scans');
    const beforeNodes = await db.query('SELECT count(*)::int c FROM surveyor_nodes');
    const beforeWarns = await db.query('SELECT count(*)::int c FROM surveyor_warnings');
    expect(before.rows[0].c).toBe(1);
    expect(beforeNodes.rows[0].c).toBe(1);
    expect(beforeWarns.rows[0].c).toBe(1);

    // Re-apply the SAME migration SQL. No legacy shape is present, so it must drop NOTHING.
    await applyMigration053();

    // Still the normalized shape (no legacy column resurrected).
    expect(await columnExists('surveyor_scans', 'clusters')).toBe(false);
    expect(await columnExists('surveyor_scans', 'source_scan_id')).toBe(true);
    // The previously-inserted normalized data is INTACT — nothing was dropped/lost.
    const after = await db.query('SELECT source_scan_id FROM surveyor_scans');
    expect(after.rowCount).toBe(1);
    expect(after.rows[0].source_scan_id).toBe('new-scan-001');
    const afterNodes = await db.query('SELECT count(*)::int c FROM surveyor_nodes');
    const afterWarns = await db.query('SELECT count(*)::int c FROM surveyor_warnings');
    expect(afterNodes.rows[0].c).toBe(1);
    expect(afterWarns.rows[0].c).toBe(1);
  });
});
