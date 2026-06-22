import fs from 'fs';
import path from 'path';
import process from 'process';
import { logger } from './logger.js';

const LOCK_FILE = process.env.AIDIS_LOCK_FILE || path.join(process.cwd(), 'aidis.pid');
// Temp suffix for the atomic write-then-rename of the pid file. Keeping it next to
// LOCK_FILE guarantees the rename is same-filesystem (atomic). Not a tunable knob —
// it is an implementation detail of the atomic-write, intentionally derived from
// LOCK_FILE so the AIDIS_LOCK_FILE override still fully governs the location.
const LOCK_FILE_TMP_SUFFIX = '.tmp';

/**
 * Parse the raw contents of a lock file into a usable PID.
 *
 * A lock file is only trustworthy if it contains a positive integer PID. Anything
 * else — empty string (the 2026-06-21 ENOSPC poison-pill), whitespace, NaN, 0,
 * negative numbers, or garbage — is an INVALID/corrupt lock that must be treated as
 * stale. Returning null signals "this lock is not trustworthy; remove it and proceed".
 *
 * Why positive-only matters: process.kill(0, sig) and process.kill(-1, sig) target
 * process GROUPS and do NOT throw, so a parsed value of 0 or negative would be
 * mistaken for a live process and falsely block startup. We reject them up front,
 * before ever calling process.kill.
 */
function parseLockPid(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  // Require the contents to be EXACTLY a run of digits (optionally signed) so that
  // parseInt's lenient "123abc" => 123 behaviour can't smuggle a garbage file through.
  if (!/^-?\d+$/.test(trimmed)) {
    return null;
  }
  const pid = Number(trimmed);
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  return pid;
}

class ProcessLock {
  private static instance: ProcessLock;
  private locked = false;

  private constructor() {}

  static getInstance(): ProcessLock {
    if (!ProcessLock.instance) {
      ProcessLock.instance = new ProcessLock();
    }
    return ProcessLock.instance;
  }

  /**
   * Acquire process lock to ensure singleton operation
   * Throws error if another instance is already running
   */
  acquire(): void {
    try {
      // Check if lock file exists
      if (fs.existsSync(LOCK_FILE)) {
        const raw = fs.readFileSync(LOCK_FILE, 'utf8');
        const existingPid = parseLockPid(raw);

        if (existingPid === null) {
          // INVALID/corrupt lock contents (empty/whitespace/NaN/<=0/garbage).
          // This is the ENOSPC poison-pill class: a truncated 0-byte pid file left
          // behind by a disk-full write. Never trustworthy → remove and proceed.
          logger.warn(
            `Removing invalid/corrupt lock file (contents: ${JSON.stringify(raw)})`,
          );
          fs.unlinkSync(LOCK_FILE);
        } else if (this.isPidAlive(existingPid)) {
          // A real, live process owns the lock → refuse to start.
          throw new Error(
            `AIDIS is already running with PID ${existingPid}. Only one instance allowed.`,
          );
        } else {
          // Process with that PID is not alive → stale lock, remove and proceed.
          logger.warn(`Removing stale lock file for PID ${existingPid}`);
          fs.unlinkSync(LOCK_FILE);
        }
      }

      // Create lock file with current PID (atomic write — see writeLockFile).
      this.writeLockFile();
      this.locked = true;
      
      logger.info(`✅ Process lock acquired (PID: ${process.pid})`);
      
      const disableExitHandlers = process.env.AIDIS_DISABLE_PROCESS_EXIT_HANDLERS === 'true';

      // Always release lock on normal process exit
      process.on('exit', () => this.release());

      if (!disableExitHandlers) {
        // SECURITY FIX: Only release lock, don't call process.exit()
        // Let main.ts handle graceful shutdown to avoid race conditions
        process.on('SIGINT', () => {
          logger.info('\n🔄 ProcessLock: Releasing lock on SIGINT...');
          this.release();
          // DO NOT call process.exit() - let main.ts handle shutdown
        });
        process.on('SIGTERM', () => {
          logger.info('\n🔄 ProcessLock: Releasing lock on SIGTERM...');
          this.release();
          // DO NOT call process.exit() - let main.ts handle shutdown
        });
        process.on('uncaughtException', (error) => {
          logger.error('❌ Uncaught Exception', error as Error);
          this.release();
          process.exit(1);
        });
        process.on('unhandledRejection', (reason, promise) => {
          logger.error('❌ Unhandled Rejection', undefined, { metadata: { promise, reason } });
          this.release();
          process.exit(1);
        });
      }

    } catch (error) {
      throw new Error(`Failed to acquire process lock: ${error}`);
    }
  }

