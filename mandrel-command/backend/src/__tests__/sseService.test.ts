import { Request, Response } from 'express';
import { AidisDbEvent } from '../types/events';

let sseService: any;
let logger: any;
let mockRequest: Partial<Request>;
let mockResponse: Partial<Response>;
let mockWrite: jest.Mock;
let mockEnd: jest.Mock;
let mockFlushHeaders: jest.Mock;
let mockSetHeader: jest.Mock;

describe('SseService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.clearAllMocks();

    mockWrite = jest.fn();
    mockEnd = jest.fn();
    mockFlushHeaders = jest.fn();
    mockSetHeader = jest.fn();

    jest.doMock('../config/logger', () => ({
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    }));

    const sseModule = require('../services/sse');
    sseService = sseModule.sseService;
    logger = require('../config/logger').logger;

    mockResponse = {
      setHeader: mockSetHeader,
      flushHeaders: mockFlushHeaders,
      write: mockWrite,
      end: mockEnd,
      writableEnded: false,
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    mockRequest = {
      query: {},
      on: jest.fn(),
    } as any;
    
    (mockRequest as any).user = { id: 'user-123' };
  });

  afterEach(() => {
    sseService.disconnectAll();
    jest.useRealTimers();
  });

  describe('handleSubscribe()', () => {
    it('should successfully establish SSE connection with correct headers', () => {
      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      expect(mockSetHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockSetHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(mockSetHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(mockSetHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
      expect(mockFlushHeaders).toHaveBeenCalled();
    });

    it('should send retry hint to client', () => {
      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      expect(mockWrite).toHaveBeenCalledWith('retry: 5000\n\n');
    });

    it('should send initial connection confirmation event', () => {
      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      const writeCalls = mockWrite.mock.calls.map(call => call[0]).join('');
      expect(writeCalls).toContain('event: system');
      expect(writeCalls).toContain('"message":"connected"');
      expect(writeCalls).toContain('"userId":"user-123"');
    });

    it('should track client in active connections', () => {
      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      const stats = sseService.getStats();
      expect(stats.totalConnections).toBe(1);
    });

    it('should parse entity type filters from query param', () => {
      mockRequest.query = { entities: 'contexts,tasks' };

      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      expect(logger.info).toHaveBeenCalledWith(
        'SSE: Client connected',
        expect.objectContaining({
          entities: expect.arrayContaining(['contexts', 'tasks'])
        })
      );
    });

    it('should accept projectId from query param', () => {
      mockRequest.query = { projectId: 'proj-123' };

      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      expect(logger.info).toHaveBeenCalledWith(
        'SSE: Client connected',
        expect.objectContaining({
          projectId: 'proj-123'
        })
      );
    });

    it('should reject invalid entity types', () => {
      mockRequest.query = { entities: 'invalid,tasks' };

      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.send).toHaveBeenCalledWith('Invalid entity types: invalid');
    });

    it('should enforce maximum connections per user', () => {
      for (let i = 0; i < 5; i++) {
        const req = { ...mockRequest, on: jest.fn() };
        const res = {
          ...mockResponse,
          write: jest.fn(),
          setHeader: jest.fn(),
          flushHeaders: jest.fn(),
        };
        sseService.handleSubscribe(req as Request, res as Response);
      }

      const req6 = { ...mockRequest, on: jest.fn() };
      const res6 = {
        ...mockResponse,
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      sseService.handleSubscribe(req6 as Request, res6 as Response);

      expect(res6.status).toHaveBeenCalledWith(503);
      expect(res6.send).toHaveBeenCalledWith(
        'Too many connections. Maximum 5 connections allowed per user.'
      );
    });

    it('should handle unknown user gracefully', () => {
      const reqNoUser = { ...mockRequest, on: jest.fn() } as any;
      delete reqNoUser.user;

      sseService.handleSubscribe(reqNoUser as Request, mockResponse as Response);

      expect(logger.info).toHaveBeenCalledWith(
        'SSE: Client connected',
        expect.objectContaining({
          userId: 'unknown'
        })
      );
    });

    it('should setup heartbeat interval', () => {
      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      jest.advanceTimersByTime(15000);

      expect(mockWrite).toHaveBeenCalledWith(': keep-alive\n\n');
    });

    it('should stop heartbeat when connection ends', () => {
      const onMock = jest.fn();
      mockRequest.on = onMock;

      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      const closeHandler = onMock.mock.calls.find(
        ([event]: [string]) => event === 'close'
      )?.[1];

      (mockResponse as any).writableEnded = true;
      jest.advanceTimersByTime(15000);

      const writeCallsBefore = mockWrite.mock.calls.length;
      closeHandler?.();

      jest.advanceTimersByTime(15000);
      const writeCallsAfter = mockWrite.mock.calls.length;

      expect(writeCallsAfter).toBe(writeCallsBefore);
    });

    it('should remove client on disconnect', () => {
      const onMock = jest.fn();
      mockRequest.on = onMock;

      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      expect(sseService.getStats().totalConnections).toBe(1);

      const closeHandler = onMock.mock.calls.find(
        ([event]: [string]) => event === 'close'
      )?.[1];

      closeHandler?.();

      expect(sseService.getStats().totalConnections).toBe(0);
    });

    it('should log connection duration on disconnect', () => {
      const onMock = jest.fn();
      mockRequest.on = onMock;

      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      jest.advanceTimersByTime(30000);

      const closeHandler = onMock.mock.calls.find(
        ([event]: [string]) => event === 'close'
      )?.[1];

      closeHandler?.();

      expect(logger.info).toHaveBeenCalledWith(
        'SSE: Client disconnected',
        expect.objectContaining({
          userId: 'user-123',
          connectionDurationMs: expect.any(Number),
          totalConnections: 0
        })
      );
    });

    it('should handle heartbeat write failure', () => {
      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      mockWrite.mockImplementationOnce(() => {
        throw new Error('Write failed');
      });

      jest.advanceTimersByTime(15000);

      expect(logger.warn).toHaveBeenCalledWith(
        'SSE: Heartbeat write failed',
        expect.objectContaining({ userId: 'user-123' })
      );

      expect(sseService.getStats().totalConnections).toBe(0);
    });
  });

  describe('broadcastDbEvent()', () => {
    beforeEach(() => {
      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);
      jest.clearAllMocks();
    });

    it('should broadcast event to all connected clients', () => {
      const event: AidisDbEvent = {
        entity: 'contexts',
        action: 'insert',
        id: 'ctx-123',
        projectId: 'proj-123',
        at: new Date().toISOString(),
      };

      sseService.broadcastDbEvent(event);

      const writeCalls = mockWrite.mock.calls.map(call => call[0]).join('');
      expect(writeCalls).toContain('event: contexts');
      expect(writeCalls).toContain('"action":"insert"');
      expect(writeCalls).toContain('"id":"ctx-123"');
    });

    it('should filter events by entity type when client subscribes to specific entities', () => {
      const req2 = {
        ...mockRequest,
        query: { entities: 'tasks' },
        on: jest.fn(),
      } as any;
      (req2 as any).user = { id: 'user-456' };
      
      const res2 = {
        ...mockResponse,
        write: jest.fn(),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
      };

      sseService.handleSubscribe(req2 as Request, res2 as Response);
      jest.clearAllMocks();

      const contextEvent: AidisDbEvent = {
        entity: 'contexts',
        action: 'insert',
        id: 'ctx-123',
        at: new Date().toISOString(),
      };

      sseService.broadcastDbEvent(contextEvent);

      expect(mockWrite).toHaveBeenCalled();
      expect(res2.write).not.toHaveBeenCalled();
    });

    it('should filter events by project ID when specified', () => {
      const req2 = {
        ...mockRequest,
        query: { projectId: 'proj-456' },
        on: jest.fn(),
      } as any;
      (req2 as any).user = { id: 'user-456' };
      
      const res2 = {
        ...mockResponse,
        write: jest.fn(),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
      };

      sseService.handleSubscribe(req2 as Request, res2 as Response);
      jest.clearAllMocks();

      const event: AidisDbEvent = {
        entity: 'contexts',
        action: 'insert',
        id: 'ctx-123',
        projectId: 'proj-123',
        at: new Date().toISOString(),
      };

      sseService.broadcastDbEvent(event);

      expect(mockWrite).toHaveBeenCalled();
      expect(res2.write).not.toHaveBeenCalled();
    });

    it('should send event to clients without projectId filter even if event has projectId', () => {
      const event: AidisDbEvent = {
        entity: 'contexts',
        action: 'insert',
        id: 'ctx-123',
        projectId: 'proj-123',
        at: new Date().toISOString(),
      };

      sseService.broadcastDbEvent(event);

      expect(mockWrite).toHaveBeenCalled();
    });

    it('should broadcast to multiple matching clients', () => {
      const req2 = {
        ...mockRequest,
        query: {},
        on: jest.fn(),
      } as any;
      (req2 as any).user = { id: 'user-456' };
      
      const res2 = {
        ...mockResponse,
        write: jest.fn(),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
      };

      sseService.handleSubscribe(req2 as Request, res2 as Response);
      jest.clearAllMocks();

      const event: AidisDbEvent = {
        entity: 'tasks',
        action: 'update',
        id: 'task-123',
        at: new Date().toISOString(),
      };

      sseService.broadcastDbEvent(event);

      expect(mockWrite).toHaveBeenCalled();
      expect(res2.write).toHaveBeenCalled();
    });

    it('should log broadcast statistics', () => {
      const event: AidisDbEvent = {
        entity: 'contexts',
        action: 'insert',
        id: 'ctx-123',
        at: new Date().toISOString(),
      };

      sseService.broadcastDbEvent(event);

      expect(logger.debug).toHaveBeenCalledWith(
        'SSE: Broadcast complete',
        expect.objectContaining({
          entity: 'contexts',
          action: 'insert',
          id: 'ctx-123',
          sent: 1,
          filtered: 0,
          total: 1
        })
      );
    });

    it('should handle write errors gracefully and remove failed client', () => {
      mockWrite.mockImplementationOnce(() => {
        throw new Error('Write failed');
      });

      const event: AidisDbEvent = {
        entity: 'contexts',
        action: 'insert',
        id: 'ctx-123',
        at: new Date().toISOString(),
      };

      sseService.broadcastDbEvent(event);

      expect(logger.warn).toHaveBeenCalledWith(
        'SSE: Failed to write event',
        expect.objectContaining({
          error: 'Write failed',
          userId: 'user-123',
          eventName: 'contexts'
        })
      );

      expect(sseService.getStats().totalConnections).toBe(0);
    });

    it('should assign incremental event IDs', () => {
      const event1: AidisDbEvent = {
        entity: 'contexts',
        action: 'insert',
        id: 'ctx-1',
        at: new Date().toISOString(),
      };

      const event2: AidisDbEvent = {
        entity: 'tasks',
        action: 'update',
        id: 'task-1',
        at: new Date().toISOString(),
      };

      sseService.broadcastDbEvent(event1);
      sseService.broadcastDbEvent(event2);

      const writeCalls = mockWrite.mock.calls.map(call => call[0]);
      const idMatches = writeCalls.filter(call => call.startsWith('id: '));
      
      expect(idMatches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getStats()', () => {
    it('should return accurate connection count', () => {
      expect(sseService.getStats().totalConnections).toBe(0);

      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      expect(sseService.getStats().totalConnections).toBe(1);
    });

    it('should group connections by user', () => {
      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      const req2 = {
        ...mockRequest,
        on: jest.fn(),
      } as any;
      (req2 as any).user = { id: 'user-456' };
      
      const res2 = {
        ...mockResponse,
        write: jest.fn(),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
      };

      sseService.handleSubscribe(req2 as Request, res2 as Response);

      const stats = sseService.getStats();
      expect(stats.connectionsByUser).toEqual({
        'user-123': 1,
        'user-456': 1,
      });
    });

    it('should track next event ID', () => {
      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      const statsBefore = sseService.getStats();
      const nextIdBefore = statsBefore.nextEventId;

      const event: AidisDbEvent = {
        entity: 'contexts',
        action: 'insert',
        id: 'ctx-123',
        at: new Date().toISOString(),
      };

      sseService.broadcastDbEvent(event);

      const statsAfter = sseService.getStats();
      expect(statsAfter.nextEventId).toBeGreaterThan(nextIdBefore);
    });

    it('should include uptime in stats', () => {
      const stats = sseService.getStats();
      expect(stats.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getClients()', () => {
    it('should return detailed client information', () => {
      mockRequest.query = { 
        projectId: 'proj-123',
        entities: 'contexts,tasks'
      };

      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      const clients = sseService.getClients();

      expect(clients).toHaveLength(1);
      expect(clients[0]).toEqual({
        userId: 'user-123',
        projectId: 'proj-123',
        entities: expect.arrayContaining(['contexts', 'tasks']),
        connectedAt: expect.any(String),
        connectionDurationMs: expect.any(Number)
      });
    });

    it('should return empty array when no clients connected', () => {
      const clients = sseService.getClients();
      expect(clients).toEqual([]);
    });

    it('should track connection duration accurately', () => {
      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      jest.advanceTimersByTime(5000);

      const clients = sseService.getClients();
      expect(clients[0].connectionDurationMs).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('disconnectAll()', () => {
    it('should disconnect all active clients', () => {
      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      const req2 = {
        ...mockRequest,
        on: jest.fn(),
      } as any;
      (req2 as any).user = { id: 'user-456' };
      
      const res2 = {
        ...mockResponse,
        write: jest.fn(),
        end: jest.fn(),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
      };

      sseService.handleSubscribe(req2 as Request, res2 as Response);

      expect(sseService.getStats().totalConnections).toBe(2);

      sseService.disconnectAll();

      expect(mockEnd).toHaveBeenCalled();
      expect(res2.end).toHaveBeenCalled();
      expect(sseService.getStats().totalConnections).toBe(0);
    });

    it('should send shutdown message before disconnecting', () => {
      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);
      jest.clearAllMocks();

      sseService.disconnectAll();

      const writeCalls = mockWrite.mock.calls.map(call => call[0]).join('');
      expect(writeCalls).toContain('event: system');
      expect(writeCalls).toContain('"message":"server-shutdown"');
    });

    it('should handle errors during disconnect gracefully', () => {
      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      mockWrite.mockImplementationOnce(() => {
        throw new Error('Write failed');
      });

      expect(() => sseService.disconnectAll()).not.toThrow();
    });

    it('should clear all clients after disconnect', () => {
      sseService.handleSubscribe(mockRequest as Request, mockResponse as Response);

      sseService.disconnectAll();

      expect(sseService.getStats().totalConnections).toBe(0);
      expect(sseService.getClients()).toEqual([]);
    });
  });
});
