/**
 * Pattern #2 — validate-on-read for stored ids: sessionRecovery.
 *
 * A persisted session carries an `id` that can flow into UUID-validated
 * requests. If the stored id is corrupt, the recovered session must be DISCARDED
 * (and the key purged) so a stale/corrupt value can't drive a guaranteed-failing
 * request. A valid stored session must still be recovered (no over-rejection).
 *
 * sessionRecovery is a module-singleton that reads localStorage in its
 * constructor (loadPersistedState) and then kicks off background sync. We seed
 * storage BEFORE importing it (via jest.isolateModules), mock the network client
 * and timers so the constructor's background work is inert, then inspect the
 * recovered state synchronously through getCurrentSession().
 */

// Keep the constructor's background sync inert.
jest.mock('../api/sessionsClient', () => ({
  sessionsClient: { getCurrentSession: jest.fn().mockResolvedValue(null) },
}));

const KEY = 'aidis_session_state';
const VALID_ID = 'c875b2af-9020-41b7-9595-d70221603464';

function loadServiceWith(stateJson: string | null) {
  localStorage.clear();
  if (stateJson !== null) localStorage.setItem(KEY, stateJson);
  let svc: any;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    svc = require('./sessionRecovery').sessionRecovery;
  });
  return svc;
}

beforeAll(() => {
  jest.useFakeTimers();
});
afterAll(() => {
  jest.useRealTimers();
});

describe('sessionRecovery validate-on-read', () => {
  test('recovers a session with a VALID id', () => {
    const svc = loadServiceWith(
      JSON.stringify({ currentSession: { id: VALID_ID, title: 'ok' }, lastSyncTime: 5 })
    );
    expect(svc.getCurrentSession()?.id).toBe(VALID_ID);
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  test('DISCARDS + purges a session with a corrupt id', () => {
    const svc = loadServiceWith(
      JSON.stringify({
        currentSession: { id: 'session_voiceitt-bridge', title: 'bad' },
        lastSyncTime: 5,
      })
    );
    expect(svc.getCurrentSession()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test('null currentSession is a valid recovered state (no active session)', () => {
    const svc = loadServiceWith(JSON.stringify({ currentSession: null, lastSyncTime: 0 }));
    expect(svc.getCurrentSession()).toBeNull();
  });

  test('nothing stored => no throw, null session', () => {
    const svc = loadServiceWith(null);
    expect(svc.getCurrentSession()).toBeNull();
  });
});
