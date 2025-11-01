import { QueryClient } from '@tanstack/react-query';
import { startSse, SseOptions } from './sse';
import { AidisDbEvent } from '../types/events';

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  
  url: string;
  listeners: Map<string, Set<(e: MessageEvent) => void>> = new Map();
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  readyState: number = 0;
  CONNECTING = 0;
  OPEN = 1;
  CLOSED = 2;

  constructor(url: string) {
    this.url = url;
    this.readyState = this.CONNECTING;
    MockEventSource.instances.push(this);
    
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = this.OPEN;
      this.onopen?.(new Event('open'));
    }, 0);
  }

  addEventListener(event: string, handler: (e: MessageEvent) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  removeEventListener(event: string, handler: (e: MessageEvent) => void) {
    this.listeners.get(event)?.delete(handler);
  }

  close() {
    this.readyState = this.CLOSED;
  }

  // Test helper to simulate receiving an event
  simulateEvent(eventName: string, data: any) {
    const handlers = this.listeners.get(eventName);
    if (handlers) {
      const event = new MessageEvent(eventName, {
        data: JSON.stringify(data),
      });
      handlers.forEach(handler => handler(event));
    }
  }

  // Test helper to simulate error
  simulateError() {
    this.onerror?.(new Event('error'));
  }

  static reset() {
    MockEventSource.instances = [];
  }

  static getLastInstance(): MockEventSource | undefined {
    return MockEventSource.instances[MockEventSource.instances.length - 1];
  }
}

