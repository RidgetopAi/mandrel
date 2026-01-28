/**
 * Bug Workflow SSE Stream (Phase 3 - Visibility Layer)
 *
 * Server-Sent Events endpoint for real-time investigation visibility.
 * Users can watch the AI's debugging process in real-time.
 *
 * Usage:
 *   GET /api/workflows/bug/:id/stream
 *
 * Events:
 *   - investigation: Real-time investigation steps
 *   - state_change: Workflow state transitions
 *   - analysis_complete: Analysis finished with results
 *   - implementation_complete: Implementation finished
 *   - error: Error occurred
 *   - heartbeat: Keep-alive (every 30s)
 */

import { EventEmitter } from 'events';
import type { Request, Response, Router } from 'express';
import {
  type InvestigationEvent,
  type SerializedInvestigationEvent,
  serializeEvent,
} from '../contracts/events.js';
import type {
  BugWorkflowState,
  BugAnalysis,
  ImplementationResult,
} from '../contracts/index.js';

// =============================================================================
// Event Emitter for Workflow Events
// =============================================================================

/**
 * Global event emitter for workflow events.
 * Keyed by workflowId for targeted event delivery.
 */
class WorkflowEventEmitter extends EventEmitter {
  private static instance: WorkflowEventEmitter;

  private constructor() {
    super();
    // Allow many listeners (one per SSE connection)
    this.setMaxListeners(100);
  }

  static getInstance(): WorkflowEventEmitter {
    if (!WorkflowEventEmitter.instance) {
      WorkflowEventEmitter.instance = new WorkflowEventEmitter();
    }
    return WorkflowEventEmitter.instance;
  }

  /**
   * Emit an investigation event
   */
  emitInvestigation(workflowId: string, event: InvestigationEvent): void {
    this.emit(`investigation:${workflowId}`, event);
    console.log(`[SSE] Emitted investigation event: ${workflowId} - ${event.action}`);
  }

  /**
   * Emit a state change event
   */
  emitStateChange(workflowId: string, from: BugWorkflowState, to: BugWorkflowState): void {
    this.emit(`state:${workflowId}`, { from, to, timestamp: new Date().toISOString() });
    console.log(`[SSE] Emitted state change: ${workflowId} ${from} -> ${to}`);
  }

  /**
   * Emit analysis complete event
   */
  emitAnalysisComplete(workflowId: string, analysis: BugAnalysis): void {
    this.emit(`analysis:${workflowId}`, analysis);
    console.log(`[SSE] Emitted analysis complete: ${workflowId}`);
  }

  /**
   * Emit implementation complete event
   */
  emitImplementationComplete(workflowId: string, result: ImplementationResult): void {
    this.emit(`implementation:${workflowId}`, result);
    console.log(`[SSE] Emitted implementation complete: ${workflowId}`);
  }

  /**
   * Emit error event
   */
  emitError(workflowId: string, message: string, stage: string): void {
    this.emit(`error:${workflowId}`, { message, stage });
    console.log(`[SSE] Emitted error: ${workflowId} at ${stage}`);
  }

  /**
   * Subscribe to all events for a workflow
   */
  subscribeToWorkflow(
    workflowId: string,
    handlers: {
      onInvestigation: (event: InvestigationEvent) => void;
      onStateChange: (data: { from: string; to: string; timestamp: string }) => void;
      onAnalysis: (analysis: BugAnalysis) => void;
      onImplementation: (result: ImplementationResult) => void;
      onError: (data: { message: string; stage: string }) => void;
    }
  ): () => void {
    const investigationHandler = (event: InvestigationEvent) => handlers.onInvestigation(event);
    const stateHandler = (data: { from: string; to: string; timestamp: string }) => handlers.onStateChange(data);
    const analysisHandler = (analysis: BugAnalysis) => handlers.onAnalysis(analysis);
    const implementationHandler = (result: ImplementationResult) => handlers.onImplementation(result);
    const errorHandler = (data: { message: string; stage: string }) => handlers.onError(data);

    this.on(`investigation:${workflowId}`, investigationHandler);
    this.on(`state:${workflowId}`, stateHandler);
    this.on(`analysis:${workflowId}`, analysisHandler);
    this.on(`implementation:${workflowId}`, implementationHandler);
    this.on(`error:${workflowId}`, errorHandler);

    // Return unsubscribe function
    return () => {
      this.off(`investigation:${workflowId}`, investigationHandler);
      this.off(`state:${workflowId}`, stateHandler);
      this.off(`analysis:${workflowId}`, analysisHandler);
      this.off(`implementation:${workflowId}`, implementationHandler);
      this.off(`error:${workflowId}`, errorHandler);
    };
  }
}

// Export singleton instance
export const workflowEvents = WorkflowEventEmitter.getInstance();

// =============================================================================
// SSE Response Helpers
// =============================================================================

/**
 * Write an SSE event to the response
 */
