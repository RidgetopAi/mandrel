/**
 * AIDIS Real-Time Event Types (Frontend)
 * Shared event model for Server-Sent Events (SSE) implementation
 * 
 * These types define the structure of events received from the backend
 * when database records change. Events are broadcast via SSE and trigger
 * React Query cache invalidations for automatic UI updates.
 * 
 * Note: This file is kept in sync with backend/src/types/events.ts
 */

/**
 * Database entities that support real-time updates
 */
export type AidisEntity = 
  | 'contexts'      // Development contexts
  | 'tasks'         // Task management
  | 'decisions'     // Technical decisions
  | 'projects'      // Project definitions
  | 'sessions';     // Session tracking

/**
 * Database operations that trigger events
 */
export type AidisAction = 
  | 'insert'        // New record created
  | 'update'        // Existing record updated
  | 'delete';       // Record deleted

/**
 * Database event payload received from SSE
 * 
 * This is the core event structure received when database records change.
 * The payload is intentionally minimal. Use React Query to refetch full
 * record details using the provided ID.
 * 
 * @template T - Optional data payload for small updates (use sparingly)
 */
export interface AidisDbEvent<T = unknown> {
  /**
   * Entity type that changed
   */
  entity: AidisEntity;
  
  /**
   * Database operation performed
   */
  action: AidisAction;
  
  /**
   * Record ID (UUID)
   */
  id: string;
  
  /**
   * Project ID for filtering (if applicable)
   * Used to filter events by project context
   */
  projectId?: string;
  
  /**
   * Timestamp when the event occurred (ISO 8601 format)
   */
  at: string;
  
  /**
   * Optional minimal data payload
   * 
   * For most use cases, use React Query to refetch the full record.
   * This field is useful for small, frequently-accessed fields that
   * can be updated immediately without a full refetch.
   */
  data?: T;
}

/**
 * SSE subscription options
 */
export interface SseSubscriptionOptions {
  /**
   * Authentication token (JWT)
   */
  token: string;
  
  /**
   * Filter events by entity types
   * If omitted, all entity types are included
   */
  entities?: AidisEntity[];
  
  /**
   * Filter events by project ID
   * If omitted, events from all projects are included
   */
  projectId?: string;
  
  /**
   * Callback when SSE connection is established
   */
  onConnect?: () => void;
  
  /**
   * Callback when SSE connection is closed
   */
  onDisconnect?: () => void;
  
  /**
   * Callback when SSE connection error occurs
   */
  onError?: (error: Event) => void;
}

/**
 * SSE system message (non-database event)
 */
export interface SseSystemMessage {
  type: 'system';
  message: string;
  timestamp?: string;
  [key: string]: unknown;
}

/**
 * Union type for all SSE message types
 */
export type SseMessage = AidisDbEvent | SseSystemMessage;

/**
 * SSE connection handle returned by startSse()
 */
export interface SseHandle {
  /**
   * Stop the SSE connection
   */
  stop: () => void;
  
  /**
   * True if EventSource is not supported by the browser
   */
  unsupported?: boolean;
}
