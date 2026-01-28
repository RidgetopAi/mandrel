/**
 * Claude CLI Output Capture (Phase 3 - Visibility Layer)
 *
 * Parses Claude CLI stdout/stderr for investigation markers.
 * Extracts structured events from tool calls and reasoning.
 *
 * Claude CLI typically outputs:
 * - Tool calls (Read, Grep, Glob, etc.)
 * - Thinking/reasoning blocks
 * - Structured JSON responses
 *
 * We parse these to emit InvestigationEvents for the SSE stream.
 */

import type { InvestigationEvent, InvestigationAction } from '../contracts/events.js';
import {
  createFileReadEvent,
  createSearchEvent,
  createHypothesisEvent,
  createEvidenceEvent,
  createRejectionEvent,
  createTestCheckEvent,
  createFixProposedEvent,
} from '../contracts/events.js';

// =============================================================================
// Pattern Matchers for Claude CLI Output
// =============================================================================

/**
 * Patterns to detect file reads
 * Claude CLI shows: "Reading file: path/to/file.ts"
 */
const FILE_READ_PATTERNS = [
  /Reading (?:file:?\s*)?['"]?([^'">\n]+)['"]?/i,
  /Read tool:?\s*['"]?([^'">\n]+)['"]?/i,
  /cat ['"]?([^'">\n]+)['"]?/i,
  /Opening ['"]?([^'">\n]+)['"]?/i,
  /Examining ['"]?([^'">\n]+)['"]?/i,
];

/**
 * Patterns to detect code searches
 */
const SEARCH_PATTERNS = [
  /Searching for ['"]([^'"]+)['"]/i,
  /Grep(?:ping)? (?:for )?['"]([^'"]+)['"]/i,
  /Looking for ['"]([^'"]+)['"]/i,
  /Finding (?:all )?(?:occurrences of )?['"]([^'"]+)['"]/i,
  /rg ['"]([^'"]+)['"]/i,
];

/**
 * Patterns to detect hypothesis formation
 */
const HYPOTHESIS_PATTERNS = [
  /(?:I )?(?:think|believe|suspect) (?:that |the )?(.+?)(?:\.|$)/i,
  /(?:This |It )?(?:looks like|appears to be|seems like) (.+?)(?:\.|$)/i,
  /(?:My |The )?hypothesis[:\s]+(.+?)(?:\.|$)/i,
  /(?:The )?root cause (?:is |might be |could be )(.+?)(?:\.|$)/i,
  /(?:This |The )?bug (?:is |seems to be )(?:caused by )?(.+?)(?:\.|$)/i,
];

/**
 * Patterns to detect evidence
 */
const EVIDENCE_PATTERNS = [
  /Found[:\s]+(.+?)(?:\.|$)/i,
  /(?:I )?(?:notice|see|observe)[:\s]+(.+?)(?:\.|$)/i,
  /Evidence[:\s]+(.+?)(?:\.|$)/i,
  /(?:This |The )?(?:confirms|shows|demonstrates)[:\s]+(.+?)(?:\.|$)/i,
  /at line (\d+)/i,
];

/**
 * Patterns to detect hypothesis rejection
 */
