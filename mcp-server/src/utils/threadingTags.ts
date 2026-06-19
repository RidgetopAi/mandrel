/**
 * Threading tag grammar — first-class validation for the record-linking convention.
 *
 * The record-linking model (mandrel-record-linking-convention) threads
 * tasks↔contexts↔decisions into one searchable story using a small, fixed tag
 * grammar. Historically that grammar was a HAND-MAINTAINED convention with no
 * machine validation for the threading prefixes — a typo (`task:9e25` instead of
 * `task:9e25dac7`, `scope:prod` instead of `scope:product`) would silently store a
 * tag that never joins, quietly breaking the thread. `ref:` was made first-class in
 * 4ff5809d (see ./refs.ts); this module extends that exact approach — WARN & NORMALIZE,
 * NEVER reject/drop — to the rest of the threading prefixes so threading is consistent
 * and self-documenting end-to-end.
 *
 * This module is the single source of truth for the THREADING grammar. It is used at
 * the write boundary (context_store) AFTER ref normalization, so a context's tags are
 * validated for BOTH ref grammar and threading grammar in one pass.
 *
 * THE PREFIXES (canonical — mirrors the record-linking convention memory):
 *   task:<id8>        — context belongs to this task's thread (8 lowercase hex).
 *   decision:<id8>    — record ladders up to this decision (8 lowercase hex).
 *   context:<uuid>    — a record points to a context (full UUID).
 *   scope:<value>     — lens axis; value ∈ {company, product}.
 *   owner:<value>     — lens axis; value ∈ {engineering, product, marketing, rnd, accounting}.
 *   tranche:<value>   — build risk class; value ∈ {safe, measured}.
 *
 * DESIGN — warn & normalize, never hard-reject (identical contract to refs.ts):
 *   - We NEVER reject a context_store carrying a malformed threading tag (that would
 *     be a regression against existing callers and could lose a user's content).
 *   - We normalize the salvageable common cases (trim, lowercase) so `Task:9E25DAC7`
 *     becomes `task:9e25dac7`, and RETURN a warning describing what changed or what we
 *     could not fix (e.g. a `task:` id that is not 8 hex, or a `scope:` outside the
 *     known set). Non-threading tags pass through completely untouched.
 *   - An unsalvageable/unknown-value threading tag is kept VERBATIM (never dropped)
 *     and a warning flags it so the caller can see the threading link may not resolve.
 */

import { isRefTag, validateAndNormalizeRefTags } from './refs.js';

/** A short-id threading prefix (`task:`/`decision:`) expects 8 lowercase hex chars. */
const SHORT_ID_PATTERN = /^[0-9a-f]{8}$/;
/** A UUID (canonical 8-4-4-4-12 hex). `context:` expects a full UUID. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Closed value sets for the lens/tranche axes (canonical record-linking convention). */
export const SCOPE_VALUES = ['company', 'product'] as const;
export const OWNER_VALUES = ['engineering', 'product', 'marketing', 'rnd', 'accounting'] as const;
export const TRANCHE_VALUES = ['safe', 'measured'] as const;

/**
 * The threading prefixes this module validates, each with a validator over the value
 * AFTER lowercase-trim normalization. `ref:` is intentionally NOT here — it is owned by
 * refs.ts and validated separately (this module composes with it).
 */
type PrefixSpec = {
  /** The tag prefix including the trailing colon, e.g. `task:`. */
  prefix: string;
  /** A human description of the expected value form, for warnings. */
  expects: string;
  /** True if the (already lowercased+trimmed) value is well-formed. */
  isValid: (value: string) => boolean;
};

const THREADING_PREFIXES: PrefixSpec[] = [
  { prefix: 'task:', expects: '8 lowercase hex (task:<id8>)', isValid: v => SHORT_ID_PATTERN.test(v) },
  { prefix: 'decision:', expects: '8 lowercase hex (decision:<id8>)', isValid: v => SHORT_ID_PATTERN.test(v) },
  { prefix: 'context:', expects: 'a full UUID (context:<uuid>)', isValid: v => UUID_PATTERN.test(v) },
  { prefix: 'scope:', expects: `one of {${SCOPE_VALUES.join(', ')}}`, isValid: v => (SCOPE_VALUES as readonly string[]).includes(v) },
  { prefix: 'owner:', expects: `one of {${OWNER_VALUES.join(', ')}}`, isValid: v => (OWNER_VALUES as readonly string[]).includes(v) },
  { prefix: 'tranche:', expects: `one of {${TRANCHE_VALUES.join(', ')}}`, isValid: v => (TRANCHE_VALUES as readonly string[]).includes(v) },
];

