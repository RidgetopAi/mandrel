/**
 * SHORT-ID RESOLUTION (task 131ef054).
 *
 * THE CLASS THIS FIXES: every tool's output DISPLAYS the full UUID, but agents and
 * humans routinely reference a record by its leading 8-hex-char prefix (the "short id"
 * — the form Mandrel task/decision references use, e.g. `131ef054`). The id-taking
 * mutate/detail tools (task_update, task_details, decision_update, decision_get) used
 * to require a full UUID and reject that prefix, so a tool-only agent literally could
 * not resolve a short id → full UUID through the public tool surface. This module
 * resolves a short id to its full UUID SERVER-SIDE, scoped to the current project where
 * the table is project-scoped (so a prefix is far less likely to collide and we never
 * resolve across tenants/projects).
 *
 * SECURITY (non-negotiable): the user input is NEVER string-concatenated into SQL. The
 * prefix match binds the input as a PARAMETER (`WHERE id::text LIKE $1 || '%'` with $1
 * bound) and the input is shape-validated (hex/uuid only) at the zod layer before it
 * ever reaches here. The actionable errors below never leak SQL, paths, or secrets —
 * only the field/id and (for ambiguity) the candidate full ids + a human-pickable label.
 *
 * THREE-CASE CONTRACT (see resolveShortId):
 *   exactly 1 match → return the full id.
 *   0 matches       → throw IdNotFoundError (actionable not-found).
 *   >1 match        → throw AmbiguousIdError listing the candidate full ids (NEVER pick).
 *
 * Full UUIDs short-circuit: a syntactically full UUID is returned as-is (back-compat,
 * canonical form) WITHOUT a DB round-trip — existence is enforced downstream exactly as
 * it was before this change.
 */

import type { Pool } from 'pg';
import { db } from '../config/database.js';
import {
  SEARCH_ID_PREFIX_MIN_LENGTH,
  SEARCH_ID_MAX_CANDIDATES,
} from '../config/searchConfig.js';

/**
 * Minimum length of a short id we will resolve. A UUID's leading hex is highly
 * collision-resistant at 8 chars (32 bits of prefix entropy) AND scoping to a single
 * project shrinks the candidate set to that project's rows — together this makes an
 * accidental collision vanishingly unlikely while still accepting the 8-char form every
 * tool reference uses. Shorter prefixes (which WOULD collide) are rejected at the zod
 * layer, never reaching the resolver.
 */
export const MIN_SHORT_ID_LENGTH = 8;

/** Full canonical UUID (8-4-4-4-12 hex). */
const FULL_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the value is a syntactically complete canonical UUID. */
export function isFullUuid(value: string): boolean {
  return FULL_UUID_RE.test(value);
}

/**
 * True when the value is acceptable as an id field: a full UUID OR an 8+-hex short id
 * (hyphens allowed, mirroring a copied UUID prefix). Non-hex garbage is false. This is
 * the predicate the zod refinement uses so the SHAPE is validated even though the field
 * is no longer full-uuid-only.
 */
export function isUuidOrShortId(value: string): boolean {
  if (typeof value !== 'string') return false;
  if (isFullUuid(value)) return true;
  // Strip hyphens for the length/hex check so `131ef054` and `13-1e-f0-54...` both pass,
  // but reject anything containing a non-hex char.
  const hexOnly = value.replace(/-/g, '');
  return hexOnly.length >= MIN_SHORT_ID_LENGTH && /^[0-9a-f]+$/i.test(hexOnly);
}

/**
 * Normalize a short id for the prefix match: lower-case, strip hyphens.
 *
 * EXPORTED (task f29bbd44) so the SEARCH id-prefix predicate reuses the SAME
 * normalization the resolver uses (no second, drifting copy — lesson 011). A user
 * pasting a dashed partial (`0f3906cd-db79`) and a bare hex prefix (`0f3906cddb79`)
 * must normalize identically on BOTH the resolve path and the search path.
 */
export function normalizeShortId(value: string): string {
  return value.replace(/-/g, '').toLowerCase();
}

/** A candidate row surfaced when a short-id prefix is ambiguous. */
export interface IdCandidate {
  id: string;
  /** A human-pickable label (task title / decision title+type) so the caller can choose. */
  label: string;
}

