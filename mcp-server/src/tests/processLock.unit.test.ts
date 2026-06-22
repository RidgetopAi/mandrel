import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Regression guard for the 2026-06-21 disk-full incident (Lesson 015, part 2).
 *
 * When the disk hit 100%, the mcp-server's PID write to its singleton lock file was
 * truncated by ENOSPC, leaving a 0-byte lock file. On every subsequent startup the old
 * code read the empty pid, called process.kill(NaN, 0), and — because that does NOT
 * yield a clean ESRCH "stale" — concluded another instance was running →
 * singleton_lock_failed → crash-loop (83 restarts).
 *
 * These tests exercise processLock's acquire() against real temp lock files to prove the
 * hardened logic: invalid/corrupt contents are treated as stale and acquire SUCCEEDS,
 * a genuinely live PID still BLOCKS, a dead PID is reclaimed, and the pid file is written
 * atomically with a valid round-trippable value.
 *
 * Each test gets a FRESH module instance (vi.resetModules + dynamic import) with its own
 * AIDIS_LOCK_FILE, because processLock is a stateful singleton.
 */

let tempDir: string;
let lockFile: string;

async function freshProcessLock() {
  vi.resetModules();
  const mod = await import('@/utils/processLock');
  return mod.processLock;
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidis-processlock-'));
  lockFile = path.join(tempDir, 'aidis.pid');
  process.env.AIDIS_LOCK_FILE = lockFile;
  // We register exit/signal handlers in acquire(); disable the SIG handlers so the test
  // process isn't littered with listeners across the many fresh instances.
  process.env.AIDIS_DISABLE_PROCESS_EXIT_HANDLERS = 'true';
});

afterEach(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  delete process.env.AIDIS_LOCK_FILE;
  delete process.env.AIDIS_DISABLE_PROCESS_EXIT_HANDLERS;
});

describe('processLock singleton hardening (disk-full poison-pill class)', () => {
  it('(a) EMPTY lock file (the exact incident) is treated as stale and acquire SUCCEEDS', async () => {
    // Simulate the ENOSPC poison-pill: a truncated 0-byte lock file.
    fs.writeFileSync(lockFile, '');

    const processLock = await freshProcessLock();
    expect(() => processLock.acquire()).not.toThrow();

    expect(processLock.isLocked()).toBe(true);
    // The lock file is now owned by THIS process.
    expect(fs.readFileSync(lockFile, 'utf8').trim()).toBe(String(process.pid));

    processLock.release();
  });

  it('(a2) whitespace-only lock file is treated as stale and acquire SUCCEEDS', async () => {
    fs.writeFileSync(lockFile, '   \n\t  ');

    const processLock = await freshProcessLock();
    expect(() => processLock.acquire()).not.toThrow();
    expect(processLock.isLocked()).toBe(true);
    expect(fs.readFileSync(lockFile, 'utf8').trim()).toBe(String(process.pid));

    processLock.release();
  });

  it('(b) garbage / NaN contents are treated as stale and acquire SUCCEEDS', async () => {
    fs.writeFileSync(lockFile, 'not-a-pid-NaN-💥');

    const processLock = await freshProcessLock();
    expect(() => processLock.acquire()).not.toThrow();
    expect(processLock.isLocked()).toBe(true);
    expect(fs.readFileSync(lockFile, 'utf8').trim()).toBe(String(process.pid));

    processLock.release();
  });

  it('(b2) zero / negative pid (process-GROUP footgun) is treated as stale and acquire SUCCEEDS', async () => {
    // process.kill(0, 0) and process.kill(-1, 0) do NOT throw (they target groups), so
    // a naive impl would mistake these for "alive" and refuse startup. They must parse
    // as invalid and be reclaimed.
    for (const poison of ['0', '-1']) {
      fs.writeFileSync(lockFile, poison);
      const processLock = await freshProcessLock();
      expect(() => processLock.acquire(), `pid="${poison}" should be reclaimed`).not.toThrow();
      expect(processLock.isLocked()).toBe(true);
      expect(fs.readFileSync(lockFile, 'utf8').trim()).toBe(String(process.pid));
      processLock.release();
    }
  });

  it('(c) lock file with a LIVE pid (this process) BLOCKS acquire', async () => {
    // Our own PID is unquestionably alive → must refuse and NOT steal the lock.
    fs.writeFileSync(lockFile, String(process.pid));

    const processLock = await freshProcessLock();
    expect(() => processLock.acquire()).toThrow(/already running|already acquired|Failed to acquire/i);

    // The original lock file must be left intact (not stolen / overwritten).
    expect(fs.readFileSync(lockFile, 'utf8').trim()).toBe(String(process.pid));
    expect(processLock.isLocked()).toBe(false);
  });

  it('(d) lock file with a definitely-dead pid is removed (stale) and acquire SUCCEEDS', async () => {
    // Find a PID that is not currently running. Probe upward from a high value.
    const deadPid = findDeadPid();
    fs.writeFileSync(lockFile, String(deadPid));

    const processLock = await freshProcessLock();
    expect(() => processLock.acquire()).not.toThrow();
    expect(processLock.isLocked()).toBe(true);
    // Reclaimed: file now holds our pid, not the dead one.
    expect(fs.readFileSync(lockFile, 'utf8').trim()).toBe(String(process.pid));

    processLock.release();
  });

  it('(e) acquire writes an atomic, valid pid file that round-trips to process.pid', async () => {
    // No pre-existing lock file at all.
    expect(fs.existsSync(lockFile)).toBe(false);

    const processLock = await freshProcessLock();
    processLock.acquire();

    expect(fs.existsSync(lockFile)).toBe(true);
    const written = fs.readFileSync(lockFile, 'utf8');
    // Round-trip: parses back to exactly our pid, no stray temp file left behind.
    expect(Number(written.trim())).toBe(process.pid);
    expect(fs.existsSync(lockFile + '.tmp')).toBe(false);

    processLock.release();
    // release() cleans up the lock file because we own it.
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it('release() only removes the lock when this instance owns it', async () => {
    // A foreign lock file we never acquired must survive a release() call.
    fs.writeFileSync(lockFile, String(process.pid));
    const processLock = await freshProcessLock();
    // Never acquired → not locked → release is a no-op on the file.
    processLock.release();
    expect(fs.existsSync(lockFile)).toBe(true);
    expect(fs.readFileSync(lockFile, 'utf8').trim()).toBe(String(process.pid));
  });
});

/**
 * Return a PID that is not currently alive. Starts high (well above typical live PIDs)
 * and walks down until process.kill(pid, 0) reports ESRCH.
 */
function findDeadPid(): number {
  for (let pid = 4194304; pid > 1; pid -= 9973) {
    try {
      process.kill(pid, 0);
      // alive — keep searching
    } catch (err: any) {
      if (err?.code === 'ESRCH') {
        return pid;
      }
      // EPERM means it exists but we can't signal — also alive, keep searching.
    }
  }
  // Extremely unlikely fallback.
  return 4194303;
}
