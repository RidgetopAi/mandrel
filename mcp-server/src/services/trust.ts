/**
 * TRUST MODEL v1 — the service (Mandrel Core Redesign T2b, task 20e71fca). THE MOAT.
 *
 * Every recalled record gets a computed trust signal — ranked by DEMONSTRATED reliability
 * (the loop's ground-truth outcomes), not age. This is the differentiator: the STALE
 * benchmark shows the whole field scores <10% at detecting an invalid memory; nobody
 * scores memory by real outcomes. We can, because the Foreman→Inspector→loop pipeline
 * manufactures ground-truth (technical_decisions.outcome_status, set by the GAP1
 * Evaluator), and the T2a typed-edge graph lets us propagate it.
 *
 * TWO LAYERS, on purpose (Lesson 011 — one definition, testable in isolation):
 *   1. computeTrust()  — PURE math. Takes the gathered signals + an injected TrustConfig,
 *                        returns the Trust object. No DB, no clock-of-record-truth — the
 *                        caller passes `now`. This is what the unit tests hammer (outcome
 *                        aggregation, freshness decay at/again half-life, supersession
 *                        override, cold-start→unproven, abstain thresholds, band edges).
 *   2. trustForRecord()/trustForRecords() — gather the signals from the graph + the DB
 *                        (downstream outcomes via edges; created_at; supersession), then
 *                        call computeTrust(). Cheap: per returned result, not the whole DB.
 *
 * GROUND-TRUTH via EDGES (the moat path): a record's outcome is INHERITED from the
 * outcomes of the work it informed. We walk OUT edges of type `informs` / `decided_by` /
 * `learned_from` (the record → the decision/task it fed) and aggregate THEIR outcomes:
 *   - decision.outcome_status: successful=1, mixed=0.5, failed=0; too_early/unknown IGNORED.
 *   - task.status (secondary, when cleanly available): completed=1, cancelled=0.
 * decision.outcome_status is the PRIMARY, reliable signal (it's what the loop scores).
 *
 * SECURITY: every query binds user-derived ids as PARAMETERS — never string-built.
 */

import type { Pool } from 'pg';
import { db } from '../config/database.js';
import { TRUST_CONFIG, type TrustConfig } from '../config/trustConfig.js';
import {
  computeTrust,
  mapDecisionOutcome,
  mapTaskOutcome,
  type OutcomeSample,
  type Trust,
} from './trustModel.js';

// Re-export the pure-math surface so existing import sites (services/trust.js) keep working
// — the pure functions/types now LIVE in trustModel.ts (DB-free, unit-testable in isolation)
// and are re-exported here for ergonomics.
export {
  computeTrust,
  aggregateOutcome,
  freshnessFromAge,
  mapDecisionOutcome,
  mapTaskOutcome,
} from './trustModel.js';
export type { OutcomeSample, TrustSignals, Trust } from './trustModel.js';

// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL GATHERING (DB + graph) — cheap, per returned record.
// ─────────────────────────────────────────────────────────────────────────────

/** The OUT edge types that point a record at the downstream work whose ground-truth
 *  outcome it inherits (the moat path). A record that informs a decision/task, or that a
 *  decision was decided_by / learned_from, ladders up to that record's outcome. */
const OUTCOME_OUT_EDGE_TYPES = ['informs', 'decided_by', 'learned_from'] as const;

/** A record reference (id + kind) the recall handlers already have in hand. */
export interface RecordRef {
  id: string;
  type: 'context' | 'decision' | 'task';
  /**
   * The record's own created/decision date (for freshness). OPTIONAL: when the caller
   * doesn't have it in hand (e.g. smart_search's generic result items), trustForRecord
   * self-fetches it (and a decision's own outcome_status/superseded_by) from the DB. The
   * recall handlers that already have the date SHOULD pass it (one fewer round-trip).
   */
  createdAt?: Date | string;
  /** For a decision record: its own superseded_by column (a direct supersession signal). */
  supersededBy?: string | null;
  /**
   * For a DECISION record: its OWN outcome_status. A decision IS scored directly by the
   * loop (the GAP1 Evaluator sets this), so its own outcome is the strongest ground-truth
   * sample for itself — folded in ALONGSIDE any downstream-inherited outcomes. Ignored
   * (too_early/unknown) values are dropped to null by the mapper, same as downstream.
   * Pass it when the handler already has it in hand (decision_search does); omit otherwise.
   */
  ownOutcomeStatus?: string | null;
}

