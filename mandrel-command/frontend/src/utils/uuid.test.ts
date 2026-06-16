import {
  isValidUuid,
  UNASSIGNED_PROJECT_ID,
  PROJECT_STORAGE_KEYS,
  loadValidStoredProject,
  clearStoredProject,
} from './uuid';

/**
 * Guard test for the customer-reported "Failed to Load Project Insights — Bad
 * Request". isValidUuid is the gate that stops the UI from calling UUID-validated
 * backend routes (insights/sessions/etc.) with an id that would 400.
 */
describe('isValidUuid', () => {
  test('accepts a real canonical UUID (any case)', () => {
    expect(isValidUuid('11111111-2222-4333-8444-555555555555')).toBe(true);
    expect(isValidUuid('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(true);
  });

  test('rejects the UNASSIGNED / nil sentinel', () => {
    // The backend Zod uuid() would ACCEPT this, so the frontend MUST reject it
    // — this is the load-bearing half of the Bug B fix.
    expect(isValidUuid(UNASSIGNED_PROJECT_ID)).toBe(false);
    expect(isValidUuid('00000000-0000-0000-0000-000000000000')).toBe(false);
  });

  test('rejects synthetic aidis-<name> ids (the actual root cause)', () => {
    expect(isValidUuid('aidis-my-project')).toBe(false);
    expect(isValidUuid('aidis-personal-project')).toBe(false);
  });

  test('rejects undefined / null / non-string / empty / garbage', () => {
    expect(isValidUuid(undefined)).toBe(false);
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid('')).toBe(false);
    expect(isValidUuid('undefined')).toBe(false);
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid(12345)).toBe(false);
    expect(isValidUuid({})).toBe(false);
  });

  test('rejects the dmclark corrupt id `session_voiceitt-bridge`', () => {
    // The exact client-side value that drove /api/projects/{badid} and the SSE
    // projectId into repeated 400s on the customer dashboard.
    expect(isValidUuid('session_voiceitt-bridge')).toBe(false);
  });
});

/**
 * Self-heal guards (dmclark dashboard bug). A corrupt persisted project id like
 * `session_voiceitt-bridge` must be DISCARDED on load — not returned for use —
 * and the offending localStorage keys purged so the app recovers on its own.
 */
describe('loadValidStoredProject / clearStoredProject (self-heal)', () => {
  const VALID_PROJECT = {
    id: 'c875b2af-9020-41b7-9595-d70221603464', // dmclark's real voiceitt-bridge UUID
    name: 'voiceitt-bridge',
  };

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('returns a stored project when its id is a real UUID', () => {
    localStorage.setItem('aidis_selected_project', JSON.stringify(VALID_PROJECT));
    const loaded = loadValidStoredProject() as { id: string; name: string } | null;
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(VALID_PROJECT.id);
    // Valid value is preserved, not purged.
    expect(localStorage.getItem('aidis_selected_project')).not.toBeNull();
  });

  test('discards a corrupt `session_voiceitt-bridge` id and PURGES all keys', () => {
    const corrupt = JSON.stringify({ id: 'session_voiceitt-bridge', name: 'voiceitt-bridge' });
    localStorage.setItem('aidis_selected_project', corrupt);
    localStorage.setItem('aidis_current_project', corrupt);

    const loaded = loadValidStoredProject();

    // The bad value is NOT returned for use...
    expect(loaded).toBeNull();
    // ...and BOTH project keys are cleared so the dashboard self-heals with no
    // manual site-data clearing.
    for (const key of PROJECT_STORAGE_KEYS) {
      expect(localStorage.getItem(key)).toBeNull();
    }
  });

  test('discards the UNASSIGNED sentinel id and purges', () => {
    localStorage.setItem(
      'aidis_selected_project',
      JSON.stringify({ id: UNASSIGNED_PROJECT_ID, name: 'unassigned' })
    );
    expect(loadValidStoredProject()).toBeNull();
    expect(localStorage.getItem('aidis_selected_project')).toBeNull();
  });

  test('discards unparseable JSON and purges', () => {
    localStorage.setItem('aidis_selected_project', '{not valid json');
    expect(loadValidStoredProject()).toBeNull();
    expect(localStorage.getItem('aidis_selected_project')).toBeNull();
  });

  test('falls through (returns null) when nothing is stored', () => {
    expect(loadValidStoredProject()).toBeNull();
  });

  test('falls back to the legacy key when the primary key is empty', () => {
    localStorage.setItem('aidis_current_project', JSON.stringify(VALID_PROJECT));
    const loaded = loadValidStoredProject() as { id: string } | null;
    expect(loaded!.id).toBe(VALID_PROJECT.id);
  });

  test('clearStoredProject removes every project key', () => {
    for (const key of PROJECT_STORAGE_KEYS) {
      localStorage.setItem(key, JSON.stringify(VALID_PROJECT));
    }
    clearStoredProject();
    for (const key of PROJECT_STORAGE_KEYS) {
      expect(localStorage.getItem(key)).toBeNull();
    }
  });
});
