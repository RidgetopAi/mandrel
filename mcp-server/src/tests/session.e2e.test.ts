/**
 * Session Management E2E Tests
 * 
 * Comprehensive end-to-end testing of session functionality including:
 * - Session lifecycle management
 * - Project assignment and switching
 * - Analytics event tracking
 * - Session status and data retrieval
 * - Error handling and edge cases
 */

import { describe, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../config/database.js';
import { SessionTracker } from '../services/sessionTracker.js';
import { projectHandler } from '../handlers/project.js';
import { SessionManagementHandler } from '../handlers/sessionAnalytics.js';

describe('Session Management E2E Tests', () => {
  let testProjectId: string;
  let testProjectName: string;
  let originalActiveSession: string | null = null;
  // SessionManagementHandler is imported but not used in current test implementation
  
  beforeAll(async () => {
    // Store original active session to restore later
    originalActiveSession = await SessionTracker.getActiveSession();
    
    // Create test project
    testProjectName = 'QA-Test-Session-' + Date.now();
    const project = await projectHandler.createProject({
      name: testProjectName,
      description: 'Test project for session management'
    });
    testProjectId = project.id;
    // Note: SessionManagementHandler instantiation removed as it's not used in current tests
    
    console.log(`Created test project: ${testProjectName} (${testProjectId})`);
  });

  afterAll(async () => {
    try {
      // Clean up ALL test sessions by UUID pattern (catches failed test sessions)
      // Pattern matches timestamp-based UUIDs: xxxxxxxx-4123-4123-8123-xxxxxxxxxxxx
      await db.query(`
        DELETE FROM analytics_events
        WHERE session_id IN (
          SELECT id FROM sessions
          WHERE id::text LIKE '%-4123-4123-8123-%'
        )
      `);
      await db.query(`
        DELETE FROM sessions
        WHERE id::text LIKE '%-4123-4123-8123-%'
      `);

      // Clean up test project and all related data
      await db.query('DELETE FROM analytics_events WHERE project_id = $1', [testProjectId]);
      await db.query('DELETE FROM contexts WHERE project_id = $1', [testProjectId]);
      await db.query('DELETE FROM technical_decisions WHERE project_id = $1', [testProjectId]);
      await db.query('DELETE FROM sessions WHERE project_id = $1', [testProjectId]);
      await db.query('DELETE FROM projects WHERE id = $1', [testProjectId]);

      console.log(`✅ Cleaned up test project: ${testProjectName}`);

      // Restore original active session
      if (originalActiveSession) {
        (SessionTracker as any).activeSessionId = originalActiveSession;
      }
    } catch (error) {
      console.error('❌ Cleanup error:', error);
    } finally {
      await db.end();
    }
  });

  beforeEach(() => {
    // Clear any cached active session between tests
    (SessionTracker as any).activeSessionId = null;
  });

  test('new session is auto-assigned to project', async () => {
    let sessionId: string | undefined;

    try {
      sessionId = await SessionTracker.startSession(testProjectId);
      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe('string');

      const { rows } = await db.query('SELECT project_id FROM sessions WHERE id = $1', [sessionId]);
      expect(rows).toHaveLength(1);
      expect(rows[0].project_id).toBe(testProjectId);
    } finally {
      // Clean up this test session
      if (sessionId) {
        await db.query('DELETE FROM analytics_events WHERE session_id = $1', [sessionId]);
        await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      }
    }
  });

  test('session without project defaults to unassigned', async () => {
    let sessionId: string | undefined;

    try {
      sessionId = await SessionTracker.startSession(); // No project_id
      expect(sessionId).toBeTruthy();

      const { rows } = await db.query('SELECT project_id FROM sessions WHERE id = $1', [sessionId]);
      expect(rows).toHaveLength(1);
      expect(rows[0].project_id).toBe('4afb236c-00d7-433d-87de-0f489b96acb2'); // aidis-bootstrap default
    } finally {
      // Clean up
      if (sessionId) {
        await db.query('DELETE FROM analytics_events WHERE session_id = $1', [sessionId]);
        await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      }
    }
  });

  test('session_assign tool works correctly', async () => {
    let sessionId: string | undefined;

    try {
      sessionId = await SessionTracker.startSession(); // No project initially

      const result = await SessionManagementHandler.assignSessionToProject(testProjectName);

      expect(result.success).toBeTruthy();
      expect(result.sessionId).toBe(sessionId);
      expect(result.projectName).toBe(testProjectName);

      // Verify assignment in database
      const { rows } = await db.query('SELECT project_id FROM sessions WHERE id = $1', [sessionId]);
      expect(rows[0].project_id).toBe(testProjectId);
    } finally {
      // Clean up
      if (sessionId) {
        await db.query('DELETE FROM analytics_events WHERE session_id = $1', [sessionId]);
        await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      }
    }
  });

  test('session_status returns proper data', async () => {
    let sessionId: string | undefined;

    try {
      sessionId = await SessionTracker.startSession(testProjectId);

      const status = await SessionManagementHandler.getSessionStatus();
      expect(status.success).toBeTruthy();
      expect(status.session).toBeDefined();
      expect(status.session.id).toBe(sessionId);
      expect(status.session.project_name).toBe(testProjectName);
      expect(status.session).toHaveProperty('duration_minutes');
      expect(status.session).toHaveProperty('contexts_created');
      expect(status.session).toHaveProperty('decisions_created');
    } finally {
      // Clean up
      if (sessionId) {
        await db.query('DELETE FROM analytics_events WHERE session_id = $1', [sessionId]);
        await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      }
    }
  });

  test('analytics events are properly linked to sessions', async () => {
    let sessionId: string | undefined;

    try {
      sessionId = await SessionTracker.startSession(testProjectId);

      // Simulate some activity
      await db.query(`
        INSERT INTO analytics_events (actor, event_type, session_id, project_id, metadata)
        VALUES ('test', 'test_event', $1, $2, '{}')
      `, [sessionId, testProjectId]);

      const { rows } = await db.query(`
        SELECT COUNT(*) FROM analytics_events WHERE session_id = $1 AND project_id = $2
      `, [sessionId, testProjectId]);

      expect(parseInt(rows[0].count)).toBeGreaterThan(1); // Should include session_start + test_event
    } finally {
      // Clean up
      if (sessionId) {
        await db.query('DELETE FROM analytics_events WHERE session_id = $1', [sessionId]);
        await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      }
    }
  });

  test('session operation recording works correctly', async () => {
    let sessionId: string | undefined;

    try {
      sessionId = await SessionTracker.startSession(testProjectId);

      await SessionTracker.recordOperation(sessionId, 'context_creation');

      const { rows } = await db.query(`
        SELECT COUNT(*) FROM analytics_events
        WHERE session_id = $1 AND event_type = 'session_operation_context_creation'
      `, [sessionId]);

      expect(parseInt(rows[0].count)).toBe(1);
    } finally {
      // Clean up
      if (sessionId) {
        await db.query('DELETE FROM analytics_events WHERE session_id = $1', [sessionId]);
        await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      }
    }
  });

  test('session data retrieval includes all metrics', async () => {
    let sessionId: string | undefined;

    try {
      sessionId = await SessionTracker.startSession(testProjectId);

      // Simulate some operations
      await SessionTracker.recordOperation(sessionId, 'context_creation');
      SessionTracker.recordContextCreated(sessionId); // Update in-memory tracking
      await SessionTracker.recordOperation(sessionId, 'decision_creation');

      // End session to calculate productivity score
      await SessionTracker.endSession(sessionId);

      const sessionData = await SessionTracker.getSessionData(sessionId);

      expect(sessionData).toBeTruthy();
      expect(sessionData!.session_id).toBe(sessionId);
      expect(sessionData!.project_id).toBe(testProjectId);
      expect(sessionData!.success_status).toBe('completed'); // Changed from 'active' since we ended it
      expect(sessionData!.operations_count).toBeGreaterThan(0);
      expect(sessionData!.productivity_score).toBeGreaterThan(0);
    } finally {
      // Clean up
      if (sessionId) {
        await db.query('DELETE FROM analytics_events WHERE session_id = $1', [sessionId]);
        await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      }
    }
  });

  test('session ending updates all metrics correctly', async () => {
    let sessionId: string | undefined;

    try {
      sessionId = await SessionTracker.startSession(testProjectId);

      // Simulate operations
      await SessionTracker.recordOperation(sessionId, 'context_creation');

      const endedSession = await SessionTracker.endSession(sessionId);

      expect(endedSession.session_id).toBe(sessionId);
      expect(endedSession.success_status).toBe('completed');
      expect(endedSession.end_time).toBeDefined();
      expect(endedSession.duration_ms).toBeGreaterThan(0);

      // Verify in database
      const { rows } = await db.query('SELECT ended_at FROM sessions WHERE id = $1', [sessionId]);
      expect(rows[0].ended_at).toBeTruthy();
    } finally {
      // Clean up
      if (sessionId) {
        await db.query('DELETE FROM analytics_events WHERE session_id = $1', [sessionId]);
        await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      }
    }
  });

  test('create new session with title and project works', async () => {
    const testTitle = 'Test Session Title';
    let sessionId: string | undefined;

    try {
      const result = await SessionManagementHandler.createNewSession(testTitle, testProjectName);

      expect(result.success).toBeTruthy();
      expect(result.sessionId).toBeTruthy();
      expect(result.projectName).toBe(testProjectName);
      expect(result.message).toContain(testTitle);

      sessionId = result.sessionId;

      // Verify in database
      if (sessionId) {
        const { rows } = await db.query('SELECT title, metadata FROM sessions WHERE id = $1', [sessionId]);
        expect(rows[0].title).toBe(testTitle);
        expect(rows[0].metadata.custom_title).toBe(true);
      }
    } finally {
      // Clean up
      if (sessionId) {
        await db.query('DELETE FROM analytics_events WHERE session_id = $1', [sessionId]);
        await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      }
    }
  });

  test('session assignment fails with invalid project name', async () => {
    let sessionId: string | undefined;

    try {
      sessionId = await SessionTracker.startSession();

      const result = await SessionManagementHandler.assignSessionToProject('NonExistentProject');

      expect(result.success).toBeFalsy();
      expect(result.message).toContain('not found');
      expect(result.message).toContain('Available projects');
    } finally {
      // Clean up
      if (sessionId) {
        await db.query('DELETE FROM analytics_events WHERE session_id = $1', [sessionId]);
        await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      }
    }
  });

  test('session status returns error when no active session', async () => {
    // Ensure no active session
    (SessionTracker as any).activeSessionId = null;
    
    const status = await SessionManagementHandler.getSessionStatus();
    
    expect(status.success).toBeFalsy();
    expect(status.message).toBe('No active session found');
  });

  test('session statistics calculation is accurate', async () => {
    const sessionIds: string[] = [];

    try {
      // Create multiple test sessions
      for (let i = 0; i < 3; i++) {
        const sessionId = await SessionTracker.startSession(testProjectId);
        sessionIds.push(sessionId);

        // Add some operations
        await SessionTracker.recordOperation(sessionId, 'context_creation');
        SessionTracker.recordContextCreated(sessionId); // Update in-memory tracking
        await SessionTracker.recordOperation(sessionId, 'decision_creation');

        // End the session
        await SessionTracker.endSession(sessionId);
      }

      const stats = await SessionTracker.getSessionStats(testProjectId);

      expect(stats.totalSessions).toBeGreaterThanOrEqual(3);
      expect(stats.avgDuration).toBeGreaterThan(0);
      expect(stats.productivityScore).toBeGreaterThan(0);
      expect(stats.retentionRate).toBeGreaterThan(0);
    } finally {
      // Clean up
      for (const sessionId of sessionIds) {
        await db.query('DELETE FROM analytics_events WHERE session_id = $1', [sessionId]);
        await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      }
    }
  });

  test('active session detection works correctly', async () => {
    let sessionId: string | undefined;

    try {
      // Start session
      sessionId = await SessionTracker.startSession(testProjectId);

      // Should return the same session ID
      const activeId = await SessionTracker.getActiveSession();
      expect(activeId).toBe(sessionId);

      // End session
      await SessionTracker.endSession(sessionId);

      // Should not return ended session as active
      const activeIdAfterEnd = await SessionTracker.getActiveSession();
      expect(activeIdAfterEnd).toBeNull();
    } finally {
      // Clean up
      if (sessionId) {
        await db.query('DELETE FROM analytics_events WHERE session_id = $1', [sessionId]);
        await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      }
    }
  });

  test('session productivity calculation is correct', async () => {
    let sessionId: string | undefined;

    try {
      sessionId = await SessionTracker.startSession(testProjectId);

      // Create contexts and decisions with known counts using proper API
      await SessionTracker.recordOperation(sessionId, 'context_creation');
      await SessionTracker.recordOperation(sessionId, 'context_creation');
      await SessionTracker.recordOperation(sessionId, 'decision_creation');

      const productivity = await SessionTracker.calculateProductivity(sessionId);

      // Formula: (contexts * 2 + decisions * 3) / (duration_hours + 1)
      // Should be: (2 * 2 + 1 * 3) / (very_small_duration + 1) ≈ 7
      expect(productivity).toBeGreaterThan(0);
      expect(productivity).toBeLessThan(10); // Should be reasonable
    } finally {
      // Clean up
      if (sessionId) {
        await db.query('DELETE FROM analytics_events WHERE session_id = $1', [sessionId]);
        await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      }
    }
  });
});
