/**
 * Session module types
 * Re-exports shared types and defines internal types
 */

export type { SessionStats, SessionActivity, SessionFile, ProductivityConfig } from '../../types/session.js';

export interface SessionData {
  session_id: string;
  start_time: Date;
  end_time?: Date;
  duration_ms?: number;
  project_id?: string;
  title?: string;
  description?: string;
  contexts_created: number;
  decisions_created: number;
  operations_count: number;
  productivity_score: number;
  success_status: 'active' | 'completed' | 'abandoned';
  status: 'active' | 'inactive' | 'disconnected';
  last_activity_at?: Date;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  session_goal?: string | null;
  tags?: string[];
  lines_added?: number;
  lines_deleted?: number;
  lines_net?: number;
  ai_model?: string | null;
  files_modified_count?: number;
  activity_count?: number;
}
