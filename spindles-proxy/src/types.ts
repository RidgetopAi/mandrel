/**
 * Spindles Type Definitions
 * Core interfaces for capturing thinking blocks from Claude streaming responses
 */

export type SpindleType =
  | 'thinking_block'
  | 'discovered_issue'
  | 'architecture_note'
  | 'follow_up_task'
  | 'performance_concern'
  | 'security_note';

export interface Spindle {
  id: string;
  sessionId: string | null;
  timestamp: string;
  type: SpindleType;
  content: string;
  metadata?: {
    lineNumber?: number;
    confidence?: 'high' | 'medium' | 'low';
    tags?: string[];
    [key: string]: any;
  };
}

export interface StreamChunk {
  raw: string;
  isThinkingBlock: boolean;
  thinkingContent?: string;
}

export interface ProxyConfig {
  port: number;
  targetUrl: string;
  logFile: string;
  enableConsoleLogging: boolean;
}

export interface SpindleLogEntry {
  spindle: Spindle;
  capturedAt: string;
}
