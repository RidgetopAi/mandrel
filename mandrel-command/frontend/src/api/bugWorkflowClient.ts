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
  const eventSource = new EventSource(url, { withCredentials: true });

  eventSource.onopen = () => {
    handlers.onOpen?.();
  };

  eventSource.onerror = (event) => {
    handlers.onConnectionError?.(event);
  };

  eventSource.onmessage = (event) => {
    try {
      const sseEvent: SSEEvent = JSON.parse(event.data);

      switch (sseEvent.type) {
        case 'investigation':
          handlers.onInvestigation?.(
            deserializeInvestigationEvent(sseEvent.data)
          );
          break;

        case 'state_change':
          handlers.onStateChange?.(
            sseEvent.data.from,
            sseEvent.data.to,
            new Date(sseEvent.data.timestamp)
          );
          break;

        case 'analysis_complete':
          handlers.onAnalysisComplete?.(sseEvent.data);
          break;

        case 'implementation_complete':
          handlers.onImplementationComplete?.(sseEvent.data);
          break;

        case 'error':
          handlers.onError?.(sseEvent.data.message, sseEvent.data.stage);
          break;
      }
    } catch (err) {
      console.error('Failed to parse SSE event:', err);
    }
  };

  return () => {
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