export interface TagValidation {
  /** Tags after normalization (ref + threading tags normalized where possible; others untouched). */
  tags: string[];
  /**
   * Human-readable warnings for ref/threading tags that were normalized or are still
   * invalid. Empty when every recognized tag was already well-formed.
   */
  warnings: string[];
}

/** The threading prefix this tag claims (case-insensitive), or null if it claims none. */
function matchedPrefix(tag: string): PrefixSpec | null {
  const lower = tag.trim().toLowerCase();
  return THREADING_PREFIXES.find(p => lower.startsWith(p.prefix)) ?? null;
}

/** True if the tag claims a known threading prefix (regardless of value validity). */
export function isThreadingTag(tag: string): boolean {
  return matchedPrefix(tag) !== null;
}

/**
 * Validate + normalize ONE threading tag. Returns the (possibly normalized) tag and an
 * optional warning. Normalization is conservative: lowercase + trim only — we never
 * guess a value (e.g. we do NOT try to expand `scope:prod` → `scope:product`), because
 * a wrong guess would corrupt the link silently. A still-invalid value is kept verbatim
 * with a warning.
 */
function normalizeThreadingTag(tag: string, spec: PrefixSpec): { tag: string; warning?: string } {
  const trimmed = tag.trim();
  const rawValue = trimmed.slice(spec.prefix.length);
  const normalizedValue = rawValue.trim().toLowerCase();
  const normalizedTag = `${spec.prefix}${normalizedValue}`;

  if (spec.isValid(normalizedValue)) {
    // Well-formed after the cheap normalization. Warn ONLY if normalization changed
    // the tag (so a clean tag is silent, a case/whitespace fix is reported).
    if (normalizedTag !== trimmed) {
      return {
        tag: normalizedTag,
        warning: `Normalized threading tag "${tag}" → "${normalizedTag}".`,
      };
    }
    return { tag: normalizedTag };
  }

  // Unsalvageable value: keep the normalized (lowercased) form so it is at least
  // canonical-cased, but warn loudly that the link will likely not resolve.
  return {
    tag: normalizedTag,
    warning:
      `Tag "${tag}" uses the "${spec.prefix}" threading prefix but its value is not ` +
      `${spec.expects}; it was stored as "${normalizedTag}" and may not thread correctly.`,
  };
}

/**
 * Validate & normalize a tag array for the FULL linking grammar at the write boundary.
 *
 * Order of operations (composition, not duplication):
 *   1. Ref grammar (ref:<slug>) via refs.ts — unchanged behavior.
 *   2. Threading grammar (task:/decision:/context:/scope:/owner:/tranche:) here.
 *   3. Everything else passes through untouched.
 *
 * NEVER throws, NEVER rejects, NEVER drops a tag — it only normalizes + reports. The
 * combined warnings preserve ref-first ordering.
 */
export function validateAndNormalizeTags(tags: string[] | undefined): TagValidation {
  // 1. Ref grammar first (owned by refs.ts).
  const refResult = validateAndNormalizeRefTags(tags);
  const warnings = [...refResult.warnings];

  // 2. Threading grammar over the ref-normalized tags. A ref tag is never also a
  //    threading tag (distinct prefixes), so this pass leaves ref tags alone.
  const out = refResult.tags.map(tag => {
    if (isRefTag(tag)) return tag; // already handled by refs.ts
    const spec = matchedPrefix(tag);
    if (!spec) return tag; // not a threading tag → untouched
    const { tag: normalized, warning } = normalizeThreadingTag(tag, spec);
    if (warning) warnings.push(warning);
    return normalized;
  });

  return { tags: out, warnings };
}