/** Thrown when a short-id prefix matches MORE THAN ONE row (do NOT silently pick). */
export class AmbiguousIdError extends Error {
  readonly candidates: IdCandidate[];
  readonly shortId: string;
  constructor(shortId: string, candidates: IdCandidate[]) {
    super(`Short id "${shortId}" is ambiguous (${candidates.length} matches)`);
    this.name = 'AmbiguousIdError';
    this.shortId = shortId;
    this.candidates = candidates;
  }
}

/** Thrown when a short-id prefix matches NO row. */
export class IdNotFoundError extends Error {
  readonly shortId: string;
  constructor(shortId: string) {
    super(`Short id "${shortId}" matched no record`);
    this.name = 'IdNotFoundError';
    this.shortId = shortId;
  }
}

/** What kind of record we're resolving — selects the table + label columns. */
export type ResolvableEntity = 'task' | 'decision' | 'context';

interface EntityConfig {
  table: string;
  /** Build the human label for an ambiguity candidate row. */
  label: (row: any) => string;
  /** Extra SELECT columns needed to build the label. */
  labelColumns: string[];
}

const ENTITY_CONFIG: Record<ResolvableEntity, EntityConfig> = {
  task: {
    table: 'tasks',
    labelColumns: ['title', 'status', 'type'],
    label: (r) => `"${r.title}" (${r.type}/${r.status})`,
  },
  decision: {
    table: 'technical_decisions',
    labelColumns: ['title', 'decision_type'],
    label: (r) => `"${r.title}" (${r.decision_type})`,
  },
  context: {
    table: 'contexts',
    // Contexts have no title — use the context_type + a short content snippet so an
    // ambiguity candidate is still human-pickable.
    labelColumns: ['context_type', 'content'],
    label: (r) =>
      `${r.context_type}: "${String(r.content ?? '').replace(/\s+/g, ' ').slice(0, 60)}…"`,
  },
};

/**
 * Resolve an id field to a full UUID.
 *
 *  - Full UUID input → returned unchanged (no DB round-trip; existence enforced
 *    downstream exactly as before).
 *  - Short id input  → parameterized prefix match (`id::text LIKE $1 || '%'`), scoped to
 *    `projectId` when provided (project-scoped tables), yielding the three-case contract.
 *
 * @param entity     which table to resolve against
 * @param rawId      the user-provided id (already zod shape-validated)
 * @param projectId  scope the prefix match to this project (recommended for project-
 *                   scoped tables); omit to resolve across all rows (e.g. decision_get,
 *                   which is intentionally cross-project)
 * @param pool       pg pool (defaults to the shared db; injectable for tests)
 */
export async function resolveEntityId(
  entity: ResolvableEntity,
  rawId: string,
  projectId?: string,
  pool: Pool = db,
): Promise<string> {
  // Full UUID: canonical form, pass straight through (back-compat).
  if (isFullUuid(rawId)) return rawId;

  const cfg = ENTITY_CONFIG[entity];
  const shortId = normalizeShortId(rawId);

  // Parameterized prefix match. $1 is BOUND (never concatenated). LIKE '<prefix>%' on the
  // text form of the uuid. Scope to project when given. Cap the result set so an absurd
  // prefix can't pull unbounded rows; >1 already means ambiguous.
  const params: any[] = [shortId];
  let sql =
    `SELECT id::text AS id, ${cfg.labelColumns.join(', ')} ` +
    `FROM ${cfg.table} WHERE id::text LIKE $1 || '%'`;
  if (projectId) {
    params.push(projectId);
    sql += ` AND project_id = $${params.length}`;
  }
  sql += ` LIMIT 25`;

  const result = await pool.query(sql, params);

  if (result.rows.length === 0) {
    throw new IdNotFoundError(rawId);
  }
  if (result.rows.length === 1) {
    return result.rows[0].id;
  }
  // >1 → ambiguous. Surface the candidate FULL ids + labels; never pick one.
  const candidates: IdCandidate[] = result.rows.map((r) => ({
    id: r.id,
    label: cfg.label(r),
  }));
  throw new AmbiguousIdError(rawId, candidates);
}

