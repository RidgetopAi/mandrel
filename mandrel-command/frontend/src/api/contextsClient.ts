import { ContextsService, type ApiSuccessResponse, OpenAPI } from './generated';
import type {
  Context,
  ContextSearchParams,
  ContextSearchResult,
  ContextStats,
} from '../types/context';

const ensureSuccess = <T extends ApiSuccessResponse>(response: T, failureMessage: string): T => {
  if (!response.success) {
    const errorMessage = (response as unknown as { error?: { message?: string } }).error?.message;
    throw new Error(errorMessage || failureMessage);
  }
  return response;
};

const serializeSearchParams = (params: ContextSearchParams) => {
  const {
    query,
    project_id,
    session_id,
    type,
    tags,
    min_similarity,
    date_from,
    date_to,
    limit,
    offset,
    sort_by,
    sort_order,
  } = params;

  return {
    query,
    projectId: project_id,
    sessionId: session_id,
    type: type as any,
    tags: tags?.length ? tags.join(',') : undefined,
    limit,
    offset,
    sortBy: sort_by,
    sortOrder: sort_order,
    // The API expects numeric min_similarity between 0-1
    min_similarity,
    date_from,
    date_to,
  } as Record<string, unknown>;
};

export const contextsClient = {
  async search(params: ContextSearchParams): Promise<ContextSearchResult> {
    const response = await ContextsService.getContexts(serializeSearchParams(params));
    const result = ensureSuccess(response, 'Failed to search contexts');
    const data = result.data ?? { contexts: [], total: 0 };
    const limit = data.limit ?? params.limit ?? 20;
    const offset = data.offset ?? params.offset ?? 0;

    return {
      contexts: (data.contexts ?? []) as Context[],
      total: data.total ?? 0,
      limit,
      offset,
      page: Math.floor(offset / limit) + 1,
    };
  },

  async semanticSearch(params: ContextSearchParams): Promise<ContextSearchResult> {
    const response = await ContextsService.postContextsSearch({ requestBody: params });
    const result = ensureSuccess(response, 'Failed to perform semantic context search');
    const data = result.data ?? { contexts: [], total: 0 };
    const limit = data.limit ?? params.limit ?? 20;
    const offset = data.offset ?? params.offset ?? 0;

    return {
      contexts: (data.contexts ?? []) as Context[],
      total: data.total ?? 0,
      limit,
      offset,
      page: Math.floor(offset / limit) + 1,
    };
  },

  async getContext(id: string): Promise<Context> {
    const response = await ContextsService.getContexts1({ id });
    const result = ensureSuccess(response, 'Failed to fetch context');
    const context = result.data;

    if (!context) {
      throw new Error('Context payload missing in response');
    }

    return context as Context;
  },

  async updateContext(
    id: string,
    updates: {
      content?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
      relevance_score?: number;
      project_id?: string;
    }
  ): Promise<Context> {
    const response = await ContextsService.putContexts({ id, requestBody: updates });
    const result = ensureSuccess(response, 'Failed to update context');
    const context = result.data;

    if (!context) {
      throw new Error('Context update payload missing in response');
    }

    return context as Context;
  },

  async deleteContext(id: string): Promise<void> {
    const response = await ContextsService.deleteContexts({ id });
    ensureSuccess(response as ApiSuccessResponse, 'Failed to delete context');
  },

  async bulkDeleteContexts(ids: string[]): Promise<{ deleted: number }> {
    const response = await ContextsService.deleteContextsBulkDelete({ requestBody: { ids } });
    const result = ensureSuccess(response as ApiSuccessResponse & { data?: { deleted: number } }, 'Failed to bulk delete contexts');
    return result.data ?? { deleted: 0 };
  },

  async getContextStats(): Promise<ContextStats> {
    const response = await ContextsService.getContextsStats();
    const result = ensureSuccess(response, 'Failed to fetch context statistics');
    return (result.data ?? {}) as ContextStats;
  },

  async getRelatedContexts(id: string): Promise<Context[]> {
    const response = await ContextsService.getContextsRelated({ id });
    const result = ensureSuccess(response, 'Failed to fetch related contexts');
    return (result.data ?? []) as Context[];
  },

  async exportContexts(params: ContextSearchParams, format: 'json' | 'csv' | 'md' = 'json'): Promise<Blob> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) {
        query.set(key, value.join(','));
      } else {
        query.set(key, String(value));
      }
    });
    query.set('format', format);

    const baseUrl = OpenAPI.BASE ?? '';
    const endpoint = baseUrl.replace(/\/$/, '') + `/contexts/export?${query.toString()}`;
    const token = typeof window !== 'undefined' ? localStorage.getItem('aidis_token') : undefined;

    const response = await fetch(endpoint, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error('Failed to export contexts');
    }

    return response.blob();
  },

  downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.style.display = 'none';
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(anchor);
  },
};

export default contextsClient;
