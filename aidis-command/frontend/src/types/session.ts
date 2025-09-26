import type { SessionEntity } from '../api/generated';

export interface Session extends SessionEntity {
  project_name?: string;
  session_type?: string;
  context_count?: number;
  last_context_at?: string;
}

export interface SessionDetail extends Session {
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
}
