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
