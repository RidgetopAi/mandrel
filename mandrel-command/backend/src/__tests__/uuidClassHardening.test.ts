/**
 * UUID-class hardening — backend guard tests.
 *
 * Backstops the systemic fix for the "unvalidated id" bug class (the class
 * behind the dmclark dashboard outage). Three things are pinned here, NO DB
 * required (validateUUIDParam + isValidUuid run purely on the route param):
 *
 *   1. The shared `isValidUuid` accepts EXACTLY what Postgres `uuid` accepts —
 *      any case-insensitive 8-4-4-4-12 hex — and rejects junk. Critically it
 *      must NOT over-reject real ids (the `aaaa...` / `12345678...` non-RFC-
 *      version cases Postgres stores and accepts), which a stricter RFC regex
 *      or zod 4.x `.uuid()` would wrongly reject and log users out of valid
 *      projects.
 *   2. `validateUUIDParam(name)` returns a clean 400 for a malformed id on
 *      both `:id` and `:sessionId` routes (NOT a 500), and never reaches the
 *      handler.
 *   3. A VALID stored id still reaches the handler (no over-rejection regression).
 */
import request from 'supertest';
import express from 'express';
import { validateUUIDParam } from '../middleware/validation';
import { isValidUuid, UUID_REGEX } from '../utils/uuid';

// A real v4 UUID from the task brief (a genuine stored id shape).
const REAL_UUID = 'c875b2af-9020-41b7-9595-d70221603464';

// Ids Postgres ACCEPTS but a stricter RFC version/variant regex (or zod 4.x
// .uuid()) would WRONGLY reject. Over-rejecting these is the "M1 in reverse"
// bug — it would 400 a user out of a perfectly valid project.
const POSTGRES_ACCEPTED_NON_RFC = [
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '12345678-1234-1234-1234-123456789012',
  '00000000-0000-0000-0000-000000000000', // nil/UNASSIGNED — a castable uuid at the DB boundary
];

const JUNK_IDS = [
  'session_voiceitt-bridge', // the exact corrupt value from the dmclark outage
  'not-a-uuid',
  'undefined',
  'aidis-my-project',
  '', // empty
  'c875b2af-9020-41b7-9595-d70221603464-extra',
];

describe('shared isValidUuid (single source of truth)', () => {
  test('accepts a real v4 UUID (case-insensitive)', () => {
    expect(isValidUuid(REAL_UUID)).toBe(true);
    expect(isValidUuid(REAL_UUID.toUpperCase())).toBe(true);
  });

  test('accepts every id Postgres accepts — NO over-rejection', () => {
    for (const id of POSTGRES_ACCEPTED_NON_RFC) {
      expect(isValidUuid(id)).toBe(true);
    }
  });

  test('rejects junk / corrupt ids', () => {
    for (const id of JUNK_IDS) {
      expect(isValidUuid(id)).toBe(false);
    }
  });

  test('rejects non-string input without throwing', () => {
    expect(isValidUuid(undefined)).toBe(false);
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid(123)).toBe(false);
    expect(isValidUuid({})).toBe(false);
  });

  test('the canonical regex is the loose Postgres-exact form (no [1-5]/[89ab] strictness)', () => {
    expect(UUID_REGEX.source).toBe(
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    );
  });
});

// Build a tiny app mirroring the production route shapes added in this fix.
function buildApp() {
  const app = express();
  // :id routes (decisions, sessions GET/:id, naming, tasks/:id/*)
  app.get('/sessions/:id', validateUUIDParam(), (req, res) => {
    res.status(200).json({ reachedHandler: true, id: req.params.id });
  });
  app.delete('/decisions/:id', validateUUIDParam(), (req, res) => {
    res.status(200).json({ reachedHandler: true, id: req.params.id });
  });
  // :sessionId routes (sessionCode, git, v2 proxies)
  app.get('/session-code/session/:sessionId', validateUUIDParam('sessionId'), (req, res) => {
    res.status(200).json({ reachedHandler: true, sessionId: req.params.sessionId });
  });
  app.get('/git/session/:sessionId/stats', validateUUIDParam('sessionId'), (req, res) => {
    res.status(200).json({ reachedHandler: true, sessionId: req.params.sessionId });
  });
  return app;
}

describe('validateUUIDParam on :id and :sessionId routes — clean 400, never 500', () => {
  const app = buildApp();

  const getCases: Array<[string, string]> = [
    ['/sessions', 'session_voiceitt-bridge'],
    ['/sessions', 'not-a-uuid'],
  ];

  test.each(getCases)(
    'GET %s/:id with a malformed id => 400, handler not reached',
    async (base, badId) => {
      const res = await request(app).get(`${base}/${badId}`);
      expect(res.status).toBe(400);
      expect(res.body.reachedHandler).toBeUndefined();
    }
  );

  test('DELETE /decisions/:id with a malformed id => 400, handler not reached (M2)', async () => {
    const res = await request(app).delete('/decisions/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.reachedHandler).toBeUndefined();
  });

  test('malformed :sessionId (sessionCode) => 400, not 500', async () => {
    const res = await request(app).get('/session-code/session/session_voiceitt-bridge');
    expect(res.status).toBe(400);
    expect(res.body.reachedHandler).toBeUndefined();
  });

  test('malformed :sessionId (git) => 400, not 500', async () => {
    const res = await request(app).get('/git/session/not-a-uuid/stats');
    expect(res.status).toBe(400);
    expect(res.body.reachedHandler).toBeUndefined();
  });

  test('REGRESSION: a VALID stored id still reaches the handler (:id)', async () => {
    const res = await request(app).get(`/sessions/${REAL_UUID}`);
    expect(res.status).toBe(200);
    expect(res.body.reachedHandler).toBe(true);
    expect(res.body.id).toBe(REAL_UUID);
  });

  test('REGRESSION: a VALID stored id still reaches the handler (:sessionId)', async () => {
    const res = await request(app).get(`/session-code/session/${REAL_UUID}`);
    expect(res.status).toBe(200);
    expect(res.body.reachedHandler).toBe(true);
    expect(res.body.sessionId).toBe(REAL_UUID);
  });

  test('REGRESSION: ids Postgres accepts are NOT over-rejected by the route', async () => {
    for (const id of POSTGRES_ACCEPTED_NON_RFC) {
      const res = await request(app).get(`/sessions/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.reachedHandler).toBe(true);
    }
  });
});