/**
 * Gather the trust signals for ONE record from the graph + DB, then compute trust.
 *
 * Outcome (moat): walk this record's OUT edges of the outcome types → the downstream
 * decisions/tasks → aggregate THEIR ground-truth (decision.outcome_status primary,
 * task.status secondary). Supersession: a `supersedes` edge pointing AT this record
 * (reverse), OR (for a decision) its own superseded_by column.
 *
 * One round-trip for the outcomes (a join from links → the two outcome tables) and one
 * for supersession; both parameterized + project-agnostic by id (ids are globally unique).
 */
export async function trustForRecord(
  ref: RecordRef,
  config: TrustConfig = TRUST_CONFIG,
  pool: Pool = db
): Promise<Trust> {
  // SELF-FETCH the freshness date (and, for a decision, its own outcome/supersession)
  // when the caller didn't pass them in (smart_search's generic items). The recall
  // handlers that already have createdAt skip this round-trip.
  let createdAt = ref.createdAt;
  let ownOutcomeStatus = ref.ownOutcomeStatus;
  let supersededBy = ref.supersededBy;
  if (createdAt === undefined || (ref.type === 'decision' && ownOutcomeStatus === undefined)) {
    const meta = await fetchRecordMeta(ref.id, ref.type, pool);
    if (createdAt === undefined) createdAt = meta?.createdAt ?? new Date(0); // missing → maximally stale
    if (ref.type === 'decision') {
      if (ownOutcomeStatus === undefined) ownOutcomeStatus = meta?.outcomeStatus ?? null;
      if (supersededBy === undefined || supersededBy === null) supersededBy = meta?.supersededBy ?? null;
    }
  }
  const ageDays = ageInDays(createdAt);

  // ── OUTCOME: downstream decision outcomes (primary) ──────────────────────────
  // Edges: this record → (decision) via informs/decided_by/learned_from. Join to the
  // decision and read its outcome_status. Exclude archived downstream rows (a retired
  // decision is not live ground-truth).
  const decisionOutcomes = (
    await pool.query(
      `SELECT td.outcome_status AS status
         FROM links l
         JOIN technical_decisions td ON td.id = l.to_id
        WHERE l.from_id = $1
          AND l.to_type = 'decision'
          AND l.edge_type = ANY($2)
          AND td.archived_at IS NULL`,
      [ref.id, OUTCOME_OUT_EDGE_TYPES as unknown as string[]]
    )
  ).rows;

  // ── OUTCOME: downstream task completion (secondary) ──────────────────────────
  const taskOutcomes = (
    await pool.query(
      `SELECT t.status AS status
         FROM links l
         JOIN tasks t ON t.id = l.to_id
        WHERE l.from_id = $1
          AND l.to_type = 'task'
          AND l.edge_type = ANY($2)
          AND t.archived_at IS NULL`,
      [ref.id, OUTCOME_OUT_EDGE_TYPES as unknown as string[]]
    )
  ).rows;

  const outcomes: OutcomeSample[] = [
    ...decisionOutcomes.map((r) => ({ value: mapDecisionOutcome(r.status), source: 'decision' as const })),
    ...taskOutcomes.map((r) => ({ value: mapTaskOutcome(r.status), source: 'task' as const })),
  ];

  // A DECISION's OWN outcome_status is direct ground-truth for ITSELF (loop-scored) —
  // fold it in as an outcome sample (too_early/unknown → null → ignored by the mapper).
  if (ref.type === 'decision' && ownOutcomeStatus !== undefined) {
    outcomes.push({ value: mapDecisionOutcome(ownOutcomeStatus), source: 'decision' });
  }

  // ── SUPERSESSION: a `supersedes` edge pointing AT this record (reverse walk) ──
  // i.e. some newer record `supersedes` THIS one → this is to_id of a supersedes edge.
  let superseded = false;
  const supEdge = await pool.query(
    `SELECT 1 FROM links WHERE to_id = $1 AND edge_type = 'supersedes' LIMIT 1`,
    [ref.id]
  );
  if (supEdge.rows.length > 0) superseded = true;
  // A decision also carries its own superseded_by column (the direct signal); honor it.
  if (!superseded && supersededBy) superseded = true;

  // Contradiction detection is deferred to T4 (self-curation). T2b honors the flag if a
  // future pass sets it; nothing sets it now, so it's always false here.
  const contradicted = false;

  return computeTrust({ outcomes, ageDays, superseded, contradicted }, config);
}

