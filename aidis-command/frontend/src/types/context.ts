import type { ContextEntity, ContextSearchResponse, ContextStats as GeneratedContextStats } from '../api/generated';

export type Context = ContextEntity & {
  project_name?: string;
  session_title?: string;
  session_id?: string;
  session_type?: string;
  summary?: string;
};

export interface ContextSearchResult extends Omit<ContextSearchResponse, 'contexts'> {
  contexts: Context[];
  limit?: number;
  offset?: number;
  page?: number;
}

export interface ContextStats extends Partial<GeneratedContextStats> {
  total_contexts?: number;
  by_type?: Record<string, number>;
  by_project?: Record<string, number>;
  recent_contexts?: number;
  total_projects?: number;
}

export interface ContextSearchParams {
  query?: string;
  project_id?: string;
  session_id?: string;
  type?: string;
  tags?: string[];
  min_similarity?: number;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
  sort_by?: 'created_at' | 'relevance' | 'updated_at';
  sort_order?: 'asc' | 'desc';
}
