/**
 * Persistence for dismissed-finding identities.
 *
 * Dismissals are keyed by the STABLE finding identity (not the per-scan uuid)
 * and persisted to localStorage so a dismissal survives reloads and re-scans.
 * The storage backend is injectable (any `StorageLike`) so the read/write/merge
 * logic is unit-testable without a real DOM.
 */
import { DISMISSED_STORAGE_KEY } from '../../config/findings.config';

/** The slice of the Web Storage API we depend on. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Parse the persisted identity set. Tolerates absent/corrupt data. */
export function loadDismissed(
  storage: StorageLike,
  key: string = DISMISSED_STORAGE_KEY
): Set<string> {
  try {
    const raw = storage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

/** Serialize (sorted for stable output) and persist the identity set. */
export function saveDismissed(
  storage: StorageLike,
  ids: ReadonlySet<string>,
  key: string = DISMISSED_STORAGE_KEY
): void {
  storage.setItem(key, JSON.stringify([...ids].sort()));
}

/** Return a new set with `identity` added (pure — does not mutate input). */
export function withDismissed(
  ids: ReadonlySet<string>,
  identity: string
): Set<string> {
  return new Set(ids).add(identity);
}

/** Return a new set with `identity` removed (pure — does not mutate input). */
export function withoutDismissed(
  ids: ReadonlySet<string>,
  identity: string
): Set<string> {
  const next = new Set(ids);
  next.delete(identity);
  return next;
}

/** Browser default: resolve the real localStorage when available, else null. */
export function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Access can throw (privacy mode / sandboxed iframe).
  }
  return null;
}
