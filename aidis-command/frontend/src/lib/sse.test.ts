import { QueryClient } from '@tanstack/react-query';
import { startSse } from './sse';
import { AidisDbEvent } from '../types/events';

// Mock EventSource
class MockEventSource {
  url: string;
  readyState: number = 0;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  listeners: Map<string, ((event: MessageEvent) => void)[]> = new Map();

  constructor(url: string) {
    this.url = url;
    setTimeout(() => this.triggerOpen(), 0);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  close() {
    this.readyState = 2;
  }

  triggerOpen() {
    this.readyState = 1;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  triggerMessage(type: string, data: any) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const event = { data: JSON.stringify(data) } as MessageEvent;
      listeners.forEach(listener => listener(event));
    }
  }

  triggerError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

describe('SSE Client', () => {
  let queryClient: QueryClient;
  let mockEventSource: MockEventSource;
  let originalEventSource: any;
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    // Mock EventSource
    originalEventSource = (window as any).EventSource;
    (window as any).EventSource = jest.fn((url: string) => {
      mockEventSource = new MockEventSource(url);
      return mockEventSource;
    });

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock window.dispatchEvent
    jest.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    (window as any).EventSource = originalEventSource;
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('startSse()', () => {
    it('should create EventSource with correct URL and params', () => {
      startSse({
        token: 'test-token',
        projectId: 'proj-123',
        entities: ['tasks', 'contexts'],
        queryClient,
      });

      expect((window as any).EventSource).toHaveBeenCalledWith(
        expect.stringContaining('/api/events?')
      );
      const url = ((window as any).EventSource as jest.Mock).mock.calls[0][0];
      expect(url).toContain('token=test-token');
      expect(url).toContain('projectId=proj-123');
      expect(url).toContain('entities=tasks%2Ccontexts');
    });

    it('should return unsupported flag when EventSource not available', () => {
      delete (window as any).EventSource;

      const handle = startSse({
        token: 'test-token',
        queryClient,
      });

      expect(handle.unsupported).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith('SSE not supported by browser');
    });

    it('should call onConnect when connection opens', (done) => {
      const onConnect = jest.fn();

      startSse({
        token: 'test-token',
        queryClient,
        onConnect,
      });

      setTimeout(() => {
        expect(onConnect).toHaveBeenCalled();
        done();
      }, 10);
    });

    it('should register listeners for all entity types', () => {
      startSse({
        token: 'test-token',
        queryClient,
      });

      expect(mockEventSource.listeners.has('contexts')).toBe(true);
      expect(mockEventSource.listeners.has('tasks')).toBe(true);
      expect(mockEventSource.listeners.has('decisions')).toBe(true);
      expect(mockEventSource.listeners.has('projects')).toBe(true);
      expect(mockEventSource.listeners.has('sessions')).toBe(true);
      expect(mockEventSource.listeners.has('system')).toBe(true);
    });

    it('should handle task events and invalidate queries', () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      startSse({
        token: 'test-token',
        queryClient,
      });

      const taskEvent = {
        entity: 'tasks' as const,
        operation: 'update' as const,
        id: 'task-123',
        timestamp: new Date().toISOString(),
      } as AidisDbEvent;

      mockEventSource.triggerMessage('tasks', taskEvent);

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboardStats'] });
    });

    it('should dispatch custom event for task updates', () => {
      startSse({
        token: 'test-token',
        queryClient,
      });

      const taskEvent: AidisDbEvent = {
        entity: 'tasks',
        operation: 'insert',
        id: 'task-123',
        timestamp: new Date().toISOString(),
      };

      mockEventSource.triggerMessage('tasks', taskEvent);

      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'aidis:task-update',
          detail: taskEvent,
        })
      );
    });

    it('should handle context events and invalidate queries', () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      startSse({
        token: 'test-token',
        queryClient,
      });

      const contextEvent: AidisDbEvent = {
        entity: 'contexts',
        operation: 'insert',
        id: 'ctx-123',
        timestamp: new Date().toISOString(),
      };

      mockEventSource.triggerMessage('contexts', contextEvent);

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['contexts', 'list'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['contexts', 'stats'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboardStats'] });
    });

    it('should handle decision events', () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      startSse({
        token: 'test-token',
        queryClient,
      });

      const decisionEvent: AidisDbEvent = {
        entity: 'decisions',
        operation: 'update',
        id: 'dec-123',
        timestamp: new Date().toISOString(),
      };

      mockEventSource.triggerMessage('decisions', decisionEvent);

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['decisions'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboardStats'] });
    });

    it('should handle project events', () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      startSse({
        token: 'test-token',
        queryClient,
      });

      const projectEvent: AidisDbEvent = {
        entity: 'projects',
        operation: 'update',
        id: 'proj-123',
        timestamp: new Date().toISOString(),
      };

      mockEventSource.triggerMessage('projects', projectEvent);

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['currentProject'] });
    });

    it('should handle session events', () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      startSse({
        token: 'test-token',
        queryClient,
      });

      const sessionEvent: AidisDbEvent = {
        entity: 'sessions',
        operation: 'update',
        id: 'sess-123',
        timestamp: new Date().toISOString(),
      };

      mockEventSource.triggerMessage('sessions', sessionEvent);

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sessions'] });
    });

    it('should handle invalid JSON gracefully', () => {
      startSse({
        token: 'test-token',
        queryClient,
      });

      const listeners = mockEventSource.listeners.get('tasks')!;
      listeners[0]({ data: 'invalid-json{' } as MessageEvent);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to parse SSE event:',
        expect.any(Error)
      );
    });

    it('should call onError when connection error occurs', () => {
      const onError = jest.fn();

      startSse({
        token: 'test-token',
        queryClient,
        onError,
      });

      mockEventSource.triggerError();

      expect(onError).toHaveBeenCalled();
    });

    it('should invalidate dashboardStats on error', () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      startSse({
        token: 'test-token',
        queryClient,
      });

      mockEventSource.triggerError();

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboardStats'] });
    });
  });

  describe('stop()', () => {
    it('should close EventSource connection', () => {
      const handle = startSse({
        token: 'test-token',
        queryClient,
      });

      handle.stop();

      expect(mockEventSource.readyState).toBe(2); // CLOSED
    });

    it('should call onDisconnect callback', () => {
      const onDisconnect = jest.fn();

      const handle = startSse({
        token: 'test-token',
        queryClient,
        onDisconnect,
      });

      handle.stop();

      expect(onDisconnect).toHaveBeenCalled();
    });
  });

  describe('URL building', () => {
    it('should build URL without optional params', () => {
      startSse({
        token: 'test-token',
        queryClient,
      });

      const url = ((window as any).EventSource as jest.Mock).mock.calls[0][0];
      expect(url).toContain('token=test-token');
      expect(url).not.toContain('projectId');
      expect(url).not.toContain('entities');
    });

    it('should use REACT_APP_API_URL from env if available', () => {
      process.env.REACT_APP_API_URL = 'http://example.com:8080/api';

      startSse({
        token: 'test-token',
        queryClient,
      });

      const url = ((window as any).EventSource as jest.Mock).mock.calls[0][0];
      expect(url).toContain('http://example.com:8080/api/events');

      delete process.env.REACT_APP_API_URL;
    });

    it('should fall back to localhost:5000 if env not set', () => {
      delete process.env.REACT_APP_API_URL;

      startSse({
        token: 'test-token',
        queryClient,
      });

      const url = ((window as any).EventSource as jest.Mock).mock.calls[0][0];
      expect(url).toContain('http://localhost:5000/api/events');
    });
  });
});
