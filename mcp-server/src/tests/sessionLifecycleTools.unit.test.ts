/**
 * Session-Rework SR-2 — session lifecycle ROUTE HANDLERS, unit tests (mocked seams).
 * task af51c035, decision ee2270b3.
 *
 * Fast + deterministic (no DB, no wall-clock). Asserts the orchestration contract of
 * sessionRoutes.{handleStart,handleEnd,handleStatus} at the stable collaborator seams
 * (SessionTracker / SessionManagementHandler / projectHandler), which is exactly where
 * the per-connection invariants live:
 *
 *   handleStart — ends the connection's PRIOR session BEFORE opening the new one
 *     (one-active-per-connection ordering), forwards connectionId + title/goal/project,
 *     resolves the project FIRST and fails fast (no end/start) on an unknown project.
 *   handleEnd   — finalizes via endSession; safe no-op when the connection has none.
 *   handleStatus— connection-scoped read (NO global fallback), clean none/active states.
 *
 * Mocks are scoped + restored in afterEach (vi.restoreAllMocks) so the file is
 * order-independent under shuffle (no leaked spies).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sessionRoutes } from '../routes/session.routes.js';
import { SessionTracker } from '../services/sessionTracker.js';
import { SessionManagementHandler } from '../handlers/sessionAnalytics/management/SessionManagementHandler.js';
import { projectHandler } from '../handlers/project.js';

const CONN = 'unit-conn-1';

const sessionSummary = (id: string, extra: Record<string, any> = {}) => ({
  success: true as const,
  session: { id, title: null, session_goal: null, project_name: null, duration_minutes: 0, ...extra },
  message: 'ok',
});

function project(id: string, name: string) {
  return {
    id,
    name,
    description: '',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    gitRepoUrl: null,
    rootDirectory: null,
    metadata: {},
  } as any;
}

describe('SR-2 session lifecycle route handlers (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleStart', () => {
    it('ends the prior session BEFORE opening the new one and forwards connectionId + metadata', async () => {
      const prior = 'prior-session';
      const fresh = 'fresh-session';

      const getActive = vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValue(prior);
      const endSpy = vi.spyOn(SessionTracker, 'endSession').mockResolvedValue({} as any);
      const startSpy = vi.spyOn(SessionTracker, 'startSession').mockResolvedValue(fresh);
      vi.spyOn(projectHandler, 'getCurrentProjectId').mockResolvedValue('conn-project');
      vi.spyOn(SessionManagementHandler, 'getSessionDetailsWithMeta').mockResolvedValue(
        sessionSummary(fresh, { title: 'my title', session_goal: 'my goal' })
      );

      const res = await sessionRoutes.handleStart(
        { title: 'my title', goal: 'my goal' },
        { connectionId: CONN }
      );

      expect(res.isError).not.toBe(true);
      expect(res.structuredContent!.action).toBe('started');
      expect(res.structuredContent!.sessionId).toBe(fresh);
      expect(res.structuredContent!.endedSessionId).toBe(prior);

      // Connection-scoped read of the prior session.
      expect(getActive).toHaveBeenCalledWith(CONN);
      // ORDER: end the prior, then start the new (one-active-per-connection).
      expect(endSpy).toHaveBeenCalledWith(prior);
      expect(endSpy.mock.invocationCallOrder[0]).toBeLessThan(startSpy.mock.invocationCallOrder[0]);

      // startSession receives projectId, title, (description undefined), goal, …, connectionId.
      expect(startSpy).toHaveBeenCalledWith(
        'conn-project', // inherited project
        'my title',
        undefined,
        'my goal',
        undefined,
        undefined,
        undefined,
        CONN
      );
    });

    it('opens WITHOUT ending when the connection has no prior session', async () => {
      const fresh = 'fresh-session';
      vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValue(null);
      const endSpy = vi.spyOn(SessionTracker, 'endSession').mockResolvedValue({} as any);
      vi.spyOn(SessionTracker, 'startSession').mockResolvedValue(fresh);
      vi.spyOn(projectHandler, 'getCurrentProjectId').mockResolvedValue(null);
      vi.spyOn(SessionManagementHandler, 'getSessionDetailsWithMeta').mockResolvedValue(sessionSummary(fresh));

      const res = await sessionRoutes.handleStart({}, { connectionId: CONN });

      expect(res.structuredContent!.endedSessionId).toBeNull();
      expect(endSpy).not.toHaveBeenCalled();
    });

    it('resolves an explicit project by name and forwards its id', async () => {
      vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValue(null);
      vi.spyOn(SessionTracker, 'endSession').mockResolvedValue({} as any);
      const startSpy = vi.spyOn(SessionTracker, 'startSession').mockResolvedValue('s-new');
      vi.spyOn(projectHandler, 'listProjects').mockResolvedValue([project('proj-42', 'My Project')]);
      vi.spyOn(SessionManagementHandler, 'getSessionDetailsWithMeta').mockResolvedValue(sessionSummary('s-new'));

      const res = await sessionRoutes.handleStart({ project: 'my project' }, { connectionId: CONN });

      expect(res.isError).not.toBe(true);
      // Explicit project id forwarded (case-insensitive match), NOT the inherited one.
      expect(startSpy.mock.calls[0][0]).toBe('proj-42');
    });

    it('fails fast on an unknown project WITHOUT ending or starting any session', async () => {
      const getActive = vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValue('whatever');
      const endSpy = vi.spyOn(SessionTracker, 'endSession').mockResolvedValue({} as any);
      const startSpy = vi.spyOn(SessionTracker, 'startSession').mockResolvedValue('nope');
      vi.spyOn(projectHandler, 'listProjects').mockResolvedValue([project('p1', 'Existing')]);

      const res = await sessionRoutes.handleStart({ project: 'ghost' }, { connectionId: CONN });

      expect(res.isError).toBe(true);
      // Critical: no session mutation happened because resolution failed FIRST.
      expect(getActive).not.toHaveBeenCalled();
      expect(endSpy).not.toHaveBeenCalled();
      expect(startSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleEnd', () => {
    it('finalizes the connection current session via endSession', async () => {
      const active = 'active-session';
      const getActive = vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValue(active);
      const endSpy = vi
        .spyOn(SessionTracker, 'endSession')
        .mockResolvedValue({ duration_ms: 1000, productivity_score: 2 } as any);
      vi.spyOn(SessionManagementHandler, 'getSessionDetailsWithMeta').mockResolvedValue(sessionSummary(active));

      const res = await sessionRoutes.handleEnd({}, { connectionId: CONN });

      expect(res.structuredContent!.action).toBe('ended');
      expect(res.structuredContent!.sessionId).toBe(active);
      expect(getActive).toHaveBeenCalledWith(CONN);
      expect(endSpy).toHaveBeenCalledWith(active);
    });

    it('is a safe no-op when no session is active (does NOT call endSession)', async () => {
      vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValue(null);
      const endSpy = vi.spyOn(SessionTracker, 'endSession').mockResolvedValue({} as any);

      const res = await sessionRoutes.handleEnd({}, { connectionId: CONN });

      expect(res.isError).not.toBe(true);
      expect(res.structuredContent!.action).toBe('noop');
      expect(res.structuredContent!.sessionId).toBeNull();
      expect(endSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleStatus', () => {
    it('returns active:false (clean none) when the connection has no session — NO global fallback', async () => {
      const getActive = vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValue(null);

      const res = await sessionRoutes.handleStatus({}, { connectionId: CONN });

      expect(res.structuredContent!.active).toBe(false);
      expect(res.structuredContent!.session).toBeNull();
      // Connection-scoped only: never opts into allowGlobalFallback.
      expect(getActive).toHaveBeenCalledWith(CONN);
      expect(getActive).not.toHaveBeenCalledWith(CONN, { allowGlobalFallback: true });
    });

    it('returns the active session summary when one exists', async () => {
      const active = 'active-1';
      vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValue(active);
      vi.spyOn(SessionManagementHandler, 'getSessionDetailsWithMeta').mockResolvedValue(
        sessionSummary(active, { title: 'live', session_goal: 'the goal' })
      );

      const res = await sessionRoutes.handleStatus({}, { connectionId: CONN });

      expect(res.structuredContent!.active).toBe(true);
      expect(res.structuredContent!.session.id).toBe(active);
      expect(res.structuredContent!.session.session_goal).toBe('the goal');
    });
  });
});
