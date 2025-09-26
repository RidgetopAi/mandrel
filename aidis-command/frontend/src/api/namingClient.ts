import {
  NamingService,
  type ApiSuccessResponse,
  type NamingAvailabilityResponse,
  type NamingEntry as GeneratedNamingEntry,
  type NamingSearchResponse,
  type NamingStats as GeneratedNamingStats,
  type NamingSuggestion as GeneratedNamingSuggestion,
} from './generated';
import type {
  RegisterNamingRequest,
  UpdateNamingRequest,
} from './generated';
import type {
  NamingEntry,
  NamingSearchParams,
  NamingSearchResult,
  NamingStats,
  NamingSuggestion,
} from '../components/naming/types';

const UNASSIGNED_PROJECT_ID = '00000000-0000-0000-0000-000000000000';

const ensureSuccess = <T extends ApiSuccessResponse>(response: T, failureMessage: string): T => {
  if (!response.success) {
    throw new Error(failureMessage);
  }
  return response;
};

const normalizeEntry = (entry: GeneratedNamingEntry): NamingEntry => {
  const numericId = Number(entry.id);

  return {
    id: Number.isNaN(numericId) ? -1 : numericId,
    name: entry.name,
    type: entry.type as NamingEntry['type'],
    context: entry.context ?? undefined,
    project_id: entry.project_id ?? UNASSIGNED_PROJECT_ID,
    project_name: entry.project_name ?? undefined,
    status: entry.status as NamingEntry['status'],
    compliance_score: entry.compliance_score ?? 0,
    usage_count: entry.usage_count ?? 0,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
    created_by: entry.created_by ?? undefined,
    updated_by: entry.updated_by ?? undefined,
  };
};

const buildSearchResult = (
  data: NamingSearchResponse | undefined,
  params: NamingSearchParams
): NamingSearchResult => {
  const entries = (data?.entries ?? []).map(normalizeEntry);
  const total = data?.total ?? 0;
  const limit = data?.limit ?? params.limit ?? 20;
  const offset = params.offset ?? 0;
  const page = data?.page ?? Math.floor(offset / limit) + 1;

  return {
    entries,
    total,
    limit,
    page,
  };
};

const normalizeStats = (stats: GeneratedNamingStats | undefined): NamingStats => ({
  total_names: stats?.total_names ?? 0,
  compliance: stats?.compliance ?? 0,
  deprecated: stats?.deprecated ?? 0,
  recent_activity: stats?.recent_activity ?? 0,
  by_type: stats?.by_type ?? {},
  by_status: stats?.by_status ?? {},
  by_project: stats?.by_project ?? {},
  total_projects: stats?.total_projects ?? 0,
});

const normalizeSuggestions = (suggestions: GeneratedNamingSuggestion[] | undefined): NamingSuggestion[] =>
  (suggestions ?? []).map((suggestion) => ({
    suggested_name: suggestion.suggested_name,
    confidence: suggestion.confidence ?? 0,
    reason: suggestion.reason ?? '',
    alternatives: suggestion.alternatives ?? [],
  }));

const normalizeAvailability = (
  availability: NamingAvailabilityResponse | undefined
): { available: boolean; conflicts?: NamingEntry[]; message?: string } => ({
  available: availability?.available ?? false,
  message: availability?.message,
  conflicts: availability?.conflicts?.map(normalizeEntry),
});

export const namingClient = {
  async search(params: NamingSearchParams): Promise<NamingSearchResult> {
    const response = ensureSuccess(
      await NamingService.getNaming({
        query: params.query,
        type: params.type as any,
        status: params.status as any,
        projectId: params.project_id,
        createdBy: params.created_by,
        dateFrom: params.date_from,
        dateTo: params.date_to,
        limit: params.limit,
        offset: params.offset,
      }) as ApiSuccessResponse & { data?: NamingSearchResponse },
      'Failed to search naming entries'
    );

    return buildSearchResult(response.data, params);
  },

  async getEntry(id: string): Promise<NamingEntry> {
    const response = ensureSuccess(
      await NamingService.getNaming1({ id }) as ApiSuccessResponse & { data?: GeneratedNamingEntry },
      'Failed to fetch naming entry'
    );

    if (!response.data) {
      throw new Error('Naming entry payload missing in response');
    }

    return normalizeEntry(response.data);
  },

  async registerEntry(payload: RegisterNamingRequest): Promise<NamingEntry> {
    const response = ensureSuccess(
      await NamingService.postNamingRegister({ requestBody: payload }) as ApiSuccessResponse & {
        data?: GeneratedNamingEntry;
      },
      'Failed to register naming entry'
    );

    if (!response.data) {
      throw new Error('Naming registration payload missing in response');
    }

    return normalizeEntry(response.data);
  },

  async checkName(name: string): Promise<{ available: boolean; conflicts?: NamingEntry[]; message?: string }> {
    const response = ensureSuccess(
      await NamingService.getNamingCheck({ name }) as ApiSuccessResponse & {
        data?: NamingAvailabilityResponse;
      },
      'Failed to check name availability'
    );

    return normalizeAvailability(response.data);
  },

  async getSuggestions(name: string, _type?: string): Promise<NamingSuggestion[]> {
    const response = ensureSuccess(
      await NamingService.getNamingSuggest({ name }) as ApiSuccessResponse & {
        data?: GeneratedNamingSuggestion[];
      },
      'Failed to fetch naming suggestions'
    );

    return normalizeSuggestions(response.data);
  },

  async updateEntry(id: string, updates: UpdateNamingRequest): Promise<void> {
    await NamingService.putNaming({ id, requestBody: updates });
  },

  async deleteEntry(id: string): Promise<void> {
    await NamingService.deleteNaming({ id });
  },

  async getStats(projectId?: string): Promise<NamingStats> {
    const response = ensureSuccess(
      await NamingService.getNamingStats({ projectId }) as ApiSuccessResponse & {
        data?: GeneratedNamingStats;
      },
      'Failed to fetch naming statistics'
    );

    return normalizeStats(response.data);
  },
};

export default namingClient;
