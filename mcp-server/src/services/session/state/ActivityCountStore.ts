/**
 * In-memory store for session activity counts
 * Tracks task/context creation before flushing to database
 */

export interface ActivityCounts {
  tasks_created: number;
  tasks_updated: number;
  tasks_completed: number;
  contexts_created: number;
}

const sessionActivity: Map<string, ActivityCounts> = new Map();

const defaultCounts = (): ActivityCounts => ({
  tasks_created: 0,
  tasks_updated: 0,
  tasks_completed: 0,
  contexts_created: 0
});

export const ActivityCountStore = {
  get(sessionId: string): ActivityCounts {
    return sessionActivity.get(sessionId) || defaultCounts();
  },

  incrementTasksCreated(sessionId: string): void {
    const counts = sessionActivity.get(sessionId) || defaultCounts();
    counts.tasks_created++;
    sessionActivity.set(sessionId, counts);
  },

  incrementTasksUpdated(sessionId: string, isCompleted: boolean = false): void {
    const counts = sessionActivity.get(sessionId) || defaultCounts();
    counts.tasks_updated++;
    if (isCompleted) {
      counts.tasks_completed++;
    }
    sessionActivity.set(sessionId, counts);
  },

  incrementContextsCreated(sessionId: string): void {
    const counts = sessionActivity.get(sessionId) || defaultCounts();
    counts.contexts_created++;
    sessionActivity.set(sessionId, counts);
  },

  clear(sessionId: string): void {
    sessionActivity.delete(sessionId);
  },

  getAll(): Map<string, ActivityCounts> {
    return new Map(sessionActivity);
  },

  clearAll(): void {
    sessionActivity.clear();
  },

  has(sessionId: string): boolean {
    return sessionActivity.has(sessionId);
  },

  getSessionIds(): string[] {
    return Array.from(sessionActivity.keys());
  }
};
