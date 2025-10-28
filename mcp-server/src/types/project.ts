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
  gitRepoUrl?: string;
  rootDirectory?: string;
  metadata?: Record<string, any>;
}

export interface SessionState {
  currentProjectId: string | null;
  sessionId?: string;
  agentType?: string;
  manualOverride?: boolean;  // Track if user manually switched (vs auto-initialized)
}