function writeSSEEvent(res: Response, eventType: string, data: unknown): void {
  const json = JSON.stringify(data);
  res.write(`event: ${eventType}\n`);
  res.write(`data: ${json}\n\n`);
}

/**
 * Active SSE connections for monitoring
 */
const activeConnections = new Map<string, Set<Response>>();

/**
 * Get count of active connections for a workflow
 */
export function getConnectionCount(workflowId: string): number {
  return activeConnections.get(workflowId)?.size || 0;
}

/**
 * Get total connection count across all workflows
 */
export function getTotalConnectionCount(): number {
  let total = 0;
  for (const connections of activeConnections.values()) {
    total += connections.size;
  }
  return total;
}

// =============================================================================
// SSE Route Handler
// =============================================================================

/**
 * SSE endpoint for streaming workflow events
 *
 * GET /api/workflows/bug/:id/stream
 *
 * Events sent to client:
 * - event: investigation, data: SerializedInvestigationEvent
 * - event: state_change, data: { from, to, timestamp }
 * - event: analysis_complete, data: BugAnalysis
 * - event: implementation_complete, data: ImplementationResult
 * - event: error, data: { message, stage }
 * - event: heartbeat, data: { timestamp }
 */
export function handleSSEStream(req: Request, res: Response): void {
  const workflowId = req.params.id;

  if (!workflowId) {
    res.status(400).json({ error: 'Missing workflow ID' });
    return;
  }

  console.log(`[SSE] Client connected to workflow: ${workflowId}`);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Track connection
  if (!activeConnections.has(workflowId)) {
    activeConnections.set(workflowId, new Set());
  }
  activeConnections.get(workflowId)!.add(res);

  // Send initial connection event
  writeSSEEvent(res, 'connected', {
    workflowId,
    timestamp: new Date().toISOString(),
    message: 'Connected to investigation stream',
  });

  // Subscribe to workflow events
  const unsubscribe = workflowEvents.subscribeToWorkflow(workflowId, {
    onInvestigation: (event) => {
      const serialized: SerializedInvestigationEvent = serializeEvent(event);
      writeSSEEvent(res, 'investigation', serialized);
    },
    onStateChange: (data) => {
      writeSSEEvent(res, 'state_change', data);
    },
    onAnalysis: (analysis) => {
      writeSSEEvent(res, 'analysis_complete', analysis);
    },
    onImplementation: (result) => {
      writeSSEEvent(res, 'implementation_complete', result);
    },
    onError: (data) => {
      writeSSEEvent(res, 'error', data);
    },
  });

  // Heartbeat to keep connection alive
  const heartbeatInterval = setInterval(() => {
    try {
      writeSSEEvent(res, 'heartbeat', { timestamp: new Date().toISOString() });
    } catch {
      // Connection closed
      clearInterval(heartbeatInterval);
    }
  }, 30000); // 30 seconds

  // Cleanup on client disconnect
  req.on('close', () => {
    console.log(`[SSE] Client disconnected from workflow: ${workflowId}`);
    clearInterval(heartbeatInterval);
    unsubscribe();
    activeConnections.get(workflowId)?.delete(res);
    if (activeConnections.get(workflowId)?.size === 0) {
      activeConnections.delete(workflowId);
    }
  });

  req.on('error', (err) => {
    console.error(`[SSE] Client error for workflow ${workflowId}:`, err);
    clearInterval(heartbeatInterval);
    unsubscribe();
    activeConnections.get(workflowId)?.delete(res);
  });
}

/**
 * Register SSE route on the bug workflow router
 */
export function registerStreamRoute(router: Router): void {
  router.get('/:id/stream', handleSSEStream);
  console.log('[SSE] Registered stream route: GET /api/workflows/bug/:id/stream');
}

// =============================================================================
// Event Emission Helpers (for use by runner/capture)
// =============================================================================

/**
 * Emit a batch of investigation events
 */
export function emitInvestigationEvents(events: InvestigationEvent[]): void {
  for (const event of events) {
    workflowEvents.emitInvestigation(event.workflowId, event);
  }
}

/**
 * Notify state change
 */
export function notifyStateChange(
  workflowId: string,
  from: BugWorkflowState,
  to: BugWorkflowState
): void {
  workflowEvents.emitStateChange(workflowId, from, to);
}

/**
 * Notify analysis complete
 */
export function notifyAnalysisComplete(workflowId: string, analysis: BugAnalysis): void {
  workflowEvents.emitAnalysisComplete(workflowId, analysis);
}

/**
 * Notify implementation complete
 */
export function notifyImplementationComplete(
  workflowId: string,
  result: ImplementationResult
): void {
  workflowEvents.emitImplementationComplete(workflowId, result);
}

/**
 * Notify error
 */
export function notifyError(workflowId: string, message: string, stage: string): void {
  workflowEvents.emitError(workflowId, message, stage);
}
