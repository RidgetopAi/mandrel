import { QueryClient } from '@tanstack/react-query';
import { AidisDbEvent, AidisEntity } from '../types/events';
import { logger } from '../utils/logger';

export type SseOptions = {
  token: string;
  projectId?: string;
  entities?: AidisEntity[];
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  queryClient: QueryClient;
};

export type SseHandle = {
  stop: () => void;
  unsupported?: boolean;
};

export function startSse(options: SseOptions): SseHandle {
  const { token, projectId, entities, onConnect, onDisconnect, onError, queryClient } = options;

  // Check browser support
  if (!('EventSource' in window)) {
    logger.warn('SSE not supported by browser');
    return { stop: () => {}, unsupported: true };
  }

  // Build URL with query params
  const params = new URLSearchParams();
  params.set('token', token);
  if (projectId) params.set('projectId', projectId);
  if (entities?.length) params.set('entities', entities.join(','));

  // Host-agnostic base URL. If REACT_APP_API_URL is configured as an absolute
  // http(s) URL, use it (stripping a trailing /api). Otherwise default to
  // same-origin: an empty base yields a relative `/api/...` URL that resolves
  // against the current origin and is routed to the backend by nginx. This lets
  // the same golden image serve any customer subdomain with zero per-instance config.
  const configuredApiUrl = process.env.REACT_APP_API_URL;
  const apiBase = configuredApiUrl && /^https?:\/\//i.test(configuredApiUrl)
    ? configuredApiUrl.replace(/\/api$/, '')
    : '';
  const url = `${apiBase}/api/events?${params.toString()}`;

  logger.log('Starting SSE connection:', { projectId, entities, url: url.replace(/token=[^&]+/, 'token=***') });
  const es = new EventSource(url);

  // Generic event handler for all entity types
  const handleEvent = (e: MessageEvent) => {
    try {
      const payload: AidisDbEvent = JSON.parse(e.data);
      logger.log('SSE event received:', payload);
      invalidateCachesForEvent(payload, queryClient);
    } catch (err) {
      logger.error('Failed to parse SSE event:', err);
    }
  };

  // Register listeners for all entity types
  const entityTypes = ['contexts', 'tasks', 'decisions', 'projects', 'sessions', 'system'];
  entityTypes.forEach(name => {
    es.addEventListener(name, handleEvent as any);
  });

  es.onopen = () => {
    logger.log('SSE connection opened');
    onConnect?.();
  };

  es.onerror = (err) => {
    logger.error('SSE connection error:', err);
    
    // EventSource will auto-reconnect, but trigger invalidation as safety
    queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    
    onError?.(err);
  };

  function stop() {
    logger.log('Stopping SSE connection');
    es.close();
    onDisconnect?.();
  }

  return { stop };
}

/**
 * Map database events to React Query cache invalidations
 */
function invalidateCachesForEvent(evt: AidisDbEvent, queryClient: QueryClient) {
  switch (evt.entity) {
    case 'tasks':
      // Invalidate all task queries
      queryClient.invalidateQueries({ 
        queryKey: ['tasks']
      });
      // Also trigger window event for non-React-Query components
      window.dispatchEvent(new CustomEvent('aidis:task-update', { detail: evt }));
      // Invalidate dashboard stats
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      break;

    case 'contexts':
      // Invalidate all context list queries (they have params in queryKey[2])
      queryClient.invalidateQueries({ 
        queryKey: ['contexts', 'list']
      });
      // Invalidate context stats
      queryClient.invalidateQueries({ 
        queryKey: ['contexts', 'stats']
      });
      // Invalidate dashboard stats
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      break;

    case 'decisions':
      // Invalidate decision queries
      queryClient.invalidateQueries({ 
        queryKey: ['decisions']
      });
      // Invalidate dashboard stats
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      break;

    case 'projects':
      // Invalidate project queries
      queryClient.invalidateQueries({ 
        queryKey: ['projects']
      });
      // Invalidate current project
      queryClient.invalidateQueries({ 
        queryKey: ['currentProject']
      });
      break;

    case 'sessions':
      // Invalidate session queries
      queryClient.invalidateQueries({ 
        queryKey: ['sessions']
      });
      break;

    default:
      logger.warn('Unknown entity type for cache invalidation:', evt.entity);
  }
}