  /**
   * Determine whether a process with the given (already-validated, positive integer)
   * PID is alive, using signal 0 (existence probe, sends no actual signal).
   *
   * Per-errno semantics, explicit so the empty/corrupt class can never crash-loop:
   *  - no throw          → process exists and is signalable by us → ALIVE.
   *  - EPERM             → a process with that PID exists but we lack permission to
   *                        signal it (owned by another user). It IS alive → ALIVE.
   *                        We must NOT steal a lock held by a live foreign process.
   *  - ESRCH             → no such process → STALE (caller removes the lock).
   *  - any other throw   → e.g. EINVAL / TypeError(ERR_INVALID_ARG_TYPE) /
   *                        RangeError from a bad pid the parser somehow let through.
   *                        We cannot prove the process is alive, so we fail SAFE for
   *                        availability and treat it as STALE (caller removes + proceeds).
   *
   * Defaulting the unknown-error case to STALE (not ALIVE) is the deliberate choice:
   * the incident was a crash-loop caused by a corrupt lock being read as "alive". A
   * false-stale at worst risks a second instance in a truly pathological case; a
   * false-alive guarantees the outage we just fixed. Disk-full crash-loop is the
   * worse failure, so we bias toward starting.
   */
  private isPidAlive(pid: number): boolean {
    try {
      process.kill(pid, 0); // signal 0 = existence check only
      return true;
    } catch (err: any) {
      const code = err?.code;
      if (code === 'EPERM') {
        // Exists, just not ours to signal → still alive.
        return true;
      }
      if (code === 'ESRCH') {
        // No such process → stale.
        return false;
      }
      // EINVAL / ERR_INVALID_ARG_TYPE / RangeError / anything unexpected → treat as
      // stale and let the caller reclaim the lock rather than crash-loop.
      logger.warn(
        `Unexpected error probing PID ${pid} (code=${code ?? 'none'}); treating lock as stale`,
      );
      return false;
    }
  }

  /**
   * Write the pid file ATOMICALLY: write to a sibling temp file, then renameSync into
   * place. rename(2) is atomic on the same filesystem, so a reader can never observe a
   * half-written/0-byte lock file even if the write is interrupted (e.g. ENOSPC).
   *
   * If the write itself fails (true disk-full), we clean up any partial temp file and
   * throw a CLEAR, distinct error — never leaving a corrupt LOCK_FILE behind to become
   * the next startup's poison pill.
   */
  private writeLockFile(): void {
    const tmpFile = LOCK_FILE + LOCK_FILE_TMP_SUFFIX;
    try {
      fs.writeFileSync(tmpFile, process.pid.toString(), 'utf8');
      fs.renameSync(tmpFile, LOCK_FILE);
    } catch (error: any) {
      // Best-effort cleanup of the partial temp file so it can't accumulate.
      try {
        if (fs.existsSync(tmpFile)) {
          fs.unlinkSync(tmpFile);
        }
      } catch {
        // Ignore cleanup failure — the throw below is the signal that matters.
      }
      throw new Error(
        `Failed to write lock file atomically at ${LOCK_FILE} ` +
          `(code=${error?.code ?? 'none'}): ${error?.message ?? error}`,
      );
    }
  }

  /**
   * Release the process lock
   */
  release(): void {
    if (this.locked && fs.existsSync(LOCK_FILE)) {
      try {
        fs.unlinkSync(LOCK_FILE);
        this.locked = false;
        logger.info('✅ Process lock released');
      } catch (error) {
        logger.error('❌ Error releasing process lock', error as Error);
      }
    }
  }

  /**
   * Check if process is currently locked
   */
  isLocked(): boolean {
    return this.locked;
  }
}

export const processLock = ProcessLock.getInstance();
