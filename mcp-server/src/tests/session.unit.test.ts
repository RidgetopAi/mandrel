/**
 * Session Management Unit Tests
 * 
 * Unit tests for individual session management functions including:
 * - SessionTracker class methods
 * - SessionManagementHandler methods
 * - Utility functions
 * - Error handling and edge cases
 * - Mock database interactions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../config/database.js';
import { SessionTracker, SessionData, SessionStats, ensureActiveSession, recordSessionOperation } from '../services/sessionTracker.js';
import { SessionManagementHandler, SessionAnalyticsHandler, getSessionStatistics, recordSessionOperation as recordAnalyticsOperation, startSessionTracking } from '../handlers/sessionAnalytics.js';
import { projectHandler } from '../handlers/project.js';

// Mock database to avoid real DB operations in unit tests
vi.mock('../config/database.js', () => ({
  db: {
    query: vi.fn()
  }
}));

const mockDb = db as any;

describe('SessionTracker Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear static state
    (SessionTracker as any).activeSessionId = null;
  });

  describe('startSession', () => {
    it('should create new session with project ID', async () => {
      const testProjectId = 'test-project-123';
      
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'session-123', started_at: new Date() }] }) // session insert
        .mockResolvedValueOnce({ rows: [] }); // analytics insert
      
      const sessionId = await SessionTracker.startSession(testProjectId);
      
      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe('string');
      expect(mockDb.query).toHaveBeenCalledTimes(2);
      
      // Verify session insert call
      const sessionCall = mockDb.query.mock.calls[0];
      expect(sessionCall[0]).toContain('INSERT INTO sessions');
      expect(sessionCall[1][1]).toBe(testProjectId);
    });

    it('should create session without project ID', async () => {
      // Mock resolveProjectForSession to return null (no project found)
      vi.spyOn(SessionTracker as any, 'resolveProjectForSession').mockResolvedValueOnce(null);

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'session-123', started_at: new Date() }] }) // session insert
        .mockResolvedValueOnce({ rows: [] }); // analytics insert

      const sessionId = await SessionTracker.startSession();

      expect(sessionId).toBeTruthy();

      // Verify project_id is null (second parameter at index 1)
      const sessionCall = mockDb.query.mock.calls[0];
      expect(sessionCall[1][1]).toBeNull();
    });

    it('should handle database errors', async () => {
      // Mock resolveProjectForSession to return null
      vi.spyOn(SessionTracker as any, 'resolveProjectForSession').mockResolvedValueOnce(null);

      // Mock database to reject on session insert
      mockDb.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(SessionTracker.startSession()).rejects.toThrow('Database error');
    });

    it('should set active session ID', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'session-123', started_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [] });
      
      const sessionId = await SessionTracker.startSession();
      const activeId = (SessionTracker as any).activeSessionId;
      
      expect(activeId).toBe(sessionId);
    });
  });

  describe('getActiveSession', () => {
    it('should return cached active session without database query', async () => {
      const cachedSessionId = 'cached-session-123';
      (SessionTracker as any).activeSessionId = cachedSessionId;

      const activeId = await SessionTracker.getActiveSession();

      expect(activeId).toBe(cachedSessionId);
      expect(mockDb.query).not.toHaveBeenCalled(); // TS003-1: No DB query for cached hits
    });

    it('should query database for active session if no cache', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'db-session-456' }] });

      const activeId = await SessionTracker.getActiveSession();

      expect(activeId).toBe('db-session-456');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringMatching(/SELECT id.*FROM sessions.*WHERE ended_at IS NULL/s)
      );
    });

    it('should return null if no active session found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const activeId = await SessionTracker.getActiveSession();

      expect(activeId).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('DB connection error'));

      const activeId = await SessionTracker.getActiveSession();

      expect(activeId).toBeNull();
    });
  });

  describe('recordOperation', () => {
    it('should record operation in analytics table', async () => {
      const sessionId = 'test-session-123';
      const operationType = 'context_creation';
      
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      
      await SessionTracker.recordOperation(sessionId, operationType);
      
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO analytics_events'),
        [
          'ai',
          sessionId,
          `session_operation_${operationType}`,
          'closed',
          ['session', 'operation', operationType]
        ]
      );
    });

    it('should not throw on database errors', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Insert failed'));
      
      // Should not throw
      await expect(SessionTracker.recordOperation('session-123', 'test_op')).resolves.toBeUndefined();
    });
  });

  describe('getSessionData', () => {
    it('should return complete session data', async () => {
      const sessionId = 'test-session-123';
      const testDate = new Date();

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: sessionId,
            started_at: testDate,
            ended_at: null,
            project_id: 'proj-123',
            title: null,
            description: null,
            session_goal: null,
            tags: null,
            lines_added: 0,
            lines_deleted: 0,
            lines_net: 0,
            productivity_score: 3.5,
            ai_model: null,
            files_modified_count: 0,
            activity_count: 5,
            status: 'active',
            last_activity_at: null,
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            contexts_created: 2,
            tasks_created: 0,
            tasks_updated: 0,
            tasks_completed: 0,
            duration_ms: 60000
          }]
        }) // session query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // decisions count

      const sessionData = await SessionTracker.getSessionData(sessionId);

      expect(sessionData).toBeTruthy();
      expect(sessionData!.session_id).toBe(sessionId);
      expect(sessionData!.start_time).toBe(testDate);
      expect(sessionData!.project_id).toBe('proj-123');
      expect(sessionData!.contexts_created).toBe(2);
      expect(sessionData!.decisions_created).toBe(1);
      expect(sessionData!.operations_count).toBe(5);
      expect(sessionData!.success_status).toBe('active');
      expect(sessionData!.productivity_score).toBe(3.5);
    });

    it('should return null for non-existent session', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // no session found
      
      const sessionData = await SessionTracker.getSessionData('invalid-session');
      
      expect(sessionData).toBeNull();
    });

    it('should calculate correct success status', async () => {
      const sessionId = 'test-session-123';
      const testDate = new Date();
      const endDate = new Date(Date.now() + 60000);

      // Test completed session
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: sessionId,
            started_at: testDate,
            ended_at: endDate,
            project_id: 'proj-123',
            title: null,
            description: null,
            session_goal: null,
            tags: null,
            lines_added: 0,
            lines_deleted: 0,
            lines_net: 0,
            productivity_score: 2.0,
            ai_model: null,
            files_modified_count: 0,
            activity_count: 3,
            status: 'active',
            last_activity_at: null,
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            contexts_created: 0,
            tasks_created: 0,
            tasks_updated: 0,
            tasks_completed: 0,
            duration_ms: 60000
          }]
        }) // session query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // decisions count

      const sessionData = await SessionTracker.getSessionData(sessionId);

      expect(sessionData!.success_status).toBe('completed');
    });

    it('should handle database errors', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Query failed'));
      
      const sessionData = await SessionTracker.getSessionData('test-session');
      
      expect(sessionData).toBeNull();
    });
  });

  describe('calculateProductivity', () => {
    it('should calculate productivity score correctly', async () => {
      const mockSessionData: SessionData = {
        session_id: 'test-123',
        start_time: new Date(),
        contexts_created: 3,
        decisions_created: 2,
        operations_count: 10,
        productivity_score: 0,
        success_status: 'active',
        status: 'active',
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        duration_ms: 3600000 // 1 hour
      };
      
      vi.spyOn(SessionTracker, 'getSessionData').mockResolvedValueOnce(mockSessionData);
      
      const productivity = await SessionTracker.calculateProductivity('test-123');
      
      // Formula: (contexts * 2 + decisions * 3) / (duration_hours + 1)
      // (3 * 2 + 2 * 3) / (1 + 1) = 12 / 2 = 6
      expect(productivity).toBe(6);
    });

    it('should return 0 for non-existent session', async () => {
      vi.spyOn(SessionTracker, 'getSessionData').mockResolvedValueOnce(null);
      
      const productivity = await SessionTracker.calculateProductivity('invalid-session');
      
      expect(productivity).toBe(0);
    });

    it('should handle missing duration gracefully', async () => {
      const mockSessionData: SessionData = {
        session_id: 'test-123',
        start_time: new Date(),
        contexts_created: 2,
        decisions_created: 1,
        operations_count: 5,
        productivity_score: 0,
        success_status: 'active',
        status: 'active',
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0
        // No duration_ms
      };
      
      vi.spyOn(SessionTracker, 'getSessionData').mockResolvedValueOnce(mockSessionData);
      
      const productivity = await SessionTracker.calculateProductivity('test-123');
      
      // Should use default duration of 1 hour: (2*2 + 1*3) / (1 + 1) = 7 / 2 = 3.5
      expect(productivity).toBe(3.5);
    });
  });

  // TS003-1: sessionExists() method removed - no longer needed with simplified logic

  describe('getSessionStats', () => {
    it('should return comprehensive session statistics', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '10' }] }) // total sessions
        .mockResolvedValueOnce({ rows: [{ avg_duration: '1800000' }] }) // avg 30min
        .mockResolvedValueOnce({ rows: [{ completed: '8' }] }) // completed sessions
        .mockResolvedValueOnce({ rows: [{ date: '2023-01-01', count: '3' }] }) // sessions by day
        .mockResolvedValueOnce({ rows: [{ avg_productivity: '4.5' }] }); // productivity
      
      const stats = await SessionTracker.getSessionStats();
      
      expect(stats.totalSessions).toBe(10);
      expect(stats.avgDuration).toBe(1800000);
      expect(stats.retentionRate).toBe(0.8); // 8/10
      expect(stats.productivityScore).toBe(4.5);
      expect(stats.sessionsByDay).toHaveLength(1);
      expect(stats.sessionsByDay[0]).toEqual({ date: '2023-01-01', count: 3 });
    });

    it('should handle project-specific statistics', async () => {
      const projectId = 'test-project-123';
      
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '5' }] })
        .mockResolvedValueOnce({ rows: [{ avg_duration: '900000' }] })
        .mockResolvedValueOnce({ rows: [{ completed: '4' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ avg_productivity: '3.2' }] });
      
      const stats = await SessionTracker.getSessionStats(projectId);
      
      expect(stats.totalSessions).toBe(5);
      
      // Verify project filter was used
      const calls = mockDb.query.mock.calls;
      calls.forEach((call: any) => {
        if (call[0].includes('WHERE')) {
          expect(call[1]).toEqual([projectId]);
        }
      });
    });

    it('should handle database errors', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Stats query failed'));
      
      await expect(SessionTracker.getSessionStats()).rejects.toThrow('Stats query failed');
    });
  });
});

describe('SessionManagementHandler Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (SessionTracker as any).activeSessionId = null;
  });

  describe('assignSessionToProject', () => {
    it('should assign session to existing project', async () => {
      const activeSessionId = 'session-123';
      const projectName = 'TestProject';
      const projectId = 'project-456';

      vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValueOnce(activeSessionId);

      // Mock projectHandler.listProjects to return the test project
      vi.spyOn(projectHandler, 'listProjects').mockResolvedValueOnce([
        { id: projectId, name: projectName, description: 'Test project', status: 'active', createdAt: new Date(), updatedAt: new Date(), gitRepoUrl: null, rootDirectory: null, metadata: {} }
      ]);

      mockDb.query.mockResolvedValueOnce({ rows: [] }); // update query

      const result = await SessionManagementHandler.assignSessionToProject(projectName);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe(activeSessionId);
      expect(result.projectName).toBe(projectName);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions SET project_id = $1'),
        [projectId, expect.any(String), activeSessionId]
      );
    });

    it('should fail when no active session exists', async () => {
      vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValueOnce(null);
      
      const result = await SessionManagementHandler.assignSessionToProject('TestProject');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('No active session found');
    });

    it('should handle non-existent project', async () => {
      vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValueOnce('session-123');

      // Mock projectHandler.listProjects to return a different project
      vi.spyOn(projectHandler, 'listProjects').mockResolvedValueOnce([
        { id: 'other-project', name: 'OtherProject', description: 'Other project', status: 'active', createdAt: new Date(), updatedAt: new Date(), gitRepoUrl: null, rootDirectory: null, metadata: {} }
      ]);

      const result = await SessionManagementHandler.assignSessionToProject('NonExistentProject');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
      expect(result.message).toContain('Available projects');
    });
  });

  describe('getSessionStatus', () => {
    it('should return detailed session status', async () => {
      const activeSessionId = 'session-123';
      const testDate = new Date();
      
      vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValueOnce(activeSessionId);
      
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: activeSessionId,
          agent_type: 'claude-code-agent',
          started_at: testDate,
          ended_at: null,
          project_id: 'project-123',
          project_name: 'TestProject',
          metadata: { title: 'Test Session' },
          contexts_count: '3',
          decisions_count: '1'
        }]
      });
      
      const result = await SessionManagementHandler.getSessionStatus();
      
      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session.id).toBe(activeSessionId);
      expect(result.session.project_name).toBe('TestProject');
      expect(result.session.contexts_created).toBe(3);
      expect(result.session.decisions_created).toBe(1);
    });

    it('should handle no active session', async () => {
      vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValueOnce(null);
      
      const result = await SessionManagementHandler.getSessionStatus();
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('No active session found');
    });
  });

  describe('createNewSession', () => {
    it('should create session with custom title and project', async () => {
      const title = 'Custom Session';
      const projectName = 'TestProject';
      const projectId = 'project-123';
      const newSessionId = 'new-session-456';

      // Mock projectHandler.listProjects to return the test project
      vi.spyOn(projectHandler, 'listProjects').mockResolvedValueOnce([
        { id: projectId, name: projectName, description: 'Test project', status: 'active', createdAt: new Date(), updatedAt: new Date(), gitRepoUrl: null, rootDirectory: null, metadata: {} }
      ]);

      vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValueOnce(null); // no current session
      vi.spyOn(SessionTracker, 'startSession').mockResolvedValueOnce(newSessionId);

      mockDb.query.mockResolvedValueOnce({ rows: [] }); // title update

      const result = await SessionManagementHandler.createNewSession(title, projectName);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe(newSessionId);
      expect(result.projectName).toBe(projectName);
      expect(result.message).toContain(title);
      expect(result.message).toContain(projectName);
    });

    it('should end existing session before creating new one', async () => {
      const currentSessionId = 'current-session-123';
      const newSessionId = 'new-session-456';

      vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValueOnce(currentSessionId);
      vi.spyOn(SessionTracker, 'startSession').mockResolvedValueOnce(newSessionId);

      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // end current session
        .mockResolvedValueOnce({ rows: [] }); // optional title update

      const result = await SessionManagementHandler.createNewSession();

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe(newSessionId);

      // Verify current session was ended with metadata merge
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE sessions.*SET ended_at = NOW().*metadata.*COALESCE/s),
        [
          expect.stringContaining('ended_reason'),
          currentSessionId
        ]
      );
    });
  });
});

describe('Utility Functions Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (SessionTracker as any).activeSessionId = null;
  });

  describe('ensureActiveSession', () => {
    it('should return existing active session', async () => {
      const existingSessionId = 'existing-123';
      vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValueOnce(existingSessionId);
      
      const sessionId = await ensureActiveSession();
      
      expect(sessionId).toBe(existingSessionId);
    });

    it('should create new session when none exists', async () => {
      const newSessionId = 'new-123';
      const projectId = 'project-456';

      vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValueOnce(null);
      vi.spyOn(SessionTracker, 'startSession').mockResolvedValueOnce(newSessionId);

      const sessionId = await ensureActiveSession(projectId);

      expect(sessionId).toBe(newSessionId);
      expect(SessionTracker.startSession).toHaveBeenCalledWith(
        projectId,
        undefined, // title
        undefined, // description
        undefined, // sessionGoal
        undefined, // tags
        undefined  // aiModel
      );
    });
  });

  describe('recordSessionOperation', () => {
    it('should record operation with existing session', async () => {
      const sessionId = 'session-123';
      const operationType = 'test_operation';
      
      vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValueOnce(sessionId);
      vi.spyOn(SessionTracker, 'recordOperation').mockResolvedValueOnce();
      
      await recordSessionOperation(operationType);
      
      expect(SessionTracker.recordOperation).toHaveBeenCalledWith(sessionId, operationType);
    });

    it('should create session if none exists', async () => {
      const newSessionId = 'new-session-123';
      const operationType = 'test_operation';
      const projectId = 'project-456';

      vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValueOnce(null);
      vi.spyOn(SessionTracker, 'startSession').mockResolvedValueOnce(newSessionId);
      vi.spyOn(SessionTracker, 'recordOperation').mockResolvedValueOnce();

      await recordSessionOperation(operationType, projectId);

      expect(SessionTracker.startSession).toHaveBeenCalledWith(
        projectId,
        undefined, // title
        undefined, // description
        undefined, // sessionGoal
        undefined, // tags
        undefined  // aiModel
      );
      expect(SessionTracker.recordOperation).toHaveBeenCalledWith(newSessionId, operationType);
    });
  });

  describe('Analytics Handler Utility Functions', () => {
    describe('getSessionStatistics', () => {
      it('should return session statistics on success', async () => {
        const mockStats: SessionStats = {
          totalSessions: 5,
          avgDuration: 1200000,
          productivityScore: 3.5,
          retentionRate: 0.8,
          sessionsByDay: []
        };
        
        vi.spyOn(SessionAnalyticsHandler, 'getSessionStats').mockResolvedValueOnce({
          success: true,
          data: mockStats,
          timestamp: new Date().toISOString()
        });
        
        const stats = await getSessionStatistics();
        
        expect(stats).toEqual(mockStats);
      });

      it('should return null on failure', async () => {
        vi.spyOn(SessionAnalyticsHandler, 'getSessionStats').mockResolvedValueOnce({
          success: false,
          error: 'Test error',
          timestamp: new Date().toISOString()
        });
        
        const stats = await getSessionStatistics();
        
        expect(stats).toBeNull();
      });
    });

    describe('recordAnalyticsOperation', () => {
      it('should return true on successful recording', async () => {
        vi.spyOn(SessionAnalyticsHandler, 'recordOperation').mockResolvedValueOnce({
          success: true,
          data: {} as SessionStats,
          timestamp: new Date().toISOString()
        });
        
        const result = await recordAnalyticsOperation('test_op', 'project-123');
        
        expect(result).toBe(true);
      });

      it('should return false on failure', async () => {
        vi.spyOn(SessionAnalyticsHandler, 'recordOperation').mockResolvedValueOnce({
          success: false,
          error: 'Recording failed',
          timestamp: new Date().toISOString()
        });
        
        const result = await recordAnalyticsOperation('test_op');
        
        expect(result).toBe(false);
      });
    });

    describe('startSessionTracking', () => {
      it('should return session ID on successful start', async () => {
        const sessionId = 'started-session-123';
        
        vi.spyOn(SessionAnalyticsHandler, 'startSession').mockResolvedValueOnce({
          success: true,
          data: {} as SessionStats,
          timestamp: new Date().toISOString()
        });
        vi.spyOn(SessionTracker, 'getActiveSession').mockResolvedValueOnce(sessionId);
        
        const result = await startSessionTracking('project-123');
        
        expect(result).toBe(sessionId);
      });

      it('should return null on failure', async () => {
        vi.spyOn(SessionAnalyticsHandler, 'startSession').mockResolvedValueOnce({
          success: false,
          error: 'Start failed',
          timestamp: new Date().toISOString()
        });
        
        const result = await startSessionTracking();
        
        expect(result).toBeNull();
      });
    });
  });
});
