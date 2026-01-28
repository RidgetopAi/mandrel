/**
 * Bug Workflow API Client
 *
 * Typed API client for bug workflow operations with SSE streaming support.
 */

import type {
  CreateBugWorkflowRequest,
  CreateBugWorkflowResponse,
  GetWorkflowResponse,
  SubmitReviewRequest,
  SubmitReviewResponse,
  TriggerImplementRequest,
  TriggerImplementResponse,
  ErrorResponse,
  SSEEvent,
  InvestigationEvent,
  SerializedInvestigationEvent,
  BugAnalysis,
  ImplementationResult,
} from '../types/workflow';

const API_BASE = '/api/workflows/bug';

type ApiResponse<T> = T | ErrorResponse;

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();

  if (!response.ok || data.success === false) {
    const errorData = data as ErrorResponse;
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }

  return data as T;
}

/**
 * Create a new bug workflow
 */
export async function createBugWorkflow(
  request: CreateBugWorkflowRequest
): Promise<CreateBugWorkflowResponse> {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(request),
  });

  return handleResponse<CreateBugWorkflowResponse>(response);
}

/**
 * Get workflow state by ID
 */
export async function getWorkflow(workflowId: string): Promise<GetWorkflowResponse> {
  const response = await fetch(`${API_BASE}/${workflowId}`, {
    method: 'GET',
    credentials: 'include',
  });

  return handleResponse<GetWorkflowResponse>(response);
}

/**
 * Submit workflow for analysis
 * Transitions from draft -> analyzing and triggers AI analysis
 */
export async function submitWorkflow(workflowId: string): Promise<GetWorkflowResponse> {
  const response = await fetch(`${API_BASE}/${workflowId}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  return handleResponse<GetWorkflowResponse>(response);
}

/**
 * Submit a review decision
 */
export async function submitReview(
  workflowId: string,
  request: SubmitReviewRequest
): Promise<SubmitReviewResponse> {
  const response = await fetch(`${API_BASE}/${workflowId}/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(request),
  });

  return handleResponse<SubmitReviewResponse>(response);
}

/**
 * Trigger implementation of approved changes
 */
export async function triggerImplementation(
  workflowId: string,
  request: TriggerImplementRequest
): Promise<TriggerImplementResponse> {
  const response = await fetch(`${API_BASE}/${workflowId}/implement`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(request),
  });

  return handleResponse<TriggerImplementResponse>(response);
}

// =============================================================================
// SSE Streaming
// =============================================================================

function deserializeInvestigationEvent(
  data: SerializedInvestigationEvent
): InvestigationEvent {
  return {
    ...data,
    timestamp: new Date(data.timestamp),
  };
}

export interface SSEHandlers {
  onInvestigation?: (event: InvestigationEvent) => void;
  onStateChange?: (from: string, to: string, timestamp: Date) => void;
  onAnalysisComplete?: (analysis: BugAnalysis) => void;
  onImplementationComplete?: (result: ImplementationResult) => void;
  onError?: (message: string, stage: string) => void;
  onConnectionError?: (error: Event) => void;
  onOpen?: () => void;
}

/**
 * Subscribe to workflow events via SSE
 *
 * @param workflowId - The workflow ID to subscribe to
 * @param handlers - Event handlers for different event types
 * @returns A function to close the connection
 */
export function subscribeToWorkflowEvents(
  workflowId: string,
  handlers: SSEHandlers
): () => void {
  const url = `${API_BASE}/${workflowId}/stream`;
  console.log('[SSE] Creating EventSource for:', url);
  const eventSource = new EventSource(url, { withCredentials: true });

  eventSource.onopen = () => {
    console.log('[SSE] Connection opened');
    handlers.onOpen?.();
  };

  eventSource.onerror = (event) => {
    console.error('[SSE] Connection error:', event);
    handlers.onConnectionError?.(event);
  };

  // Listen for named SSE events (backend sends: event: <type>\ndata: <json>)
  const handleEvent = (eventType: string) => (event: MessageEvent) => {
    console.log(`[SSE] Received event: ${eventType}`, event.data);
    try {
      const data = JSON.parse(event.data);

      switch (eventType) {
        case 'connected':
          console.log('[SSE] Server confirmed connection');
          break;

        case 'investigation':
          handlers.onInvestigation?.(deserializeInvestigationEvent(data));
          break;

        case 'state_change':
          console.log('[SSE] State change:', data.from, '->', data.to);
          handlers.onStateChange?.(
            data.from,
            data.to,
            new Date(data.timestamp)
          );
          break;

        case 'analysis_complete':
          console.log('[SSE] Analysis complete');
          handlers.onAnalysisComplete?.(data);
          break;

        case 'implementation_complete':
          console.log('[SSE] Implementation complete');
          handlers.onImplementationComplete?.(data);
          break;

        case 'workflow_error':
          // Note: 'error' is reserved by EventSource, so we use 'workflow_error'
          console.log('[SSE] Workflow error:', data.message, data.stage);
          handlers.onError?.(data.message, data.stage);
          break;
      }
    } catch (err) {
      console.error(`[SSE] Failed to parse event (${eventType}):`, err, event.data);
    }
  };

  // Register listeners for each named event type
  // Note: 'error' is a reserved EventSource event, so backend sends 'workflow_error'
  eventSource.addEventListener('connected', handleEvent('connected'));
  eventSource.addEventListener('investigation', handleEvent('investigation'));
  eventSource.addEventListener('state_change', handleEvent('state_change'));
  eventSource.addEventListener('analysis_complete', handleEvent('analysis_complete'));
  eventSource.addEventListener('implementation_complete', handleEvent('implementation_complete'));
  eventSource.addEventListener('workflow_error', handleEvent('workflow_error'));

  return () => {
    console.log('[SSE] Closing connection');
    eventSource.close();
  };
}

/**
 * Hook-friendly wrapper for SSE subscription
 */
export function createWorkflowEventSource(workflowId: string) {
  let cleanup: (() => void) | null = null;

  return {
    subscribe: (handlers: SSEHandlers) => {
      cleanup = subscribeToWorkflowEvents(workflowId, handlers);
    },
    unsubscribe: () => {
      cleanup?.();
      cleanup = null;
    },
  };
}