describe('SSE Error Scenarios and Recovery (Frontend)', () => {
  let queryClient: QueryClient;
  let originalEventSource: any;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    
    originalEventSource = (window as any).EventSource;
    (window as any).EventSource = MockEventSource;
    MockEventSource.reset();

    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (window as any).EventSource = originalEventSource;
    jest.restoreAllMocks();
  });

  describe('Browser Compatibility', () => {
    it('should handle missing EventSource support gracefully', () => {
      delete (window as any).EventSource;

      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      const handle = startSse(options);

      expect(handle.unsupported).toBe(true);
      expect(console.warn).toHaveBeenCalledWith('SSE not supported by browser');
    });

    it('should return working stop function when unsupported', () => {
      delete (window as any).EventSource;

      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      const handle = startSse(options);

      expect(() => handle.stop()).not.toThrow();
    });
  });

  describe('Connection Failures', () => {
    it('should trigger onError callback on connection error', () => {
      const onError = jest.fn();

      const options: SseOptions = {
        token: 'test-token',
        queryClient,
        onError,
      };

      startSse(options);

      const es = MockEventSource.getLastInstance()!;
      es.simulateError();

      expect(onError).toHaveBeenCalled();
    });

    it('should invalidate dashboard stats on error', () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      startSse(options);

      const es = MockEventSource.getLastInstance()!;
      es.simulateError();

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['dashboardStats'],
      });
    });

    it('should log connection errors', () => {
      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      startSse(options);

      const es = MockEventSource.getLastInstance()!;
      es.simulateError();

      expect(console.error).toHaveBeenCalledWith(
        'SSE connection error:',
        expect.any(Event)
      );
    });
  });

  describe('Event Parsing Errors', () => {
    it('should handle malformed JSON in event data', () => {
      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      startSse(options);

      const es = MockEventSource.getLastInstance()!;
      
      // Manually trigger with bad JSON
      const badHandler = es.listeners.get('contexts')?.values().next().value;
      if (badHandler) {
        const badEvent = new MessageEvent('contexts', {
          data: 'not valid json {{{',
        });
        badHandler(badEvent);
      }

      expect(console.error).toHaveBeenCalledWith(
        'Failed to parse SSE event:',
        expect.any(Error)
      );
    });

    it('should continue processing after parse error', () => {
      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      startSse(options);

      const es = MockEventSource.getLastInstance()!;
      
      // Send bad event
      const badHandler = es.listeners.get('tasks')?.values().next().value;
      if (badHandler) {
        const badEvent = new MessageEvent('tasks', { data: 'bad json' });
        badHandler(badEvent);
      }

      // Send good event
      const validEvent: AidisDbEvent = {
        entity: 'tasks',
        operation: 'insert',
        id: 'task-123',
        timestamp: new Date().toISOString(),
      };

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      es.simulateEvent('tasks', validEvent);

      // Should still process valid events
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['tasks'],
      });
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate correct caches for task events', () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      startSse(options);

      const es = MockEventSource.getLastInstance()!;
      const event: AidisDbEvent = {
        entity: 'tasks',
        operation: 'update',
        id: 'task-123',
        timestamp: new Date().toISOString(),
      };

      es.simulateEvent('tasks', event);

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboardStats'] });
    });

    it('should invalidate correct caches for context events', () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      startSse(options);

      const es = MockEventSource.getLastInstance()!;
      const event: AidisDbEvent = {
        entity: 'contexts',
        operation: 'insert',
        id: 'ctx-123',
        timestamp: new Date().toISOString(),
      };

      es.simulateEvent('contexts', event);

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['contexts', 'list'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['contexts', 'stats'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboardStats'] });
    });

    it('should dispatch custom window events for task updates', () => {
      const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      startSse(options);

      const es = MockEventSource.getLastInstance()!;
      const event: AidisDbEvent = {
        entity: 'tasks',
        operation: 'update',
        id: 'task-123',
        timestamp: new Date().toISOString(),
      };

      es.simulateEvent('tasks', event);

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'aidis:task-update',
          detail: event,
        })
      );
    });

    it('should handle unknown entity types gracefully', () => {
      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      startSse(options);

      const es = MockEventSource.getLastInstance()!;
      const event: AidisDbEvent = {
        entity: 'unknown' as any,
        operation: 'insert',
        id: 'unk-123',
        timestamp: new Date().toISOString(),
      };

      expect(() => es.simulateEvent('unknown', event)).not.toThrow();
      expect(console.warn).toHaveBeenCalledWith(
        'Unknown entity type for cache invalidation:',
        'unknown'
      );
    });
  });

  describe('Connection Lifecycle', () => {
    it('should call onConnect when connection opens', (done) => {
      const onConnect = jest.fn(() => {
        expect(onConnect).toHaveBeenCalled();
        done();
      });

      const options: SseOptions = {
        token: 'test-token',
        queryClient,
        onConnect,
      };

      startSse(options);
    });

    it('should call onDisconnect when stop is called', () => {
      const onDisconnect = jest.fn();

      const options: SseOptions = {
        token: 'test-token',
        queryClient,
        onDisconnect,
      };

      const handle = startSse(options);
      handle.stop();

      expect(onDisconnect).toHaveBeenCalled();
    });

    it('should close EventSource when stop is called', () => {
      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      const handle = startSse(options);
      const es = MockEventSource.getLastInstance()!;

      handle.stop();

      expect(es.readyState).toBe(es.CLOSED);
    });
  });

  describe('URL Construction', () => {
    it('should include token in URL', () => {
      const options: SseOptions = {
        token: 'secret-token-123',
        queryClient,
      };

      startSse(options);

      const es = MockEventSource.getLastInstance()!;
      expect(es.url).toContain('token=secret-token-123');
    });

    it('should include projectId when provided', () => {
      const options: SseOptions = {
        token: 'test-token',
        projectId: 'proj-456',
        queryClient,
      };

      startSse(options);

      const es = MockEventSource.getLastInstance()!;
      expect(es.url).toContain('projectId=proj-456');
    });

    it('should include entities when provided', () => {
      const options: SseOptions = {
        token: 'test-token',
        entities: ['tasks', 'contexts'],
        queryClient,
      };

      startSse(options);

      const es = MockEventSource.getLastInstance()!;
      expect(es.url).toContain('entities=tasks%2Ccontexts');
    });

    it('should use default API URL when env var not set', () => {
      delete process.env.REACT_APP_API_URL;

      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      startSse(options);

      const es = MockEventSource.getLastInstance()!;
      expect(es.url).toContain('http://localhost:5000/api/events');
    });

    it('should strip /api from REACT_APP_API_URL', () => {
      process.env.REACT_APP_API_URL = 'http://example.com/api';

      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      startSse(options);

      const es = MockEventSource.getLastInstance()!;
      expect(es.url).toContain('http://example.com/api/events');
      expect(es.url).not.toContain('/api/api/');
    });
  });

  describe('Multiple Event Types', () => {
    it('should register listeners for all entity types', () => {
      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      startSse(options);

      const es = MockEventSource.getLastInstance()!;
      
      const expectedTypes = ['contexts', 'tasks', 'decisions', 'projects', 'sessions', 'system'];
      expectedTypes.forEach(type => {
        expect(es.listeners.has(type)).toBe(true);
      });
    });

    it('should handle events from all entity types', () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      startSse(options);

      const es = MockEventSource.getLastInstance()!;

      const events: AidisDbEvent[] = [
        { entity: 'tasks', operation: 'insert', id: 't1', timestamp: new Date().toISOString() },
        { entity: 'contexts', operation: 'update', id: 'c1', timestamp: new Date().toISOString() },
        { entity: 'decisions', operation: 'delete', id: 'd1', timestamp: new Date().toISOString() },
        { entity: 'projects', operation: 'insert', id: 'p1', timestamp: new Date().toISOString() },
        { entity: 'sessions', operation: 'update', id: 's1', timestamp: new Date().toISOString() },
      ];

      events.forEach(evt => es.simulateEvent(evt.entity, evt));

      // Each should have triggered cache invalidation
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['contexts', 'list'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['decisions'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sessions'] });
    });
  });

  describe('Logging', () => {
    it('should log connection start with redacted token', () => {
      const options: SseOptions = {
        token: 'secret-token-123',
        projectId: 'proj-456',
        entities: ['tasks'],
        queryClient,
      };

      startSse(options);

      expect(console.log).toHaveBeenCalledWith(
        'Starting SSE connection:',
        expect.objectContaining({
          projectId: 'proj-456',
          entities: ['tasks'],
          url: expect.stringMatching(/token=\*\*\*/),
        })
      );
    });

    it('should log successful connection', (done) => {
      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      startSse(options);

      setTimeout(() => {
        expect(console.log).toHaveBeenCalledWith('SSE connection opened');
        done();
      }, 10);
    });

    it('should log event reception', () => {
      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      startSse(options);

      const es = MockEventSource.getLastInstance()!;
      const event: AidisDbEvent = {
        entity: 'tasks',
        operation: 'insert',
        id: 'task-123',
        timestamp: new Date().toISOString(),
      };

      es.simulateEvent('tasks', event);

      expect(console.log).toHaveBeenCalledWith('SSE event received:', event);
    });

    it('should log disconnection', () => {
      const options: SseOptions = {
        token: 'test-token',
        queryClient,
      };

      const handle = startSse(options);
      handle.stop();

      expect(console.log).toHaveBeenCalledWith('Stopping SSE connection');
    });
  });
});