const REJECTION_PATTERNS = [
  /(?:However|But|Actually)[,\s]+(?:this |that |it )?(?:is not|isn't|doesn't|won't) (.+?)(?:\.|$)/i,
  /(?:I )?(?:was wrong|made a mistake)[:\s]+(.+?)(?:\.|$)/i,
  /(?:This |That )?(?:doesn't|does not) (?:explain|match|fit) (.+?)(?:\.|$)/i,
  /(?:Ruling out|Rejecting)[:\s]+(.+?)(?:\.|$)/i,
];

/**
 * Patterns to detect test checking
 */
const TEST_PATTERNS = [
  /(?:Running|Checking|Looking at) (?:the )?tests?/i,
  /test(?:s)? (?:for |in |at )?['"]?([^'">\n]+)['"]?/i,
  /\.test\.(ts|js|tsx|jsx)/i,
  /\.spec\.(ts|js|tsx|jsx)/i,
  /pytest|jest|mocha|vitest/i,
];

/**
 * Patterns to detect fix proposals
 */
const FIX_PATTERNS = [
  /(?:I'll |Let me |We should )(?:change|modify|fix|update) ['"]?([^'">\n]+)['"]?/i,
  /(?:The )?fix (?:is |would be )?to (.+?)(?:\.|$)/i,
  /(?:Changing|Modifying|Updating) ['"]?([^'">\n]+)['"]?/i,
  /Edit tool:?\s*['"]?([^'">\n]+)['"]?/i,
];

// =============================================================================
// Event Parsing Functions
// =============================================================================

/**
 * Try to extract file path from text
 */
function extractFilePath(text: string): string | null {
  // Common file patterns
  const patterns = [
    /['"]([^'"]+\.[a-z]{1,4})['"]/i,            // Quoted file paths
    /(?:^|\s)([\w./\\-]+\.[a-z]{1,4})(?:\s|$)/i, // Unquoted file paths
    /(?:file|path)[:\s]+['"]?([^'">\n]+)['"]?/i, // Explicit file/path labels
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Try to extract line number from text
 */
function extractLineNumber(text: string): number | undefined {
  const match = text.match(/line[s]?\s*(\d+)/i) || text.match(/:(\d+)(?::\d+)?/);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Parse a single line of Claude CLI output for investigation markers
 */
export function parseLine(
  line: string,
  workflowId: string,
  sequence: number
): InvestigationEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Try file read patterns
  for (const pattern of FILE_READ_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const file = match[1] || extractFilePath(trimmed);
      if (file) {
        const lineNum = extractLineNumber(trimmed);
        return createFileReadEvent(workflowId, sequence, file, undefined, lineNum);
      }
    }
  }

  // Try search patterns
  for (const pattern of SEARCH_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return createSearchEvent(workflowId, sequence, match[1]);
    }
  }

  // Try hypothesis patterns
  for (const pattern of HYPOTHESIS_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const finding = match[1].substring(0, 200); // Limit length
      return createHypothesisEvent(workflowId, sequence, finding);
    }
  }

  // Try evidence patterns
  for (const pattern of EVIDENCE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const finding = match[1].substring(0, 200);
      const file = extractFilePath(trimmed);
      const lineNum = extractLineNumber(trimmed);
      return createEvidenceEvent(workflowId, sequence, finding, file || undefined, lineNum);
    }
  }

  // Try rejection patterns
  for (const pattern of REJECTION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const finding = match[1].substring(0, 200);
      return createRejectionEvent(workflowId, sequence, finding, 'Contradicting evidence found');
    }
  }

  // Try test patterns
  for (const pattern of TEST_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const file = match[1] || extractFilePath(trimmed) || 'test files';
      return createTestCheckEvent(workflowId, sequence, file);
    }
  }

  // Try fix patterns
  for (const pattern of FIX_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const file = extractFilePath(match[1]) || extractFilePath(trimmed);
      const summary = match[1].substring(0, 100);
      if (file) {
        return createFixProposedEvent(workflowId, sequence, file, summary, 'edit');
      }
    }
  }

  return null;
}

// =============================================================================
// Chunk-Based Parsing
// =============================================================================

/**
 * State for incremental parsing of Claude output
 */
export interface CaptureState {
  workflowId: string;
  buffer: string;
  sequence: number;
  events: InvestigationEvent[];
}

/**
 * Create a new capture state
 */
export function createCaptureState(workflowId: string): CaptureState {
  return {
    workflowId,
    buffer: '',
    sequence: 0,
    events: [],
  };
}

/**
 * Process a chunk of Claude CLI output.
 * Returns new events found in this chunk.
 */
export function processChunk(state: CaptureState, chunk: string): InvestigationEvent[] {
  const newEvents: InvestigationEvent[] = [];

  // Add chunk to buffer
  state.buffer += chunk;

  // Process complete lines
  const lines = state.buffer.split('\n');
  state.buffer = lines.pop() || ''; // Keep incomplete line in buffer

  for (const line of lines) {
    const event = parseLine(line, state.workflowId, ++state.sequence);
    if (event) {
      newEvents.push(event);
      state.events.push(event);
    }
  }

  return newEvents;
}

