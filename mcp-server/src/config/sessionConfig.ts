/**
 * sessionConfig — the session-lifecycle knobs (Session-Rework SR-1, task a5fdf1f2,
 * decision ee2270b3, ref:session-rework).
 *
 * STANDING PRINCIPLE (Brian, binds this + all future builds): NO HARDCODED VARIABLES.
 * Every session-lifecycle tunable — the idle/close window and the re-attach window —
 * lives HERE: a named value with a Brian-aligned default, a one-line doc comment, and
 * an env override. Never a literal buried in the service. Mirrors threadConfig.ts /
 * recallConfig.ts / trustConfig.ts: the config is the contract, the code reads it.
 *
 * Env reads happen at module load with a safe fallback (bad/missing → the default),
 * exactly like recallConfig.envInt / threadConfig.envInt.
 *
 * THE MODEL (decision a5e6620c, Brian 2026-06-22):
 *   A session = PER CONNECTION (keyed on the stable connection id the bridge sends as
 *   X-Connection-ID, persisted on the session row so it survives a SERVER restart).
 *   START = first action (auto) OR manual. END = 1h idle OR manual.
 *   reattach_window == idle_timeout == 1h, and they are KEPT EQUAL (a session is
 *   re-attachable for exactly as long as the reaper leaves it open) — see the
 *   single source SESSION_CONFIG.idleTimeoutSec below.
 */

/** Read a positive-integer env var, falling back to `fallback` on missing/garbage. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const v = Number(raw);
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

export interface SessionConfig {
  /**
   * idleTimeoutSec — a session with no activity for this long is CLOSED by the idle
   * reaper (status=inactive + ended_at stamped, RAM entry evicted). Also the END
   * trigger described in the model. Brian (decision a5e6620c): 1 HOUR (was 2h).
   * Env: MANDREL_SESSION_IDLE_TIMEOUT_SEC. Default 3600 (1h).
   */
  idleTimeoutSec: number;
  /**
   * reattachWindowSec — on an action with no valid in-RAM session, the newest OPEN
   * (ended_at NULL, status active|interrupted) session for the SAME connection id
   * within this window is RE-ATTACHED instead of minting a new one. This is the core
   * fix for random-spawning after a server restart. KEPT EQUAL to idleTimeoutSec by
   * default (Brian: "keep them equal") — a session is re-attachable exactly as long
   * as the reaper has not yet closed it. Env: MANDREL_SESSION_REATTACH_WINDOW_SEC.
   * Default = idleTimeoutSec (1h).
   */
  reattachWindowSec: number;
}

/**
 * THE LIVE CONFIG — read once at module load. Defaults are the Brian-aligned values
 * (1h window, re-attach == idle); both env-overridable. The re-attach window defaults
 * to whatever the idle timeout resolves to, so the "keep them equal" invariant holds
 * even when only the idle timeout is overridden — but it can still be overridden
 * independently if an operator ever needs to.
 */
const idleTimeoutSec = envInt('MANDREL_SESSION_IDLE_TIMEOUT_SEC', 3600);

export const SESSION_CONFIG: SessionConfig = {
  idleTimeoutSec,
  reattachWindowSec: envInt('MANDREL_SESSION_REATTACH_WINDOW_SEC', idleTimeoutSec),
};

/** The idle/timeout window as a Postgres INTERVAL literal (e.g. '3600 seconds'). */
export function idleTimeoutInterval(): string {
  return `${SESSION_CONFIG.idleTimeoutSec} seconds`;
}