/**
 * Render an AmbiguousIdError into an actionable, user-facing message: the candidate FULL
 * ids + labels, and an instruction to re-call with the full id. Safe (no SQL/paths).
 */
export function ambiguousIdMessage(err: AmbiguousIdError, toolName: string): string {
  const list = err.candidates
    .map((c, i) => `   ${i + 1}. ${c.id}  — ${c.label}`)
    .join('\n');
  return (
    `❌ Ambiguous short id: "${err.shortId}" matches ${err.candidates.length} records.\n\n` +
    `${list}\n\n` +
    `💡 Re-run ${toolName} with the FULL id of the one you mean (copy it from the list above).`
  );
}

/**
 * CENTRALIZED short-id error → McpResponse (task 7b28bed4). The delete/restore routes
 * all need the SAME two branches the existing mutate routes hand-roll (Ambiguous → list
 * candidates, no mutation; NotFound → actionable not-found pointing at the find tool).
 * Factoring it here means the soft-delete tools can't drift from the established
 * actionable-error contract (Lesson 011: one definition, not N copies). Returns an
 * McpResponse to return, or `null` if `err` is neither id-error (caller rethrows).
 *
 * @param err       the thrown error
 * @param toolName  the tool name (for the ambiguous-message re-run hint)
 * @param entity    human label for the not-found message ('task'|'decision'|'context')
 * @param rawId     the user-supplied id (echoed in not-found)
 * @param findTool  the tool that lists ids (pointed at in not-found, e.g. 'task_list')
 */
export function idErrorResponse(
  err: unknown,
  toolName: string,
  entity: string,
  rawId: string,
  findTool: string,
): any | null {
  if (err instanceof AmbiguousIdError) {
    return {
      content: [{ type: 'text', text: ambiguousIdMessage(err, toolName) }],
      isError: true,
      structuredContent: { ok: false, ambiguous: true, candidates: err.candidates.map((c) => c.id) },
    };
  }
  if (err instanceof IdNotFoundError) {
    const cap = entity.charAt(0).toUpperCase() + entity.slice(1);
    return {
      content: [{
        type: 'text',
        text: `❌ ${cap} not found: ${rawId}\n\n` +
              `💡 The id may be wrong. Use ${findTool} to find the ${entity} and copy its 🆔 ID.`,
      }],
      isError: true,
      structuredContent: { ok: false, found: false },
    };
  }
  return null;
}

/**
 * SEARCH id-prefix + partial-tag matching (task f29bbd44 — the part-2 class-fix).
 *
 * THE CLASS THIS FIXES: a search box (the Command UI Decisions view → decision_search,
 * and the MCP tool itself) sends the typed text as the free-text `query`. Before this,
 * a query that is a bare id (full UUID or hex prefix) matched nothing — search only
 * looked at prose — and a partial tag like `ref:` missed because tag filtering used an
 * EXACT `tags && [..]` / `= ANY` match. This helper builds the additive predicate that
 * makes a bare-id query reach the EXACT record and a partial tag match by substring.
 *
 * It is the SEARCH sibling of resolveEntityId: same id contract (full UUID short-circuit;
 * else a PARAMETERIZED prefix match against the dash-stripped `id::text`), same
 * normalization (normalizeShortId, reused — not re-implemented), same floor/cap config
 * (config/searchConfig). The difference: search ADMITS many matches and returns a result
 * set; the resolver demands exactly one. There is no second id-resolver here — this reuses
 * the in-package primitives (lesson 011: centralize, don't drift N copies).
 *
 * SECURITY: every value is a BOUND parameter. The id prefix and the tag substring are
 * pushed as params ($n); nothing is concatenated into SQL. LIKE metacharacters can't be
 * injected via the id path (the prefix is normalized to hex only); the tag substring is a
 * plain ILIKE pattern with its own bound value.
 */

/** A hex id-prefix the user typed: hex + optional dashes (a pasted partial UUID). */
const HEX_PREFIX_RE = /^[0-9a-f-]+$/i;

/**
 * Does this query look like an id-prefix lookup (full UUID, or a long-enough hex prefix)?
 * Length is measured on the DASH-STRIPPED hex so a dashed partial is judged by its real
 * hex length against SEARCH_ID_PREFIX_MIN_LENGTH.
 */