/**
 * Flush any remaining buffer content
 */
export function flushBuffer(state: CaptureState): InvestigationEvent[] {
  const newEvents: InvestigationEvent[] = [];

  if (state.buffer.trim()) {
    const event = parseLine(state.buffer, state.workflowId, ++state.sequence);
    if (event) {
      newEvents.push(event);
      state.events.push(event);
    }
    state.buffer = '';
  }

  return newEvents;
}

// =============================================================================
// Tool Call Parsing (JSON format)
// =============================================================================

/**
 * Tool call structure from Claude CLI
 */
interface ToolCall {
  name: string;
  parameters: Record<string, unknown>;
}

/**
 * Try to parse tool calls from JSON-formatted Claude output
 */
export function parseToolCalls(text: string): ToolCall[] {
  const toolCalls: ToolCall[] = [];

  // Pattern for tool call JSON
  // Claude often outputs: {"name": "Read", "parameters": {"file_path": "..."}}
  const toolCallPattern = /\{"name":\s*"(\w+)",\s*"parameters":\s*(\{[^}]+\})\}/g;

  let match;
  while ((match = toolCallPattern.exec(text)) !== null) {
    try {
      const name = match[1];
      const params = JSON.parse(match[2]);
      toolCalls.push({ name, parameters: params });
    } catch {
      // Invalid JSON, skip
    }
  }

  return toolCalls;
}

/**
 * Convert tool calls to investigation events
 */
export function toolCallsToEvents(
  toolCalls: ToolCall[],
  workflowId: string,
  startSequence: number
): InvestigationEvent[] {
  const events: InvestigationEvent[] = [];
  let sequence = startSequence;

  for (const call of toolCalls) {
    switch (call.name) {
      case 'Read':
        if (call.parameters.file_path) {
          events.push(createFileReadEvent(
            workflowId,
            ++sequence,
            String(call.parameters.file_path),
            call.parameters.limit as number | undefined,
            call.parameters.offset as number | undefined
          ));
        }
        break;

      case 'Grep':
      case 'Glob':
        if (call.parameters.pattern || call.parameters.query) {
          events.push(createSearchEvent(
            workflowId,
            ++sequence,
            String(call.parameters.pattern || call.parameters.query)
          ));
        }
        break;

      case 'Edit':
      case 'Write':
        if (call.parameters.file_path) {
          events.push(createFixProposedEvent(
            workflowId,
            ++sequence,
            String(call.parameters.file_path),
            call.name === 'Edit' ? 'Editing file' : 'Writing file',
            call.name === 'Edit' ? 'edit' : 'add'
          ));
        }
        break;

      case 'Bash':
        // Check if it's a test command
        const cmd = String(call.parameters.command || '');
        if (/test|pytest|jest|mocha|vitest|npm run test|cargo test/.test(cmd)) {
          events.push(createTestCheckEvent(workflowId, ++sequence, cmd));
        }
        break;
    }
  }

  return events;
}

// =============================================================================
// Complete Analysis Parser
// =============================================================================

/**
 * Parse a complete Claude CLI output for investigation events
 */
export function parseCompleteOutput(
  output: string,
  workflowId: string
): InvestigationEvent[] {
  const events: InvestigationEvent[] = [];
  let sequence = 0;

  // First, try to extract tool calls from JSON
  const toolCalls = parseToolCalls(output);
  if (toolCalls.length > 0) {
    const toolEvents = toolCallsToEvents(toolCalls, workflowId, sequence);
    events.push(...toolEvents);
    sequence += toolEvents.length;
  }

  // Then, parse line by line for reasoning markers
  const lines = output.split('\n');
  for (const line of lines) {
    const event = parseLine(line, workflowId, ++sequence);
    if (event) {
      // Avoid duplicates from tool call parsing
      const isDuplicate = events.some(
        (e) =>
          e.action === event.action &&
          e.details.file === event.details.file &&
          e.details.query === event.details.query
      );
      if (!isDuplicate) {
        events.push(event);
      }
    }
  }

  return events;
}

// =============================================================================
// Export action type for type safety
// =============================================================================

export type { InvestigationAction };