/**
 * Gather + compute trust for MANY records (a recall result page). Computed PER returned
 * result (cheap — not the whole DB), preserving input order so the caller can zip it back
 * onto its rows. Each record is independent; one failing must not sink the page — on an
 * unexpected error for a single record we fall back to a conservative cold-start `unproven`
 * (freshness-only) rather than throwing the whole search.
 */
export async function trustForRecords(
  refs: RecordRef[],
  config: TrustConfig = TRUST_CONFIG,
  pool: Pool = db
): Promise<Trust[]> {
  return Promise.all(
    refs.map(async (ref) => {
      try {
        return await trustForRecord(ref, config, pool);
      } catch {
        // Defensive: trust is a SURFACED signal, never a reason to fail recall. Degrade to
        // freshness-only cold-start (the honest "no evidence" default), not distrust. If we
        // don't even have a date, treat as maximally stale (epoch) — honest, not a crash.
        return computeTrust(
          {
            outcomes: [],
            ageDays: ageInDays(ref.createdAt ?? new Date(0)),
            superseded: false,
            contradicted: false,
          },
          config
        );
      }
    })
  );
}

/** Age of a record in days from its created/decision date to now (clamped >= 0). */
function ageInDays(createdAt: Date | string, now: Date = new Date()): number {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const ms = now.getTime() - created.getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24));
}

/** Per-entity metadata for self-fetch (freshness date + decision outcome/supersession). */
interface RecordMeta {
  createdAt: Date | null;
  outcomeStatus?: string | null;
  supersededBy?: string | null;
}

/**
 * Self-fetch a record's freshness date (and, for a decision, its own outcome_status +
 * superseded_by) when the caller didn't pass them. Parameterized; the date column differs
 * per entity (contexts/tasks: created_at; decisions: decision_date). Returns null on a
 * missing/unreadable row so the caller falls back to a conservative default.
 */
async function fetchRecordMeta(
  id: string,
  type: 'context' | 'decision' | 'task',
  pool: Pool
): Promise<RecordMeta | null> {
  try {
    if (type === 'decision') {
      const r = await pool.query(
        `SELECT decision_date AS created_at, outcome_status, superseded_by
           FROM technical_decisions WHERE id = $1`,
        [id]
      );
      if (r.rows.length === 0) return null;
      return {
        createdAt: r.rows[0].created_at ?? null,
        outcomeStatus: r.rows[0].outcome_status ?? null,
        supersededBy: r.rows[0].superseded_by ?? null,
      };
    }
    const table = type === 'task' ? 'tasks' : 'contexts';
    const r = await pool.query(`SELECT created_at FROM ${table} WHERE id = $1`, [id]);
    if (r.rows.length === 0) return null;
    return { createdAt: r.rows[0].created_at ?? null };
  } catch {
    return null;
  }
}
