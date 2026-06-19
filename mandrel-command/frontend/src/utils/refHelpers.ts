/**
 * Named-ref (`ref:<slug>`) helpers for the Command UI.
 *
 * Mirrors the backend ref grammar (mcp-server/src/utils/refs.ts): a well-formed ref
 * is `ref:` + a lowercase-alphanumeric, single-hyphen slug. The UI uses this to pick
 * the COPYABLE handle for a context card — the named ref when present (the
 * human-friendly, reusable handle, e.g. "ref:resume"), else the short context id.
 */

/** Canonical ref slug grammar (must match the backend REF_SLUG_PATTERN). */
export const REF_TAG_REGEX = /^ref:[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The first well-formed `ref:<slug>` tag on a context, or undefined. */
export function findRefTag(tags: string[] | undefined): string | undefined {
  return tags?.find((tag) => REF_TAG_REGEX.test(tag));
}

export interface ContextHandleChip {
  /** Short text shown on the chip (the ref handle, or the id prefix). */
  label: string;
  /** Full value copied to clipboard (the ref handle, or the full id). */
  copyText: string;
  /** True when the chip represents a named ref (drives the distinct icon/color). */
  isRef: boolean;
}

/**
 * Decide what the collapsed-card copyable chip shows for a context: the named ref
 * handle when one exists, otherwise the short id prefix (copying the full id).
 */
export function contextHandleChip(tags: string[] | undefined, id: string): ContextHandleChip {
  const refTag = findRefTag(tags);
  if (refTag) {
    return { label: refTag, copyText: refTag, isRef: true };
  }
  return { label: id.slice(0, 8), copyText: id, isRef: false };
}
