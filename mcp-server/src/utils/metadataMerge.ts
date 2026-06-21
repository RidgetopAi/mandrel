/**
 * METADATA MERGE (Mandrel Core Redesign T1, item 6 — task f54e6cf5).
 *
 * THE FOOTGUN THIS FIXES: today task_update (handlers/tasks.ts) and the others REPLACE
 * the `metadata` jsonb column WHOLESALE — `SET metadata = $n` — so a partial update that
 * only means to set/change ONE key silently DROPS every other key already on the record.
 * For the record-linking model (metadata is the structured back-link channel), that is
 * silent data loss: a re-tag that touches metadata could wipe `parent_task`/`origin_*`.
 *
 * THE FIX: a SHALLOW merge of the incoming keys over the existing object, with an
 * explicit `null` value meaning "delete this key" (the documented escape hatch so a key
 * CAN still be removed deliberately). Centralized here so context_update / task_update /
 * decision_update all share ONE definition and can't drift (Lesson 011: fix the class).
 *
 * SHALLOW by design: nested objects are replaced, not deep-merged — predictable, and
 * matches how the jsonb `||` operator behaves at the top level. The two helpers below let
 * a route either:
 *   - merge in JS (when it already has the existing row), via `mergeMetadata`, or
 *   - merge in SQL atomically (no read-modify-write race), via `metadataMergeSql`.
 */

/**
 * Shallow-merge `incoming` over `existing`, treating an explicit `null` value as a
 * DELETE of that key. Returns a NEW object (never mutates the inputs). A missing key in
 * `incoming` leaves the existing value untouched (that's the whole point — no silent
 * drop). `existing`/`incoming` default to {} so callers can pass undefined safely.
 */
export function mergeMetadata(
  existing: Record<string, any> | null | undefined,
  incoming: Record<string, any> | null | undefined,
): Record<string, any> {
  const out: Record<string, any> = { ...(existing ?? {}) };
  if (incoming) {
    for (const [k, v] of Object.entries(incoming)) {
      if (v === null) {
        delete out[k]; // explicit null → delete the key (documented escape hatch)
      } else {
        out[k] = v; // shallow set/overwrite
      }
    }
  }
  return out;
}

/**
 * Build the SQL fragment + the single bound param value that performs the same shallow
 * merge ATOMICALLY in Postgres, so the route never has to read-modify-write (no lost
 * update under concurrency). The expression:
 *
 *   COALESCE(metadata, '{}'::jsonb) || $n::jsonb            -- shallow merge incoming over existing
 *   then strips any key whose incoming value is JSON null   -- null → delete the key
 *
 * Postgres' `||` already replaces overlapping top-level keys and ADDS new ones while
 * KEEPING the untouched ones — exactly the shallow-merge semantics. To honor "null
 * deletes a key" we additionally remove, via the `-` (jsonb minus text[]) operator, every
 * key the caller explicitly set to null. The merge value is bound as ONE jsonb param
 * (parameterized — never concatenated). `column` is the metadata column name (a trusted
 * literal supplied by the calling handler, NOT user input).
 *
 * @param column   the jsonb column being merged (e.g. 'metadata') — trusted identifier
 * @param paramIdx the 1-based positional param index for the merge object
 * @param incoming the incoming metadata object (may contain nulls to delete keys)
 * @returns { expr, value } — `expr` goes in the SET clause, `value` is pushed as $paramIdx
 */
export function metadataMergeSql(
  column: string,
  paramIdx: number,
  incoming: Record<string, any>,
): { expr: string; value: string } {
  // Keys explicitly set to null are removed AFTER the merge. Emitted as a literal
  // text[] of the null-valued keys (each key is a JSON-encoded string literal, so a
  // weird key name can't break out — `JSON.stringify` quotes/escapes it). Empty list →
  // no `-` step. This is built from the SAME incoming object that is bound as the merge
  // param, so it stays consistent.
  const nullKeys = Object.entries(incoming)
    .filter(([, v]) => v === null)
    .map(([k]) => k);

  let expr = `COALESCE(${column}, '{}'::jsonb) || $${paramIdx}::jsonb`;
  if (nullKeys.length > 0) {
    // ARRAY[...]::text[] of the keys to delete; each key safely JSON-quoted.
    const arr = `ARRAY[${nullKeys.map((k) => `'${k.replace(/'/g, "''")}'`).join(',')}]::text[]`;
    expr = `(${expr}) - ${arr}`;
  }
  // The bound value: the full incoming object (nulls included — `||` will set them to
  // JSON null first, then the `-` strips those keys). Stringify once for the jsonb cast.
  return { expr, value: JSON.stringify(incoming) };
}
