import fs from 'fs';
import path from 'path';
import process from 'process';

const LOCK_FILE = process.env.AIDIS_LOCK_FILE || path.join(process.cwd(), 'aidis.pid');

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
        const existingPid = fs.readFileSync(LOCK_FILE, 'utf8').trim();
        
        // Check if process with that PID is still running
        try {
          process.kill(parseInt(existingPid), 0); // Signal 0 just checks if process exists
          throw new Error(`AIDIS is already running with PID ${existingPid}. Only one instance allowed.`);
        } catch (err: any) {
          if (err.code === 'ESRCH') {
            // Process doesn't exist, remove stale lock file
            console.warn(`Removing stale lock file for PID ${existingPid}`);
            fs.unlinkSync(LOCK_FILE);
          } else {
            throw err; // Re-throw if it's our error about already running
          }
        }
      }

      // Create lock file with current PID
      fs.writeFileSync(LOCK_FILE, process.pid.toString());
      this.locked = true;
      
      console.log(`✅ Process lock acquired (PID: ${process.pid})`);
      
      const disableExitHandlers = process.env.AIDIS_DISABLE_PROCESS_EXIT_HANDLERS === 'true';

      // Always release lock on normal process exit
      process.on('exit', () => this.release());

      if (!disableExitHandlers) {
        // SECURITY FIX: Only release lock, don't call process.exit()
        // Let main.ts handle graceful shutdown to avoid race conditions
        process.on('SIGINT', () => {
          console.log('\n🔄 ProcessLock: Releasing lock on SIGINT...');
          this.release();
          // DO NOT call process.exit() - let main.ts handle shutdown
        });
        process.on('SIGTERM', () => {
          console.log('\n🔄 ProcessLock: Releasing lock on SIGTERM...');
          this.release();
          // DO NOT call process.exit() - let main.ts handle shutdown
        });
        process.on('uncaughtException', (error) => {
          console.error('❌ Uncaught Exception:', error);
          this.release();
          process.exit(1);
        });
        process.on('unhandledRejection', (reason, promise) => {
          console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
          this.release();
          process.exit(1);
        });
      }

    } catch (error) {
      throw new Error(`Failed to acquire process lock: ${error}`);
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
        console.log('✅ Process lock released');
      } catch (error) {
        console.error('❌ Error releasing process lock:', error);
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
