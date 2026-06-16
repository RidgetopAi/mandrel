/**
 * UUID helpers (frontend).
 *
 * The backend UUID-validated routes (e.g. GET /projects/:id/insights,
 * /projects/:id/sessions) reject any :id that is not a real UUID with a 400
 * "Bad Request". The ProjectContext can transiently hold a *synthetic* project
 * id (e.g. `aidis-my-project`, produced when a project is loaded from the AIDIS
 * V2 API by name rather than from the real projects list) or the UNASSIGNED
 * sentinel. Calling a UUID-validated endpoint with such an id is what produced
 * the customer-reported "Failed to Load Project Insights — Bad Request".
 *
 * Use `isValidUuid` to gate those calls so the UI never fires a request that is
 * guaranteed to 400, and degrades gracefully instead.
 */

export const UNASSIGNED_PROJECT_ID = '00000000-0000-0000-0000-000000000000';

// RFC 4122 canonical form, case-insensitive. Matches what the backend Zod
// UUIDParamSchema accepts.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True only for a real, non-nil UUID that the backend will accept on a
 * UUID-validated route. The all-zero UNASSIGNED sentinel returns false on
 * purpose: it is not a real selectable project.
 */
export function isValidUuid(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value === UNASSIGNED_PROJECT_ID) return false;
  return UUID_REGEX.test(value);
}

/**
 * localStorage keys the frontend uses to persist the selected project. A
 * customer (dmclark) had a CORRUPT value here — a non-UUID id like
 * `session_voiceitt-bridge` — which then drove `/api/projects/{badid}` and the
 * SSE `projectId`, producing repeated 400s and wedging the dashboard on
 * "No Project Selected". These are the keys we must validate-and-clean on load.
 */
export const PROJECT_STORAGE_KEYS = [
  'aidis_selected_project',
  'aidis_current_project',
] as const;

/**
 * Remove every persisted-project localStorage key. Used to discard a corrupt
 * stored project id so the dashboard self-heals.
 */
export function clearStoredProject(): void {
  for (const key of PROJECT_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Best effort; ignore storage errors.
    }
  }
}

/**
 * Self-heal: read a persisted project object from localStorage and return it
 * ONLY if its id is a real UUID. If the stored value is corrupt (non-UUID id,
 * UNASSIGNED sentinel, unparseable JSON), it is DISCARDED — all offending keys
 * are removed so the next load is clean and the app falls back to the real
 * project list instead of re-firing guaranteed-400 requests. No manual
 * site-data clearing required by the user.
 *
 * Returns the parsed, valid project (as `unknown` for the caller to type) or
 * null if nothing usable was stored.
 */
export function loadValidStoredProject(): unknown | null {
  for (const key of PROJECT_STORAGE_KEYS) {
    let raw: string | null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      // localStorage unavailable (private mode / disabled) — nothing to load.
      return null;
    }
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as { id?: unknown } | null;
      if (parsed && isValidUuid(parsed.id)) {
        return parsed;
      }
    } catch {
      // Unparseable JSON — fall through to treat as corrupt.
    }

    // Stored value exists but is corrupt (bad/no UUID, or bad JSON): purge ALL
    // project keys so a stale value under a sibling key can't re-wedge us.
    clearStoredProject();
    return null;
  }
  return null;
}
