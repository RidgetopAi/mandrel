/**
 * Shared Project Types
 *
 * Extracted to break circular dependency between:
 * - handlers/project.ts
 * - services/projectSwitchValidator.ts
 */

export interface ProjectInfo {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  gitRepoUrl: string | null;
  rootDirectory: string | null;
  metadata: Record<string, any>;
  contextCount?: number;
  isActive?: boolean;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  status?: string;
  gitRepoUrl?: string;
  rootDirectory?: string;
  metadata?: Record<string, any>;
}

export interface ProjectChildCounts {
  contexts: number;
  decisions: number;
  tasks: number;
  sessions: number;
  total: number;
}

export interface DeleteProjectResult {
  deleted: boolean;
  projectId?: string;
  projectName: string;
  counts: ProjectChildCounts;
  message: string;
}

/**
 * The per-session ACTIVE-THREAD ANCHOR (Mandrel Core Redesign T5b, task ce5d119c).
 *
 * The deterministic auto-threading anchor: while it is set, a context_store on this
 * session auto-threads its capture to the active task and/or decision (record → task
 * `informs`, record → decision `decided_by`) with ZERO tags — so a capture during an
 * active thread structurally CANNOT be born a graph leaf. Stored as RESOLVED full UUIDs
 * (the route resolves id8|uuid project-scoped before setting), keyed by connectionId
 * exactly like currentProjectId.
 */
export interface ActiveThreadAnchor {
  /** Resolved full UUID of the active task (record → task `informs`), or null. */
  taskId: string | null;
  /** Resolved full UUID of the active decision (record → decision `decided_by`), or null. */
  decisionId: string | null;
}

export interface SessionState {
  currentProjectId: string | null;
  sessionId?: string;
  agentType?: string;
  manualOverride?: boolean;  // Track if user manually switched (vs auto-initialized)
  /**
   * T5b — the active-thread anchor for this session (in-memory v1, consistent with
   * currentProjectId). Undefined/absent = no active thread. DB-backed persistence for
   * cross-restart durability is a deliberate future upgrade (a restart clears it today,
   * same as the in-memory current-project cache).
   */
  activeThread?: ActiveThreadAnchor;
}
