import {
  parseAidisProjectName,
  resolveRealProject,
  selectFallbackProject,
} from './projectResolution';
import { isValidUuid } from '../utils/uuid';
import type { Project } from '../types/project';
import type { Session } from '../types/session';

/**
 * Guard test for task 309dd3af — the "aidis-**pi-ridgey**" default-project bug.
 *
 * Root cause: MCP `project_current` returns the name in markdown bold
 * (`Current Project: **pi-ridgey**`). The old UI captured `**pi-ridgey**`
 * verbatim, failed to match the real project list, and fell into a synthetic
 * branch that built id `aidis-**pi-ridgey**` and early-returned. The AntD
 * <Select> echoed that unmatched value literally AND the non-UUID id 400'd every
 * UUID-validated backend route ("Failed to load contexts").
 *
 * These tests assert the two halves of the fix:
 *   1. STRIP THE MARKDOWN — `**pi-ridgey**` resolves to the REAL pi-ridgey UUID.
 *   2. THE SAFEGUARD — an unresolvable name falls back to a REAL-UUID project,
 *      never a synthetic `aidis-<name>` id.
 * And the INVARIANT: every project these helpers return has a real UUID.
 */

const PI_RIDGEY_UUID = '11111111-2222-4333-8444-555555555555';
const OTHER_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const NEWEST_UUID = '99999999-8888-4777-8666-555544443333';
const UNASSIGNED_PROJECT_ID = '00000000-0000-0000-0000-000000000000';

const piRidgey: Project = {
  id: PI_RIDGEY_UUID,
  name: 'pi-ridgey',
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  last_activity: '2026-06-01T00:00:00.000Z',
};

const otherProject: Project = {
  id: OTHER_UUID,
  name: 'some-other-project',
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  last_activity: '2026-05-01T00:00:00.000Z',
};

const newestProject: Project = {
  id: NEWEST_UUID,
  name: 'most-recently-touched',
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  last_activity: '2026-06-18T00:00:00.000Z', // newest by last_activity
};

