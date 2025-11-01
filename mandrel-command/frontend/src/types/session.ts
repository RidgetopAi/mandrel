import type { SessionEntity } from '../api/generated';

export interface Session extends SessionEntity {
  // SessionEntity now has all the fields we need, but we can add overrides if needed

  // Git integration (not in SessionEntity)
  active_branch?: string;
  working_commit_sha?: string;
}

export interface SessionDetail extends Session {
  session_id?: string;  // Backend returns session_id instead of id
  start_time?: string;  // Backend also uses start_time
  end_time?: string;    // Backend also uses end_time
  contexts?: Array<{
    id: string;
    type: string;
    content: string;
    created_at: string;
    tags?: string[];
  }>;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateSessionRequest {
  title?: string;
  description?: string;
  session_goal?: string;
  tags?: string[];
  ai_model?: string;
  project_id?: string;
}

export interface SessionFile {
  id: string;
  session_id: string;
  file_path: string;
  lines_added: number;
  lines_deleted: number;
  source: 'tool' | 'git' | 'manual';
  first_modified_at: string;
  last_modified_at: string;
}

export interface FileSyncResponse {
  success: boolean;
  data?: {
    sessionId: string;
    filesProcessed: number;
    totalLinesAdded: number;
    totalLinesDeleted: number;
    netChange: number;
    message: string;
  };
  error?: string;
}
