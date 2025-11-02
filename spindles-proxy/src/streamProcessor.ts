/**
 * Stream Processor
 * Extracts thinking blocks from Anthropic API streaming responses (SSE/JSON format)
 */

import { randomUUID } from 'crypto';
import { Spindle, StreamChunk } from './types.js';

interface ThinkingBlockState {
  isActive: boolean;
  index: number | null;
  content: string;
  startedAt: string;
}

export class StreamProcessor {
  private buffer: string = '';
  private sessionId: string | null = null;
  private thinkingBlock: ThinkingBlockState = {
    isActive: false,
    index: null,
    content: '',
    startedAt: ''
  };
  private model: string | null = null;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || null;
  }

  /**
   * Process a chunk of streaming data
   * Parses SSE format and extracts thinking blocks from JSON events
   */
  processChunk(chunk: string): { spindles: Spindle[]; forwardChunk: string } {
    const spindles: Spindle[] = [];
    this.buffer += chunk;

    // Parse SSE events from buffer
    const events = this.parseSSEEvents();

    events.forEach(event => {
      const spindle = this.processEvent(event);
      if (spindle) {
        spindles.push(spindle);
      }
    });

    // Return spindles and the original chunk (passthrough)
    return {
      spindles,
      forwardChunk: chunk // Forward unchanged for transparent proxy
    };
  }

  /**
   * Parse SSE events from buffer
   * Format: event: <type>\ndata: <json>\n\n
   */
  private parseSSEEvents(): Array<{ type: string; data: any }> {
    const events: Array<{ type: string; data: any }> = [];
    const lines = this.buffer.split('\n');
    let currentEvent: string | null = null;
    let currentData: string | null = null;
    let processedLines = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('event:')) {
        currentEvent = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        currentData = line.substring(5).trim();
      } else if (line === '' && currentEvent && currentData) {
        // Complete event found
        try {
          const parsedData = JSON.parse(currentData);
          events.push({ type: currentEvent, data: parsedData });
        } catch (e) {
          // Skip unparseable JSON
        }
        currentEvent = null;
        currentData = null;
        processedLines = i + 1;
      }
    }

    // Keep unprocessed lines in buffer
    this.buffer = lines.slice(processedLines).join('\n');

    return events;
  }

  /**
   * Process a single SSE event
   * Returns a Spindle if thinking block is complete, otherwise null
   */
  private processEvent(event: { type: string; data: any }): Spindle | null {
    const { type, data } = event;

    // Extract model from message_start
    if (type === 'message_start' && data.message?.model) {
      this.model = data.message.model;
    }

    // Detect start of thinking block
    if (type === 'content_block_start' &&
        data.content_block?.type === 'thinking' &&
        data.index === 0) {
      this.thinkingBlock = {
        isActive: true,
        index: data.index,
        content: '',
        startedAt: new Date().toISOString()
      };
      console.log('[SPINDLE] Thinking block started');
      return null;
    }

    // Accumulate thinking content
    if (type === 'content_block_delta' &&
        data.delta?.type === 'thinking_delta' &&
        data.index === 0 &&
        this.thinkingBlock.isActive) {
      this.thinkingBlock.content += data.delta.thinking;
      return null;
    }

    // Complete thinking block
    if (type === 'content_block_stop' &&
        data.index === 0 &&
        this.thinkingBlock.isActive) {
      console.log('[SPINDLE] Thinking block complete:', this.thinkingBlock.content.length, 'chars');
      const spindle = this.createSpindle(this.thinkingBlock.content);

      // Reset state
      this.thinkingBlock = {
        isActive: false,
        index: null,
        content: '',
        startedAt: ''
      };

      return spindle;
    }

    return null;
  }

  /**
   * Create a Spindle object from thinking block content
   */
  private createSpindle(content: string): Spindle {
    return {
      id: randomUUID(),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      type: 'thinking_block',
      content,
      metadata: {
        confidence: 'high',
        tags: ['phase-1', 'raw-thinking'],
        model: this.model || 'unknown',
        startedAt: this.thinkingBlock.startedAt
      }
    };
  }

  /**
   * Set or update the session ID for this processor
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Clear the internal buffer (useful for testing or reset)
   */
  clearBuffer(): void {
    this.buffer = '';
    this.thinkingBlock = {
      isActive: false,
      index: null,
      content: '',
      startedAt: ''
    };
  }

  /**
   * Get the current buffer state (for debugging)
   */
  getBufferState(): { buffer: string; thinkingBlockActive: boolean } {
    return {
      buffer: this.buffer,
      thinkingBlockActive: this.thinkingBlock.isActive
    };
  }
}