export function queryLooksLikeId(query: string): boolean {
  const q = query.trim();
  if (isFullUuid(q)) return true;
  if (!HEX_PREFIX_RE.test(q)) return false;
  return normalizeShortId(q).length >= SEARCH_ID_PREFIX_MIN_LENGTH;
}

/**
 * Is this query a bare hex PREFIX (not a full UUID) long enough to be an id-lookup? Such a
 * query is "ambiguous" by nature (it can match many ids) so callers cap its page at
 * SEARCH_ID_MAX_CANDIDATES via capSearchLimit.
 */
export function queryIsAmbiguousIdPrefix(query: string): boolean {
  const q = query.trim();
  return (
    !isFullUuid(q) &&
    HEX_PREFIX_RE.test(q) &&
    normalizeShortId(q).length >= SEARCH_ID_PREFIX_MIN_LENGTH
  );
}

/**
 * Cap the effective page limit for an ambiguous id-prefix query so an absurdly short
 * prefix can never pull unbounded rows. Non-id-prefix queries keep the requested limit.
 */
export function capSearchLimit(query: string | undefined, requestedLimit: number): number {
  if (query && queryIsAmbiguousIdPrefix(query)) {
    return Math.min(requestedLimit, SEARCH_ID_MAX_CANDIDATES);
  }
  return requestedLimit;
}

/** A built OR-predicate fragment + its bound params + the next free $n index. */
export interface SearchMatchClause {
  /** SQL fragment, parenthesized, WITHOUT a leading AND/OR — e.g. "(a OR b)". */
  sql: string;
  /** Parameters to push in order, matching the $n placeholders in `sql`. */
  params: any[];
  /** Next free $n parameter index after this clause's placeholders. */
  nextParamIndex: number;
}

export interface BuildSearchMatchOptions {
  /** The row id column expression (e.g. "id"). */
  idColumn: string;
  /** The text[] tags column expression (e.g. "tags"). */
  tagsColumn: string;
}

/**
 * Build the ADDITIVE id-prefix + partial-tag OR-predicate for a free-text `query`.
 *
 * Returns null when the query is empty / a wildcard (`*`) — the caller keeps its existing
 * behavior untouched (no regression). Otherwise returns an OR of:
 *   - id-lookup (ONLY when queryLooksLikeId): parameterized prefix match against the
 *     dash-stripped `id::text` — `REPLACE(<id>::text,'-','') LIKE $n || '%'`, $n bound to
 *     the normalized prefix. A full UUID is just the maximal prefix → exact match.
 *   - partial-tag: case-insensitive SUBSTRING against any element of the tags[] array.
 *
 * @param query       the raw user search string
 * @param startIndex  the next free $n parameter index in the caller's query
 * @param opts        column wiring
 */
export function buildSearchMatchPredicate(
  query: string | undefined,
  startIndex: number,
  opts: BuildSearchMatchOptions,
): SearchMatchClause | null {
  const q = (query ?? '').trim();
  if (!q || q === '*') return null;

  const ors: string[] = [];
  const params: any[] = [];
  let i = startIndex;

  // id-lookup — only when the query plausibly IS an id (full UUID or long-enough hex
  // prefix). Parameterized prefix match against the dash-stripped text form of the id,
  // exactly like resolveEntityId. $n is BOUND, never concatenated.
  if (queryLooksLikeId(q)) {
    const idx = i++;
    ors.push(`REPLACE(${opts.idColumn}::text, '-', '') LIKE $${idx} || '%'`);
    params.push(normalizeShortId(q));
  }

  // partial-tag — case-insensitive substring against any tag element. Replaces the old
  // exact `tags && [..]` so a partial tag (`ref:`, `bucket`) matches a tag CONTAINING it.
  {
    const idx = i++;
    ors.push(
      `EXISTS (SELECT 1 FROM unnest(${opts.tagsColumn}) AS _tag WHERE _tag ILIKE $${idx})`,
    );
    params.push(`%${q}%`);
  }

  return { sql: `(${ors.join(' OR ')})`, params, nextParamIndex: i };
}
