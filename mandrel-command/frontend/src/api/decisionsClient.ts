import {
  DecisionsService,
  type ApiSuccessResponse,
  type DecisionEntity,
} from './generated';
import type {
  CreateDecisionRequest,
  DecisionSearchResponse,
  DecisionStats as GeneratedDecisionStats,
  UpdateDecisionRequest,
} from './generated';
import type {
  DecisionSearchParams,
  DecisionSearchResult,
  DecisionStats,
  TechnicalDecision,
} from '../components/decisions/types';

const UNASSIGNED_PROJECT_ID = '00000000-0000-0000-0000-000000000000';

const ensureSuccess = <T extends ApiSuccessResponse>(response: T, failureMessage: string): T => {
  if (!response.success) {
    throw new Error(failureMessage);
  }
  return response;
};

const normalizeDecision = (entity: DecisionEntity): TechnicalDecision => {
  return {
    id: entity.id, // Keep as UUID string
    project_id: entity.project_id ?? UNASSIGNED_PROJECT_ID,
    project_name: entity.project_name,
    title: entity.title,
    problem: entity.problem,
    decision: entity.decision,
    rationale: entity.rationale,
    alternatives: entity.alternatives,
    status: entity.status as TechnicalDecision['status'],
    outcomeStatus: entity.outcomeStatus as TechnicalDecision['outcomeStatus'] | undefined,
    outcomeNotes: entity.outcomeNotes,
    lessonsLearned: entity.lessonsLearned,
    supersededBy: entity.supersededBy,
    supersededReason: entity.supersededReason,
    outcome: entity.outcome,
    lessons: entity.lessons,
    created_at: entity.created_at,
    updated_at: entity.updated_at,
    created_by: entity.created_by,
    updated_by: entity.updated_by,
    tags: entity.tags ?? [],
  };
};

const buildSearchResult = (
  data: DecisionSearchResponse | undefined,
  params: DecisionSearchParams
): DecisionSearchResult => {
  const decisions = (data?.decisions ?? []).map(normalizeDecision);
  const total = data?.total ?? 0;
  const limit = data?.limit ?? params.limit ?? 20;
  const offset = params.offset ?? 0;
  const page = data?.page ?? Math.floor(offset / limit) + 1;

  return {
    decisions,
    total,
    limit,
    page,
  };
};

export const decisionsClient = {
  async search(params: DecisionSearchParams): Promise<DecisionSearchResult> {
    const response = ensureSuccess(
      await DecisionsService.getDecisions({
        query: params.query,
        status: params.status as any,
        projectId: params.project_id,
        createdBy: params.created_by,
        dateFrom: params.date_from,
        dateTo: params.date_to,
        limit: params.limit,
        offset: params.offset,
      }) as ApiSuccessResponse & { data?: DecisionSearchResponse },
      'Failed to search decisions'
    );

    return buildSearchResult(response.data, params);
  },

  async getDecision(decisionId: string): Promise<TechnicalDecision> {
    const response = ensureSuccess(
      await DecisionsService.getDecisions1({ id: decisionId }) as ApiSuccessResponse & {
        data?: DecisionEntity;
      },
      'Failed to fetch decision'
    );

    if (!response.data) {
      throw new Error('Decision payload missing in response');
    }

    return normalizeDecision(response.data);
  },

  async createDecision(payload: CreateDecisionRequest) {
    return DecisionsService.postDecisions({ requestBody: payload });
  },

  async updateDecision(decisionId: string, updates: UpdateDecisionRequest): Promise<void> {
    const payload: Record<string, unknown> = { ...updates };

    if (updates.outcomeNotes && !('outcome' in payload)) {
      payload.outcome = updates.outcomeNotes;
    }

    if (updates.lessonsLearned && !('lessons' in payload)) {
      payload.lessons = updates.lessonsLearned;
    }

    await DecisionsService.putDecisions({
      id: decisionId,
      requestBody: payload as UpdateDecisionRequest,
    });
  },

  async deleteDecision(decisionId: string): Promise<void> {
    await DecisionsService.deleteDecisions({ id: decisionId });
  },

  async getDecisionStats(projectId?: string): Promise<DecisionStats> {
    const response = ensureSuccess(
      await DecisionsService.getDecisionsStats({ projectId }) as ApiSuccessResponse & {
        data?: GeneratedDecisionStats;
      },
      'Failed to fetch decision statistics'
    );

    return (response.data ?? {}) as DecisionStats;
  },
};

export default decisionsClient;
