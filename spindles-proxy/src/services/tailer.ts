/**
 * JSONL Tailer Service
 * Watches logs/spindles.jsonl for new entries and imports to database
 * Phase 2.1 - Foundation
 * Tasks: TS-011, TS-012, TS-013
 *
 * Features:
 * - Offset tracking (remembers last read position)
 * - Log rotation detection (inode monitoring)
 * - Idempotent inserts (ON CONFLICT DO NOTHING)
 * - State persistence (survives restarts)
 * - Error recovery (malformed lines, partial reads)
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { pool } from '../db/client.js';

const JSONL_FILE = path.join(__dirname, '../../logs/spindles.jsonl');
const STATE_FILE = path.join(__dirname, '../../logs/tailer-state.json');
const LEGACY_SESSION_ID = '00000000-0000-0000-0000-000000000001';
const POLL_INTERVAL_MS = 2000; // Check for new lines every 2 seconds

interface TailerState {
  filePath: string;
  lastReadOffset: number;
  lastInode: number;
  lastSize: number;
  lastProcessedAt: string;
  spindlesProcessed: number;
}

interface SpindleJSONL {
  spindle: {
    id: string;
    sessionId: string | null;
    timestamp: string;
    type: string;
    content: string;
    metadata: {
      model: string;
      startedAt: string;
      confidence?: string;
      tags?: string[];
    };
  };
  capturedAt: string;
}

export class JSONLTailer {
  private state: TailerState;
  private running: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.state = {
      filePath: JSONL_FILE,
      lastReadOffset: 0,
      lastInode: 0,
      lastSize: 0,
      lastProcessedAt: new Date().toISOString(),
      spindlesProcessed: 0,
    };
  }

  /**
   * Load state from disk (survives restarts)
   */
  async loadState(): Promise<void> {
    try {
      const content = await fsPromises.readFile(STATE_FILE, 'utf-8');
      const saved = JSON.parse(content);
      this.state = { ...this.state, ...saved };
      console.log(`📂 Loaded tailer state: offset=${this.state.lastReadOffset}, processed=${this.state.spindlesProcessed}`);
    } catch (err) {
      // State file doesn't exist yet - start fresh
      console.log('📂 No previous state found - starting fresh');
    }
  }

  /**
   * Save state to disk
   */
  async saveState(): Promise<void> {
    this.state.lastProcessedAt = new Date().toISOString();
    await fsPromises.writeFile(STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  /**
   * Detect log rotation via inode/size changes
   */
  async detectRotation(): Promise<boolean> {
    try {
      const stats = await fsPromises.stat(JSONL_FILE);
      const currentInode = stats.ino;
      const currentSize = stats.size;

      // Log rotated if inode changed OR file shrunk
      if (this.state.lastInode !== 0 && currentInode !== this.state.lastInode) {
        console.log('🔄 Log rotation detected (inode changed)');
        return true;
      }

      if (currentSize < this.state.lastSize) {
        console.log('🔄 Log rotation detected (file shrunk)');
        return true;
      }

      return false;
    } catch (err) {
      console.error('⚠️  Error checking file stats:', err);
      return false;
    }
  }

  /**
   * Compute content hash for deduplication analysis
   */
  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Compute thinking duration
   */
  private computeDuration(startedAt: string, capturedAt: string): number | null {
    try {
      const start = new Date(startedAt).getTime();
      const end = new Date(capturedAt).getTime();
      return end - start;
    } catch {
      return null;
    }
  }

  /**
   * Insert spindle into database (idempotent)
   */
  async insertSpindle(spindle: SpindleJSONL): Promise<boolean> {
    const { spindle: s, capturedAt } = spindle;

    const contentHash = this.computeHash(s.content);
    const contentLength = s.content.length;
    const thinkingDuration = this.computeDuration(s.metadata.startedAt, capturedAt);
    const sessionId = s.sessionId || LEGACY_SESSION_ID;

    const rawMetadata = {
      confidence: s.metadata.confidence,
      tags: s.metadata.tags,
      startedAt: s.metadata.startedAt,
    };

    try {
      const result = await pool.query(
        `INSERT INTO spindles (
          id,
          session_id,
          captured_at,
          content,
          content_hash,
          content_length,
          model,
          thinking_duration_ms,
          processing_status,
          raw_metadata,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO NOTHING
        RETURNING id`,
        [
          s.id,
          sessionId,
          capturedAt,
          s.content,
          contentHash,
          contentLength,
          s.metadata.model,
          thinkingDuration,
          'pending',
          JSON.stringify(rawMetadata),
          capturedAt,
          capturedAt,
        ]
      );

      // Returns true if inserted, false if already exists
      return result.rowCount! > 0;
    } catch (err) {
      console.error(`❌ Failed to insert spindle ${s.id}:`, err);
      return false;
    }
  }

  /**
   * Process new lines from file
   */
  async processNewLines(): Promise<void> {
    try {
      // Check for rotation
      const rotated = await this.detectRotation();
      if (rotated) {
        console.log('🔄 Resetting offset due to rotation');
        this.state.lastReadOffset = 0;
      }

      // Get current file stats
      const stats = await fsPromises.stat(JSONL_FILE);
      this.state.lastInode = stats.ino;
      this.state.lastSize = stats.size;

      // No new data
      if (stats.size <= this.state.lastReadOffset) {
        return;
      }

      // Read new content from last offset
      const fd = await fsPromises.open(JSONL_FILE, 'r');
      const bytesToRead = stats.size - this.state.lastReadOffset;
      const buffer = Buffer.alloc(bytesToRead);

      await fd.read(buffer, 0, bytesToRead, this.state.lastReadOffset);
      await fd.close();

      const newContent = buffer.toString('utf-8');
      const lines = newContent.split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        return;
      }

      console.log(`📄 Processing ${lines.length} new lines...`);

      let imported = 0;
      let skipped = 0;
      let errors = 0;

      for (const line of lines) {
        try {
          const spindle: SpindleJSONL = JSON.parse(line);
          const inserted = await this.insertSpindle(spindle);

          if (inserted) {
            imported++;
            this.state.spindlesProcessed++;
          } else {
            skipped++;
          }
        } catch (err) {
          console.error('⚠️  Failed to parse/insert line:', err);
          errors++;
        }
      }

      // Update offset to end of file
      this.state.lastReadOffset = stats.size;
      await this.saveState();

      if (imported > 0 || errors > 0) {
        console.log(`✅ Processed: ${imported} imported, ${skipped} skipped, ${errors} errors`);
        console.log(`📊 Total processed: ${this.state.spindlesProcessed} spindles`);
      }
    } catch (err) {
      console.error('💥 Error processing new lines:', err);
    }
  }

  /**
   * Start tailing the file
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('⚠️  Tailer already running');
      return;
    }

    console.log('🚀 Starting JSONL Tailer');
    console.log(`📂 Watching: ${JSONL_FILE}`);
    console.log(`📊 Poll interval: ${POLL_INTERVAL_MS}ms`);

    await this.loadState();
    this.running = true;

    // Initial processing
    await this.processNewLines();

    // Poll for new lines
    this.pollTimer = setInterval(async () => {
      if (this.running) {
        await this.processNewLines();
      }
    }, POLL_INTERVAL_MS);

    console.log('✅ Tailer started');
  }

  /**
   * Stop tailing
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    console.log('🛑 Stopping JSONL Tailer');
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    await this.saveState();
    console.log('✅ Tailer stopped');
  }

  /**
   * Get current state
   */
  getState(): TailerState {
    return { ...this.state };
  }
}

// Singleton instance
export const tailer = new JSONLTailer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await tailer.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await tailer.stop();
  process.exit(0);
});
