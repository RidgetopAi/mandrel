export interface TechnicalDecision {
  id: string; // UUID from database
  project_id: string;
  project_name?: string;
  title: string;
  problem: string;
  decision: string;
  rationale?: string;
  alternatives?: string[];
  status: 'active' | 'superseded' | 'deprecated' | 'under_review';
  outcomeStatus?: 'unknown' | 'successful' | 'failed' | 'mixed' | 'too_early';
  outcomeNotes?: string;
  lessonsLearned?: string;
  supersededBy?: string;
  supersededReason?: string;
  // Deprecated fields for backward compatibility
  outcome?: string;
  lessons?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface DecisionSearchParams {
  query?: string;
  project_id?: string;
  status?: string;
  created_by?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface DecisionSearchResult {
  decisions: TechnicalDecision[];
  total: number;
  page: number;
  limit: number;
}

export interface DecisionStats {
  total_decisions: number;
  by_status: Record<string, number>;
  by_project: Record<string, number>;
  recent_decisions: number;
  total_projects: number;
}