const unassigned: Project = {
  id: UNASSIGNED_PROJECT_ID,
  name: 'unassigned',
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const allProjects: Project[] = [unassigned, otherProject, piRidgey, newestProject];

// The exact text the MCP project_current route emits (mcp-server project.routes.ts).
const PROJECT_CURRENT_TEXT =
  '🟢 Current Project: **pi-ridgey**\n\n' +
  '📄 Description: the pi\n' +
  '📊 Status: active\n' +
  '📈 Contexts: 12\n' +
  '⏰ Last Updated: 2026-06-18\n\n' +
  '🔄 Switch projects with: project_switch <name-or-id>';

const AUTO_SELECTED_TEXT =
  '🟢 Current Project: **pi-ridgey** (auto-selected)\n\n' +
  '📄 Description: the pi\n📊 Status: active';

describe('parseAidisProjectName — strips markdown bold from project_current', () => {
  test('captures the REAL name without the ** markers', () => {
    expect(parseAidisProjectName(PROJECT_CURRENT_TEXT)).toBe('pi-ridgey');
  });

  test('strips the (auto-selected) annotation too', () => {
    expect(parseAidisProjectName(AUTO_SELECTED_TEXT)).toBe('pi-ridgey');
  });

  test('returns null for None / unassigned / empty', () => {
    expect(parseAidisProjectName('Current Project: None')).toBeNull();
    expect(parseAidisProjectName('Current Project: unassigned')).toBeNull();
    expect(parseAidisProjectName('no project here')).toBeNull();
    expect(parseAidisProjectName('')).toBeNull();
    expect(parseAidisProjectName(null)).toBeNull();
  });

  test('REGRESSION: the OLD raw capture (no strip) would NOT have matched', () => {
    // Demonstrates the bug: the literal regex capture before sanitizing.
    const rawCapture = PROJECT_CURRENT_TEXT.match(/Current project:\s*([^\n]+)/i)![1].trim();
    expect(rawCapture).toBe('**pi-ridgey**'); // <- what the old code resolved against
    // ...which finds nothing in the real list (this is what triggered synthetic).
    expect(allProjects.find((p) => p.name === rawCapture)).toBeUndefined();
    // The new sanitized name DOES resolve.
    expect(allProjects.find((p) => p.name === parseAidisProjectName(PROJECT_CURRENT_TEXT))).toBe(
      piRidgey
    );
  });
});

describe('resolveRealProject — (a) resolves a sanitized name to the REAL UUID', () => {
  test('given **pi-ridgey** text, currentProject resolves to the REAL project UUID', () => {
    const name = parseAidisProjectName(PROJECT_CURRENT_TEXT);
    const resolved = resolveRealProject(name, allProjects);
    expect(resolved).not.toBeNull();
    expect(resolved!.id).toBe(PI_RIDGEY_UUID);
    // The bug value must NEVER be produced.
    expect(resolved!.id).not.toBe('aidis-**pi-ridgey**');
    expect(resolved!.id).not.toMatch(/^aidis-/);
    // INVARIANT: id is a real UUID.
    expect(isValidUuid(resolved!.id)).toBe(true);
  });

  test('never resolves to the UNASSIGNED sentinel', () => {
    expect(resolveRealProject('unassigned', allProjects)).toBeNull();
  });

  test('returns null for an unresolvable name (caller must fall back)', () => {
    expect(resolveRealProject('ghost-project', allProjects)).toBeNull();
    expect(resolveRealProject('**pi-ridgey**', allProjects)).toBeNull(); // un-stripped never matches
  });
});

describe('selectFallbackProject — (b) unresolvable name falls back to a REAL-UUID project', () => {
  const noSessions: Session[] = [];

  test('returns a real-UUID project (never a synthetic id) when name is unresolvable', () => {
    const fallback = selectFallbackProject(allProjects, noSessions);
    expect(fallback).not.toBeNull();
    expect(isValidUuid(fallback!.id)).toBe(true); // INVARIANT
    expect(fallback!.id).not.toMatch(/^aidis-/);
    expect(fallback!.id).not.toBe(UNASSIGNED_PROJECT_ID);
  });

  test('priority (a) last-active: picks the most-recent valid session\'s project', () => {
    const sessions: Session[] = [
      {
        id: 's-old',
        project_id: NEWEST_UUID,
        project_name: 'most-recently-touched',
        created_at: '2026-02-01T00:00:00.000Z',
        updated_at: '2026-02-01T00:00:00.000Z',
        last_activity_at: '2026-02-01T00:00:00.000Z',
      } as Session,
      {
        id: 's-new',
        project_id: OTHER_UUID,
        project_name: 'some-other-project',
        created_at: '2026-06-10T00:00:00.000Z',
        updated_at: '2026-06-10T00:00:00.000Z',
        last_activity_at: '2026-06-15T00:00:00.000Z', // most recent session
      } as Session,
    ];
    const fallback = selectFallbackProject(allProjects, sessions);
    expect(fallback!.id).toBe(OTHER_UUID); // from the most-recent session
    expect(isValidUuid(fallback!.id)).toBe(true);
  });

  test('priority (b) most-recently-updated: sorts by last_activity when no sessions', () => {
    const fallback = selectFallbackProject(allProjects, noSessions);
    // newestProject has the latest last_activity (2026-06-18).
    expect(fallback!.id).toBe(NEWEST_UUID);
  });

  test('a session pointing at a synthetic/unassigned id is ignored (invariant holds)', () => {
    const badSessions: Session[] = [
      {
        id: 's-bad',
        project_id: 'aidis-pi-ridgey', // synthetic, not a UUID
        project_name: 'pi-ridgey',
        created_at: '2026-06-19T00:00:00.000Z',
        updated_at: '2026-06-19T00:00:00.000Z',
        last_activity_at: '2026-06-19T00:00:00.000Z',
      } as Session,
      {
        id: 's-unassigned',
        project_id: UNASSIGNED_PROJECT_ID,
        project_name: 'unassigned',
        created_at: '2026-06-19T00:00:00.000Z',
        updated_at: '2026-06-19T00:00:00.000Z',
        last_activity_at: '2026-06-19T00:00:00.000Z',
      } as Session,
    ];
    const fallback = selectFallbackProject(allProjects, badSessions);
    // Falls through to last_activity sort -> newestProject; never the synthetic id.
    expect(fallback!.id).toBe(NEWEST_UUID);
    expect(isValidUuid(fallback!.id)).toBe(true);
  });

  test('user preference (defaultProject) wins when it resolves to a real project', () => {
    const fallback = selectFallbackProject(allProjects, noSessions, 'pi-ridgey');
    expect(fallback!.id).toBe(PI_RIDGEY_UUID);
  });

  test('returns null when no real-UUID project exists (only unassigned)', () => {
    expect(selectFallbackProject([unassigned], noSessions)).toBeNull();
  });
});

describe('END-TO-END invariant: currentProject.id is ALWAYS a real UUID', () => {
  const noSessions: Session[] = [];

  test('(a) resolvable **pi-ridgey** -> real UUID, NOT aidis-**pi-ridgey**', () => {
    const name = parseAidisProjectName(PROJECT_CURRENT_TEXT);
    const resolved = resolveRealProject(name, allProjects);
    const chosen = resolved ?? selectFallbackProject(allProjects, noSessions);
    expect(chosen!.id).toBe(PI_RIDGEY_UUID);
    expect(isValidUuid(chosen!.id)).toBe(true);
  });

  test('(b) unresolvable name -> fallback real UUID, never synthetic', () => {
    const name = parseAidisProjectName('🟢 Current Project: **ghost-that-does-not-exist**\n');
    const resolved = resolveRealProject(name, allProjects);
    const chosen = resolved ?? selectFallbackProject(allProjects, noSessions);
    expect(chosen).not.toBeNull();
    expect(isValidUuid(chosen!.id)).toBe(true);
    expect(chosen!.id).not.toMatch(/^aidis-/);
  });
});
