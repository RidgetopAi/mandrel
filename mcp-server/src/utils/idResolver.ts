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

/** Normalize a short id for the prefix match: lower-case, strip hyphens. */
function normalizeShortId(value: string): string {
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
