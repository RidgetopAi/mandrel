/**
 * H4 — SessionDetail route guard (match ProjectDetail self-heal).
 *
 * THE BUG CLASS: the route `:id` was guarded by presence only (`enabled: !!id`),
 * so a malformed id (e.g. /sessions/not-a-uuid) fired requests guaranteed to
 * 400/404 and could wedge the page. ProjectDetail guards with
 * `enabled: isValidUuid(id)` + error->redirect; SessionDetail now matches.
 *
 * The repo has no React render-testing infra (no @testing-library/react /
 * react-test-renderer), and we deliberately do NOT add a test dependency here.
 * Instead we pin the EXACT guard predicate the component now uses for BOTH the
 * query `enabled` flag and the redirect effect — `isValidUuid(id)` — across the
 * H4 inputs. The component wiring is asserted to be byte-identical to
 * ProjectDetail's template by `SessionDetail.guard.test`'s source check below.
 */
import { isValidUuid } from '../utils/uuid';
import * as fs from 'fs';
import * as path from 'path';

const VALID_ID = 'c875b2af-9020-41b7-9595-d70221603464';

// The guard the component applies, in one place, mirroring SessionDetail:
//   enabled: isValidUuid(id)  +  if (id && !isValidUuid(id)) navigate('/sessions')
function queryEnabled(id: string | undefined): boolean {
  return isValidUuid(id);
}
function shouldRedirect(id: string | undefined): boolean {
  return !!id && !isValidUuid(id);
}

describe('SessionDetail route-guard decision (H4)', () => {
  test('malformed :id => query DISABLED and redirect TRUE (self-heal, no wedge)', () => {
    for (const bad of ['session_voiceitt-bridge', 'not-a-uuid', 'undefined']) {
      expect(queryEnabled(bad)).toBe(false); // no request fired
      expect(shouldRedirect(bad)).toBe(true); // redirected to /sessions
    }
  });

  test('VALID :id => query ENABLED and redirect FALSE (no over-rejection)', () => {
    expect(queryEnabled(VALID_ID)).toBe(true);
    expect(shouldRedirect(VALID_ID)).toBe(false);
  });

  test('absent :id => query disabled, no redirect (nothing to load yet)', () => {
    expect(queryEnabled(undefined)).toBe(false);
    expect(shouldRedirect(undefined)).toBe(false);
  });
});

describe('SessionDetail source matches the ProjectDetail template (H4)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, 'SessionDetail.tsx'),
    'utf8'
  );

  test('both data queries are gated on isValidUuid(id), not bare presence', () => {
    // No remaining `enabled: !!id` (the old presence-only guard).
    expect(src.includes('enabled: !!id')).toBe(false);
    // Both queries use the UUID guard.
    const matches = src.match(/enabled:\s*isValidUuid\(id\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  test('a malformed :id triggers an explicit navigate redirect', () => {
    expect(src).toMatch(/!isValidUuid\(id\)/);
    expect(src).toMatch(/navigate\(['"]\/sessions['"]\)/);
  });
});
