/**
 * Workflow SSE Service (Singleton)
 *
 * Manages SSE connections OUTSIDE of React's component lifecycle.
 * This service survives component unmounts, re-renders, and React Strict Mode.
 *
 * Architecture:
 *   SSE Service (this) → Zustand Store → React Components
 *
 * The service:
 * - Creates and manages EventSource connections
 * - Updates Zustand store directly when events arrive
 * - Lives for the entire application lifetime
 * - Is NOT affected by React component lifecycle
 */

import { useBugWorkflowStore, registerSSECleanup } from '../stores/bugWorkflowStore';
import type {
  BugWorkflowState,
  InvestigationEvent,
  SerializedInvestigationEvent,
  BugAnalysis,
  ImplementationResult,
} from '../types/workflow';

const API_BASE = '/api/workflows/bug';

/**
 * Deserialize investigation event from SSE
 */
function deserializeInvestigationEvent(
  data: SerializedInvestigationEvent
): InvestigationEvent {
  return {
    ...data,
    timestamp: new Date(data.timestamp),
  };
}

/**
 * Connection state for a single workflow
 */
interface WorkflowConnection {
  eventSource: EventSource;
  workflowId: string;
  connectedAt: Date;
}

/**
 * Singleton SSE Service
 *
 * Usage:
 *   workflowSSE.subscribe('workflow-id');  // Start listening
 *   workflowSSE.unsubscribe('workflow-id'); // Stop listening
 *   workflowSSE.unsubscribeAll();           // Cleanup all
 */
class WorkflowSSEService {
  private connections = new Map<string, WorkflowConnection>();
  private debug = true; // Enable console logging

  private log(message: string, ...args: unknown[]) {
    if (this.debug) {
      console.log(`[WorkflowSSE] ${message}`, ...args);
    }
  }

  /**
   * Subscribe to SSE events for a workflow.
   * Safe to call multiple times - will not create duplicate connections.
   */
  subscribe(workflowId: string): void {
    // Already connected?
    if (this.connections.has(workflowId)) {
      this.log(`Already subscribed to ${workflowId}`);
      return;
    }

    const url = `${API_BASE}/${workflowId}/stream`;
    this.log(`Subscribing to ${workflowId}`, url);

    const eventSource = new EventSource(url, { withCredentials: true });
    const store = useBugWorkflowStore.getState();

    // Track connection
    this.connections.set(workflowId, {
      eventSource,
      workflowId,
      connectedAt: new Date(),
    });

    // Update store streaming state
    store.setStreaming(true);

    // --- Event Handlers ---

    eventSource.onopen = () => {
      this.log(`Connection opened for ${workflowId}`);
      useBugWorkflowStore.getState().setStreaming(true);
    };

    eventSource.onerror = (event) => {
      this.log(`Connection error for ${workflowId}`, event);
      // Don't close on error - EventSource will auto-reconnect
      // Only update streaming state if connection is truly dead
      if (eventSource.readyState === EventSource.CLOSED) {
        this.log(`Connection closed for ${workflowId}`);
        useBugWorkflowStore.getState().setStreaming(false);
        this.connections.delete(workflowId);
      }
    };

    // Named event: connected
    eventSource.addEventListener('connected', (event: MessageEvent) => {
      this.log(`Server confirmed connection for ${workflowId}`);
    });

    // Named event: investigation
    eventSource.addEventListener('investigation', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        this.log(`Investigation event for ${workflowId}`, data.action);
        useBugWorkflowStore.getState().addInvestigationEvent(
          deserializeInvestigationEvent(data)
        );
      } catch (err) {
        this.log(`Failed to parse investigation event`, err);
      }
    });

    // Named event: state_change
    eventSource.addEventListener('state_change', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        this.log(`State change for ${workflowId}: ${data.from} -> ${data.to}`);
        useBugWorkflowStore.getState().updateWorkflowState(data.to as BugWorkflowState);

        // Auto-cleanup on terminal states
        if (data.to === 'completed' || data.to === 'failed') {
          this.log(`Terminal state reached, will cleanup after delay`);
          // Delay cleanup to ensure all events are processed
          setTimeout(() => this.unsubscribe(workflowId), 1000);
        }
      } catch (err) {
        this.log(`Failed to parse state_change event`, err);
      }
    });

    // Named event: analysis_complete
    eventSource.addEventListener('analysis_complete', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as BugAnalysis;
        this.log(`Analysis complete for ${workflowId}`);
        const store = useBugWorkflowStore.getState();
        store.setAnalysis(data);
        store.updateWorkflowState('proposed');
      } catch (err) {
        this.log(`Failed to parse analysis_complete event`, err);
      }
    });

    // Named event: implementation_complete
    eventSource.addEventListener('implementation_complete', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as ImplementationResult;
        this.log(`Implementation complete for ${workflowId}`, data.success);
        const store = useBugWorkflowStore.getState();
        store.setImplementation(data);
        store.updateWorkflowState(data.success ? 'completed' : 'failed');
      } catch (err) {
        this.log(`Failed to parse implementation_complete event`, err);
      }
    });

    // Named event: workflow_error (not 'error' - that's reserved)
    eventSource.addEventListener('workflow_error', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        this.log(`Workflow error for ${workflowId}: ${data.stage} - ${data.message}`);
        const store = useBugWorkflowStore.getState();
        store.setError(`${data.stage}: ${data.message}`);
        store.updateWorkflowState('failed');
      } catch (err) {
        this.log(`Failed to parse workflow_error event`, err);
      }
    });

    // Named event: heartbeat
    eventSource.addEventListener('heartbeat', (event: MessageEvent) => {
      this.log(`Heartbeat for ${workflowId}`);
    });
  }

  /**
   * Unsubscribe from a specific workflow
   */
  unsubscribe(workflowId: string): void {
    const connection = this.connections.get(workflowId);
    if (connection) {
      this.log(`Unsubscribing from ${workflowId}`);
      connection.eventSource.close();
      this.connections.delete(workflowId);

      // Update streaming state if no more connections
      if (this.connections.size === 0) {
        useBugWorkflowStore.getState().setStreaming(false);
      }
    }
  }

  /**
   * Unsubscribe from all workflows
   */
  unsubscribeAll(): void {
    this.log(`Unsubscribing from all (${this.connections.size} connections)`);
    for (const [workflowId] of this.connections) {
      this.unsubscribe(workflowId);
    }
  }

  /**
   * Check if subscribed to a workflow
   */
  isSubscribed(workflowId: string): boolean {
    return this.connections.has(workflowId);
  }

  /**
   * Get connection count (for debugging)
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get all active workflow IDs (for debugging)
   */
  getActiveWorkflows(): string[] {
    return Array.from(this.connections.keys());
  }
}

// Export singleton instance
export const workflowSSE = new WorkflowSSEService();

// Register cleanup with the store so reset() closes SSE connections
registerSSECleanup(() => workflowSSE.unsubscribeAll());

// Also export for direct access in dev tools
if (typeof window !== 'undefined') {
  (window as any).workflowSSE = workflowSSE;
}
